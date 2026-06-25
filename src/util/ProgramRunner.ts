import type { Dispatch, SetStateAction } from 'react';
import AppDatabase, { ProgramRow } from './AppDatabase';
import HoylandController from './HoylandController';


type ProgressCallback = (currentStep: number, totalSteps: number, minutesRemaining: number) => void;

const asBool = (v: number | boolean | undefined) => !!Number(v);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Minimum gap between two consecutive frequency writes (CH1 then CH2). The
// FY6600 misses the first of two commands arriving back-to-back while a
// program is running: per-frequency custom programs stepped CH2 correctly but
// left CH1 stuck on its first frequency (10 Jun report) because WFF followed
// WMF after only the 5 ms device-side settle. 50 ms is the registration
// interval already field-proven by set_channels_output's pulse toggling.
const FREQ_PAIR_GAP_MS = 50;

// Gap between the (already-set) frequency pair and a per-step waveform switch.
// A waveform switch re-latches each channel's frequency from a snapshot taken
// when the switch executes; a frequency write that hasn't "committed" by then is
// reverted to the old value. CH1's write commits (~110 ms before the switch) and
// survives, but CH2's — set last, only ~55 ms before the switch — did not, so CH2
// kept the previous frequency on every sq↔sine step (25 Jun report; same-waveform
// steps were fine because no switch is sent). 200 ms gives CH2 the same safe
// margin CH1 already has. Only paid on steps that actually change waveform.
const WAVEFORM_SWITCH_GAP_MS = 200;

// small helpers
const num = (v: unknown, fallback: number) => {
    if (v === null || v === undefined) return fallback;
    const n = typeof v === 'string' ? parseFloat(v) : Number(v);
    return Number.isFinite(n) ? n : fallback;
};
const clampAndSnap = (value: number, min: number, max: number, step: number) => {
    const lo = Math.min(min, max), hi = Math.max(min, max);
    const s = step > 0 ? step : 1;
    const clamped = Math.min(Math.max(value, lo), hi);
    const steps = Math.round((clamped - lo) / s);
    return +(lo + steps * s).toFixed(6);
};

export default class ProgramRunner {
    private running = false;
    private paused = false;
    private pauseStart = 0;
    private pausedTotal = 0;

    /** UI-selected intensity; null means “not specified by UI” */
    private intensity: number | null = null;

    private onProgress: ProgressCallback | null;
    private onStop: (() => void) | null = null;

    private readonly amplitudeSupportsChannel: boolean;

    constructor(
        private db: AppDatabase,
        private gen: HoylandController,
        progressCallback: ProgressCallback | null = null
    ) {
        this.onProgress = progressCallback;
        this.amplitudeSupportsChannel = (this.gen.setAmplitude.length ?? 0) > 1;
    }

    async loadProgram(name: string): Promise<ProgramRow | null> {
        try { return await this.db.loadData(name); } catch { return null; }
    }

    setProgressCallback(cb: ProgressCallback) { this.onProgress = cb; }
    setOnStopCallback(cb: () => void) { this.onStop = cb; }

    /** Set CH1 frequency, then optionally CH2, paced FREQ_PAIR_GAP_MS apart. */
    private async setFrequencyPair(ch1Hz: number, ch2Hz: number | null) {
        await this.gen.setFrequency(1, ch1Hz);
        if (ch2Hz != null) {
            await sleep(FREQ_PAIR_GAP_MS);
            // A stop during the gap must not write after stopAndReset's cleanup.
            // Paused runs still write so the channels never desync.
            if (!this.running) return;
            await this.gen.setFrequency(2, ch2Hz);
        }
    }

    /** Send amplitude to one or both channels using controller overloads */
    private async sendAmp(channel: number, amp: number) {
        if (!Number.isFinite(amp)) return;
        // HoylandController.setAmplitude supports (amp) and (channel, amp)
        // Prefer the explicit channel version
        if (this.amplitudeSupportsChannel) {
            await this.gen.setAmplitude(channel, amp);
        } else {
            await this.gen.setAmplitude(amp);
        }
    }

    /**
     * Explicitly set the desired intensity.
     * Set applyNow=false if you want to defer sending until after device init/sync.
     */
    async setIntensity(v: number, opts: { applyNow?: boolean } = {}) {
        const { applyNow = true } = opts;
        this.intensity = v;
        if (applyNow) await this.sendAmp(1, v);
    }

    private reportProgress(donePct: number, totalPct = 100, minsRemaining = 0) {
        this.onProgress?.(donePct, totalPct, minsRemaining);
    }

    /**
     * Apply intensity:
     * - if explicitly set (number) → use it;
     * - else → default to 25% of [sliderMinV, sliderMaxV] (fallback 1..20), snapped to sliderStepV.
     */
    private async applyCurrentIntensity(program?: ProgramRow) {
        let amp = this.intensity;
        if (amp == null) {
            const min = num(program?.sliderMinV, 1);
            const max = num(program?.sliderMaxV, 20);
            const step = num(program?.sliderStepV, 1);
            amp = clampAndSnap(min + 0.25 * (max - min), min, max, step);
        }
        const mirror = asBool(program?.mirror);
        await this.sendAmp(1, amp);
        if (mirror) await this.sendAmp(2, amp);
    }

    /** Ultrasound special: toggle 0.5 / 0.67 MHz; keep waveform SQUARE (no sine call). */
    async runSpecialCase(setRunningFrequency: Dispatch<SetStateAction<string>>) {
        this.running = true;
        this.paused = false;

        const totalMs = 9 * 60 * 1000;
        const start = Date.now();
        let lastPct = -1;

        const update = () => {
            const elapsed = Date.now() - start - this.pausedTotal;
            const pct = Math.floor((elapsed / totalMs) * 100);
            if (pct > lastPct) {
                lastPct = pct;
                this.reportProgress(pct, 100, (totalMs - elapsed) / 60000);
            }
        };

        const tickMs = 1000;
        while (this.running && Date.now() - start - this.pausedTotal < totalMs) {
            while (this.paused && this.running) await sleep(100);
            if (!this.running) break;

            await this.gen.setFrequency(1, 0.5 * 1_000_000);
            setRunningFrequency(`${0.5 * 1_000_000} Hz`);
            await sleep(tickMs);

            await this.gen.setFrequency(1, 0.67 * 1_000_000);
            setRunningFrequency(`${0.67 * 1_000_000} Hz`);
            await sleep(tickMs);

            update();
        }

        if (this.running) await this.gen.stopAndReset();
        this.running = false;
        this.onStop?.();
    }

    async initializeChannel1() { await this.gen.sendInitialCommands(); }
    async initializeChannel0() { await this.gen.sendSecondaryCommands(); }

    async setChannel1StartFrequency(programName: string) {
        const program = await this.loadProgram(programName);
        if (program && program.startFrequency > 0) {
            await this.gen.setFrequency(2, program.startFrequency * 1_000_000);
        }
    }

    async startProgram(programName: string, setRunningFrequency: Dispatch<SetStateAction<string>>) {
        const program = await this.loadProgram(programName);
        if (!program) { console.error(`Program ${programName} not found`); return; }

        this.running = true;
        this.paused = false;
        this.pausedTotal = 0;

        const totalMs = Math.max(1, program.maxTimeInMinutes * 60 * 1000);
        const start = Date.now();

        // progress updater
        const progressLoop = (async () => {
            while (this.running) {
                if (!this.paused) {
                    const elapsed = Date.now() - start - this.pausedTotal;
                    const pct = (elapsed / totalMs) * 100;
                    this.reportProgress(pct, 100, (totalMs - elapsed) / 60000);
                    if (elapsed >= totalMs) break;
                }
                await sleep(50);
            }
        })();




        if (program.name.toLowerCase() === 'ultrasound') {
            // Ensure amplitude and frequency are set BEFORE outputs are enabled
            await this.applyCurrentIntensity(program);
            const initialHz = Math.round(0.5 * 1_000_000);
            await this.gen.setFrequency(1, initialHz);
            setRunningFrequency(`${initialHz} Hz`);
            await this.gen.setBothChannelsToSquareWave();
            await this.gen.sync();
            await this.gen.enableOutputs();
            await this.runSpecialCase(setRunningFrequency);
        } else {
            const nameLc = program.name.toLowerCase();
            let initialHz: number | null = null;
            if (nameLc.includes('ultra500')) initialHz = 0.5 * 1_000_000;
            else if (nameLc.includes('ultra670')) initialHz = 0.67 * 1_000_000;

            const isRange = asBool(program.range) && program.data.length === 2;
            if (initialHz == null) {
                if (isRange) {
                    const [startItem] = program.data as [ProgramRow['data'][number], ProgramRow['data'][number]];
                    initialHz = Number(startItem?.frequency);
                } else if (program.data.length > 0) {
                    initialHz = Number(program.data[0]?.frequency);
                }
            }

            // Per-frequency waveform (editor "sine/square per frequency"): when any data
            // item carries its own wavetype, the program drives that waveform per step on
            // BOTH channels at the step's frequency. Backward-compatible — programs without
            // per-item wavetype keep the program-level waveform logic. (Lynne 9 Jun)
            const hasItemWaveform = program.data.some(
                (it) => it.wavetype === 'SINE' || it.wavetype === 'SQUARE'
            );
            // Only switch waveform when the step actually changes it. Re-asserting
            // sine every step left the device unable to take the frequency pair
            // that followed (Rob 12 Jun: sine→sine steps kept the old frequency
            // while square→square steps were fine — the firmware drops or reverts
            // frequency writes that land in a sine switch's settle window).
            // Returns true when a switch was actually sent.
            let appliedWavetype: 'SINE' | 'SQUARE' | undefined;
            const applyItemWaveform = async (wt?: 'SINE' | 'SQUARE'): Promise<boolean> => {
                if ((wt !== 'SINE' && wt !== 'SQUARE') || wt === appliedWavetype) return false;
                // Let BOTH frequency writes (CH1 and CH2) commit before the switch
                // re-latches them — CH2 is set last and needs the same margin CH1
                // has, or it reverts to the previous frequency (25 Jun). Never write
                // after a stop's stopAndReset cleanup.
                await sleep(WAVEFORM_SWITCH_GAP_MS);
                if (!this.running) return false;
                if (wt === 'SINE') await this.gen.setBothChannelsToSineWave();
                else await this.gen.setBothChannelsToSquareWave();
                appliedWavetype = wt;
                return true;
            };

            // CH2-mirrors-CH1: a no-carrier (startFrequency===0) SINE/SINE program
            // (lymphocyte50Hz, tCells30Hz) must drive CH2 at the SAME frequency as CH1,
            // not leave it at the 3.1 MHz init carrier (WFF3100000 from INITIAL_COMMANDS).
            // Per-frequency-waveform programs mirror too, so both channels output each
            // step's frequency. Otherwise scoped to SINE/SINE + no-carrier so the square
            // PEMF programs and carrier programs (insomnia) are untouched. (Lynne 4/9 Jun)
            const mirrorCh2ToCh1 =
                hasItemWaveform ||
                (program.channel1wavetype === 'SINE' &&
                    program.channel2wavetype === 'SINE' &&
                    program.startFrequency === 0);

            // Apply amplitude and BOTH channel frequencies BEFORE enabling outputs,
            // so the device doesn't briefly output the previous program's frequencies.
            await this.applyCurrentIntensity(program);
            if (initialHz != null && Number.isFinite(initialHz)) {
                await this.setFrequencyPair(initialHz, mirrorCh2ToCh1 ? initialHz : null);
                setRunningFrequency(`${initialHz} Hz`);
            }
            if (program.startFrequency > 0) {
                await sleep(FREQ_PAIR_GAP_MS);
                await this.gen.setFrequency(2, program.startFrequency * 1_000_000);
            }

            // Set waveform.
            // - SINE+SINE → both sine, asserted explicitly so CH1 doesn't inherit the
            //   square left over from SECONDARY_COMMANDS' WMW01 init. Checked FIRST: a
            //   no-carrier (startFrequency===0) SINE/SINE program such as lymphocyte50Hz
            //   / tCells30Hz was previously shadowed by the startFrequency===0 square
            //   trigger and wrongly emitted square. (Lynne 2 Jun)
            // - ultra*/no-carrier/SQUARE+SQUARE → both square + sync.
            // - otherwise → fall back to sinewave() if CH1 declared SINE.
            const ch1Sine = program.channel1wavetype === 'SINE';
            const ch2Sine = program.channel2wavetype === 'SINE';
            const ch1Square = program.channel1wavetype === 'SQUARE';
            const ch2Square = program.channel2wavetype === 'SQUARE';
            if (hasItemWaveform) {
                // Per-frequency waveform: assert the first step's waveform before outputs
                // enable; the run loop switches waveform only when a step changes it.
                // No sync() here — like the SINE/SINE path, both channels are driven
                // explicitly. (enableOutputs' USA2 is amplitude sync only, per protocol.)
                await applyItemWaveform(program.data[0]?.wavetype);
            } else if (!nameLc.includes('ultra') && ch1Sine && ch2Sine) {
                await this.gen.setBothChannelsToSineWave();
            } else if (nameLc.includes('ultra') || program.startFrequency === 0 ||
                (ch1Square && ch2Square)) {
                await this.gen.setBothChannelsToSquareWave();
                await this.gen.sync();
            } else if (ch1Sine) {
                await this.gen.sinewave();
            }

            // Enable outputs LAST — after all settings are configured
            await this.gen.enableOutputs();

            if (isRange) {
                const [startItem, endItem] = program.data as [ProgramRow['data'][number], ProgramRow['data'][number]];
                const startF = Number(startItem?.frequency);
                const endF = Number(endItem?.frequency);
                const direction = startF <= endF ? 1 : -1;
                const totalSteps = Math.abs(endF - startF);
                const stepSize = direction;
                const interval = Math.max(1, Math.floor(totalMs / totalSteps));

                const condition = direction > 0
                    ? (f: number) => f <= endF
                    : (f: number) => f >= endF;

                for (let f = startF; this.running && condition(f); f += stepSize) {
                    while (this.paused && this.running) await sleep(100);
                    if (!this.running) break;

                    // Deadline starts BEFORE the paced pair so FREQ_PAIR_GAP_MS is
                    // absorbed into the dwell — mirrored sweeps keep their nominal
                    // step cadence instead of gaining 50ms per step.
                    const rangeEnd = Date.now() + interval;
                    await this.setFrequencyPair(Math.round(f), mirrorCh2ToCh1 ? Math.round(f) : null);
                    setRunningFrequency(`${Math.round(f)} Hz`);
                    while (this.running && Date.now() < rangeEnd) {
                        while (this.paused && this.running) await sleep(100);
                        if (!this.running) break;
                        await sleep(5);
                    }
                }
            } else {
                // Loop the whole sequence until the configured duration elapses
                // for loop programs (TTF: 6 frequencies × 3 min, repeated for
                // 12 h). The do…while runs the body exactly once for non-loop
                // programs (loop falsy → condition fails after the first pass),
                // so existing programs are unchanged. Pause time is excluded via
                // pausedTotal so a paused loop still runs its full active duration.
                const isLoop = asBool(program.loop);
                // Total active playback time of one pass. A loop pass with no dwell
                // (all-zero runTimes) would spin against the wall clock, so a loop
                // program is required to have a positive-duration sequence.
                const seqMs = program.data.reduce((s, it) => s + num(it.runTime, 0), 0);
                const elapsedActive = () => Date.now() - start - this.pausedTotal;
                do {
                for (const item of program.data) {
                    if (!this.running) break;
                    while (this.paused && this.running) await sleep(100);
                    if (!this.running) break;
                    // Loop programs: don't START another step once the duration is up,
                    // so a 12h loop ends within one step of 12h rather than overshooting
                    // a whole pass. (Checked after the pause-wait so pausedTotal is current.)
                    if (isLoop && elapsedActive() >= totalMs) break;

                    const freq = Number(item.frequency);

                    if ('sweepTo' in item && item.sweepTo != null) {
                        const endF = Number(item.sweepTo);
                        const direction = freq <= endF ? 1 : -1;
                        const totalSteps = Math.abs(endF - freq);
                        if (totalSteps > 0) {
                            const interval = Math.max(1, Math.floor(item.runTime / totalSteps));
                            const condition = direction > 0
                                ? (f: number) => f <= endF
                                : (f: number) => f >= endF;
                            for (let f = freq; this.running && condition(f); f += direction) {
                                while (this.paused && this.running) await sleep(100);
                                if (!this.running) break;
                                // Deadline before the pair — see the range loop note.
                                let sweepEnd = Date.now() + interval;
                                await this.setFrequencyPair(Math.round(f), mirrorCh2ToCh1 ? Math.round(f) : null);
                                setRunningFrequency(`${Math.round(f)} Hz`);
                                // Waveform AFTER frequency (and only when it changes —
                                // a no-op past the first iteration): frequency writes
                                // landing in a sine switch's settle window don't take
                                // effect (Rob 12 Jun). When a switch does fire, re-arm
                                // the dwell so the device gets a full quiet interval
                                // after it before the next frequency write.
                                if (item.wavetype && await applyItemWaveform(item.wavetype)) {
                                    sweepEnd = Date.now() + interval;
                                }
                                while (this.running && Date.now() < sweepEnd) {
                                    while (this.paused && this.running) await sleep(100);
                                    if (!this.running) break;
                                    await sleep(5);
                                }
                            }
                        } else if (item.wavetype) {
                            // Degenerate sweep row (sweepTo === frequency): no sweep to
                            // run, but the row's waveform change still applies (matches
                            // pre-1.7.1 behavior where the waveform was set before the
                            // step-count guard).
                            await applyItemWaveform(item.wavetype);
                        }
                    } else {
                        const onMs = num(program.onkeysec, 0) * 1000;
                        const offMs = num(program.offkeysec, 0) * 1000;

                        if (onMs > 0 && offMs > 0) {
                            // Pulsed mode: toggle BOTH channels' frequencies between their
                            // target value and 0 Hz. Toggling outputs via WMN/WFN turned out
                            // to be unreliable on the FY6600 — once disabled, the channel
                            // sometimes refused to re-enable mid-program (1.6.7/1.6.8 reports).
                            // Setting frequency to 0 Hz produces DC, which is silent for the
                            // program's purpose and leaves the output enabled the whole time.
                            const ch2Hz = program.startFrequency > 0
                                ? program.startFrequency * 1_000_000
                                : 0;

                            const until = Date.now() + item.runTime;
                            while (this.running && Date.now() < until) {
                                while (this.paused && this.running) await sleep(100);
                                if (!this.running || Date.now() >= until) break;

                                await this.setFrequencyPair(freq, ch2Hz > 0 ? ch2Hz : null);
                                setRunningFrequency(`${freq} Hz`);
                                const onEnd = Math.min(Date.now() + onMs, until);
                                while (this.running && !this.paused && Date.now() < onEnd) await sleep(5);
                                if (!this.running || Date.now() >= until) break;

                                await this.setFrequencyPair(0, ch2Hz > 0 ? 0 : null);
                                setRunningFrequency(`${freq} Hz (off)`);
                                const offEnd = Math.min(Date.now() + offMs, until);
                                while (this.running && !this.paused && Date.now() < offEnd) await sleep(5);
                            }
                        } else {
                            // Continuous mode — frequency FIRST, waveform after, and only
                            // when the step changes it. With the old order (waveform,
                            // then frequency 600ms later) the frequency pair never took
                            // effect on steps switching TO sine — the firmware drops or
                            // reverts frequency writes that land in a sine switch's
                            // settle window, while square settles fast (Rob 12 Jun:
                            // sq→sq and sine→sq stepped fine, sq→sine and sine→sine
                            // kept the old frequency). At the top of a step the device
                            // has been idle for the whole previous dwell, so the
                            // frequencies land; a waveform switch then settles during
                            // this step's own dwell.
                            await this.setFrequencyPair(freq, mirrorCh2ToCh1 ? freq : null);
                            setRunningFrequency(`${freq} Hz`);
                            if (item.wavetype) await applyItemWaveform(item.wavetype);

                            const until = Date.now() + item.runTime;
                            while (this.running && Date.now() < until) {
                                while (this.paused && this.running) await sleep(100);
                                if (!this.running) break;
                                await sleep(5);
                            }
                        }
                    }
                    if (!this.running) break;
                }
                } while (
                    isLoop &&
                    this.running &&
                    seqMs > 0 &&
                    elapsedActive() < totalMs
                );
            }
        }

        await progressLoop;

        if (this.running) await this.gen.stopAndReset();
        this.running = false;
        this.paused = false;
        this.onStop?.();
    }

    pauseProgram() {
        if (!this.running || this.paused) return;
        this.paused = true;
        this.pauseStart = Date.now();
    }

    resumeProgram() {
        if (!this.running || !this.paused) return;
        this.paused = false;
        this.pausedTotal += Date.now() - this.pauseStart;
    }

    async stopProgram() {
        try { await this.gen.stopAndReset(); }
        finally { this.running = false; this.paused = false; this.onStop?.(); }
    }
}

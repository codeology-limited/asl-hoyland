import AppDatabase, { ProgramRow } from './AppDatabase';
import HoylandController from './HoylandController';

export type ChannelWave = 'SINE' | 'SQUARE';
export interface ChannelStatus { hz: number; wave: ChannelWave | null }
export interface RunStatus { ch1: ChannelStatus; ch2: ChannelStatus }
/** Live per-channel readout (frequency + waveform) for the UI display. */
export type RunStatusCallback = (status: RunStatus) => void;

/**
 * The readout a program STARTS with, for previewing on selection (before Start).
 * Mirrors startProgram's CH2-carrier and waveform resolution so the preview
 * matches what the run will actually drive.
 */
export function previewRunStatus(program: ProgramRow): RunStatus {
    const n = (v: unknown, f = 0) => {
        const x = typeof v === 'string' ? parseFloat(v) : Number(v);
        return Number.isFinite(x) ? x : f;
    };
    const firstFreq = n(program.data?.[0]?.frequency, 0);
    const ch2Independent = n(program.channel2frequency, 0);
    const ch2Hz = ch2Independent > 0
        ? ch2Independent
        : n(program.startFrequency, 0) > 0 ? n(program.startFrequency, 0) * 1_000_000 : firstFreq;
    const hasItemWave = (program.data ?? []).some(d => d.wavetype === 'SINE' || d.wavetype === 'SQUARE');
    const ch1Sine = program.channel1wavetype === 'SINE';
    const ch2Sine = program.channel2wavetype === 'SINE';
    const ch1Square = program.channel1wavetype === 'SQUARE';
    const ch2Square = program.channel2wavetype === 'SQUARE';
    const nameLc = (program.name || '').toLowerCase();
    const wave: ChannelWave =
        hasItemWave ? ((program.data[0]?.wavetype as ChannelWave) ?? 'SINE')
        : (!nameLc.includes('ultra') && ch1Sine && ch2Sine) ? 'SINE'
        : (nameLc.includes('ultra') || n(program.startFrequency, 0) === 0 || (ch1Square && ch2Square)) ? 'SQUARE'
        : ch1Sine ? 'SINE'
        : 'SQUARE';
    return { ch1: { hz: firstFreq, wave }, ch2: { hz: ch2Hz, wave } };
}


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
    async runSpecialCase(setRunningFrequency: RunStatusCallback) {
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
            setRunningFrequency({ ch1: { hz: 0.5e6, wave: 'SQUARE' }, ch2: { hz: 0.5e6, wave: 'SQUARE' } });
            await sleep(tickMs);

            await this.gen.setFrequency(1, 0.67 * 1_000_000);
            setRunningFrequency({ ch1: { hz: 0.67e6, wave: 'SQUARE' }, ch2: { hz: 0.67e6, wave: 'SQUARE' } });
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

    async startProgram(programName: string, setRunningFrequency: RunStatusCallback) {
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
            setRunningFrequency({ ch1: { hz: initialHz, wave: 'SQUARE' }, ch2: { hz: initialHz, wave: 'SQUARE' } });
            await this.gen.setBothChannelsToSquareWave();
            await this.gen.sync();
            await this.gen.enableOutputs();
            setRunningFrequency({ ch1: { hz: initialHz, wave: 'SQUARE' }, ch2: { hz: initialHz, wave: 'SQUARE' } });
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
            // Dual-frequency program: CH2 holds its OWN audio frequency
            // (channel2frequency, in Hz) independent of CH1 — e.g. 230 Hz on CH1 +
            // 430 Hz on CH2, both square (27 Jun). It must NOT mirror CH1, and (for
            // SQUARE) must NOT frequency-sync, or the two frequencies collapse to one.
            const ch2IndependentHz = num(program.channel2frequency, 0);
            const hasIndependentCh2 = ch2IndependentHz > 0;

            const mirrorCh2ToCh1 =
                !hasIndependentCh2 &&
                (hasItemWaveform ||
                    (program.channel1wavetype === 'SINE' &&
                        program.channel2wavetype === 'SINE' &&
                        program.startFrequency === 0));

            // Apply amplitude and BOTH channel frequencies BEFORE enabling outputs,
            // so the device doesn't briefly output the previous program's frequencies.
            await this.applyCurrentIntensity(program);
            if (initialHz != null && Number.isFinite(initialHz)) {
                await this.setFrequencyPair(initialHz, mirrorCh2ToCh1 ? initialHz : null);
            }
            // CH2's own frequency: channel2frequency is in Hz (dual-frequency
            // programs); startFrequency is the legacy MHz carrier.
            const ch2CarrierHz = hasIndependentCh2
                ? ch2IndependentHz
                : (program.startFrequency > 0 ? program.startFrequency * 1_000_000 : 0);
            if (ch2CarrierHz > 0) {
                await sleep(FREQ_PAIR_GAP_MS);
                await this.gen.setFrequency(2, ch2CarrierHz);
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

            // The program-level waveform both channels run (per-step programs override
            // this with the current step's wavetype). Mirrors the if/else chain below.
            const baseWave: ChannelWave =
                (!nameLc.includes('ultra') && ch1Sine && ch2Sine) ? 'SINE'
                : (hasIndependentCh2 && ch1Square && ch2Square) ? 'SQUARE'
                : (nameLc.includes('ultra') || program.startFrequency === 0 || (ch1Square && ch2Square)) ? 'SQUARE'
                : ch1Sine ? 'SINE'
                : 'SQUARE';

            // Emit the per-channel readout for the UI. CH2's frequency mirrors/follows
            // CH1 unless the program gives CH2 its own carrier/audio frequency
            // (ch2CarrierHz); waveform is shared across both channels.
            const reportStatus = (ch1Hz: number, wave?: ChannelWave | null) => {
                const w = wave ?? (hasItemWaveform ? (appliedWavetype ?? null) : baseWave);
                const ch2Hz = ch2CarrierHz > 0 ? ch2CarrierHz : ch1Hz;
                setRunningFrequency({ ch1: { hz: ch1Hz, wave: w }, ch2: { hz: ch2Hz, wave: w } });
            };

            if (hasItemWaveform) {
                // Per-frequency waveform: assert the first step's waveform before outputs
                // enable; the run loop switches waveform only when a step changes it.
                // No sync() here — like the SINE/SINE path, both channels are driven
                // explicitly. (enableOutputs' USA2 is amplitude sync only, per protocol.)
                await applyItemWaveform(program.data[0]?.wavetype);
            } else if (!nameLc.includes('ultra') && ch1Sine && ch2Sine) {
                await this.gen.setBothChannelsToSineWave();
            } else if (hasIndependentCh2 && ch1Square && ch2Square) {
                // Dual-frequency square: CH1 and CH2 run at DIFFERENT frequencies,
                // both square. Assert both waveforms but do NOT sync() — USA1
                // frequency-sync would slave CH2 to CH1, collapsing the two
                // frequencies into one. (Same hands-off approach the SINE carrier
                // programs already rely on; freq-sync is off at program start.)
                await this.gen.setBothChannelsToSquareWave();
            } else if (nameLc.includes('ultra') || program.startFrequency === 0 ||
                (ch1Square && ch2Square)) {
                await this.gen.setBothChannelsToSquareWave();
                await this.gen.sync();
            } else if (ch1Sine) {
                await this.gen.sinewave();
            }

            // Prime the readout with the initial frequency + resolved waveform.
            if (initialHz != null && Number.isFinite(initialHz)) reportStatus(initialHz);

            // Enable outputs LAST — after all settings are configured
            await this.gen.enableOutputs();

            // Per-step-waveform programs switch waveform mid-run on both channels. The
            // device occasionally drops one of the two per-step waveform commands, so a
            // step could leave the channels on DIFFERENT waveforms (Rob: only one channel
            // changed). Couple CH2's waveform to CH1 in hardware (USA0) so they can never
            // split — CH1 stays the master the per-step switches already drive first, and
            // frequency stays independent (USA1 left off). Scoped to these programs so no
            // other program's tuned output path changes; stopAndReset's USD0 clears it.
            if (hasItemWaveform) await this.gen.enableWaveformSync();

            if (isRange) {
                const [startItem, endItem] = program.data as [ProgramRow['data'][number], ProgramRow['data'][number]];
                const startF = Number(startItem?.frequency);
                const endF = Number(endItem?.frequency);
                const direction = startF <= endF ? 1 : -1;
                const totalSteps = Math.abs(endF - startF);
                const stepSize = direction;
                // The sweep is INCLUSIVE of both endpoints, so it visits
                // (totalSteps + 1) frequencies (start … end). Divide the run time by
                // that count, not totalSteps — dividing by totalSteps sized each dwell
                // for one fewer step than actually runs, so every range/sweep ran one
                // step long: a 5-step, 1-min-per-step program took 6 min, not 5.
                // (off-by-one, 15 Jul)
                const interval = Math.max(1, Math.floor(totalMs / (totalSteps + 1)));

                const condition = direction > 0
                    ? (f: number) => f <= endF
                    : (f: number) => f >= endF;

                let rangeWaveformDone = false;
                for (let f = startF; this.running && condition(f); f += stepSize) {
                    while (this.paused && this.running) await sleep(100);
                    if (!this.running) break;

                    // Deadline starts BEFORE the paced pair so FREQ_PAIR_GAP_MS is
                    // absorbed into the dwell — mirrored sweeps keep their nominal
                    // step cadence instead of gaining 50ms per step.
                    let rangeEnd = Date.now() + interval;
                    await this.setFrequencyPair(Math.round(f), mirrorCh2ToCh1 ? Math.round(f) : null);
                    reportStatus(Math.round(f));
                    // A range's waveform, set only at the pre-output prime, doesn't stick
                    // on CH1 once outputs enable (Rob 7 Jul: a SINE range ran CH1 as square
                    // while CH2 was sine). Re-assert it once here — after the first
                    // frequency, outputs on — matching the non-range paths CH1 handles
                    // correctly. Only for per-item-waveform (editor) ranges; built-in
                    // ranges (hoyland) are untouched.
                    if (!rangeWaveformDone && hasItemWaveform) {
                        rangeWaveformDone = true;
                        appliedWavetype = undefined;
                        if (await applyItemWaveform(program.data[0]?.wavetype)) {
                            rangeEnd = Date.now() + interval;
                        }
                    }
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
                            // Inclusive sweep visits (totalSteps + 1) frequencies, so
                            // divide the row's run time by that count — dividing by
                            // totalSteps ran the sweep one step long. (off-by-one, 15 Jul)
                            const interval = Math.max(1, Math.floor(item.runTime / (totalSteps + 1)));
                            const condition = direction > 0
                                ? (f: number) => f <= endF
                                : (f: number) => f >= endF;
                            for (let f = freq; this.running && condition(f); f += direction) {
                                while (this.paused && this.running) await sleep(100);
                                if (!this.running) break;
                                // Deadline before the pair — see the range loop note.
                                let sweepEnd = Date.now() + interval;
                                await this.setFrequencyPair(Math.round(f), mirrorCh2ToCh1 ? Math.round(f) : null);
                                reportStatus(Math.round(f), item.wavetype);
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
                                reportStatus(freq);
                                const onEnd = Math.min(Date.now() + onMs, until);
                                while (this.running && !this.paused && Date.now() < onEnd) await sleep(5);
                                if (!this.running || Date.now() >= until) break;

                                await this.setFrequencyPair(0, ch2Hz > 0 ? 0 : null);
                                reportStatus(0);
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
                            reportStatus(freq, item.wavetype);
                            if (item.wavetype) await applyItemWaveform(item.wavetype);
                            if (hasIndependentCh2 && ch2CarrierHz > 0) {
                                // CH2's own frequency, set once at the pre-output prime,
                                // reverts to the 3.1MHz init carrier once outputs enable
                                // (Rob 7 Jul: dualFreq CH2 came out at 3.1MHz square instead
                                // of 430Hz). Re-assert it here — outputs on — so CH2 holds.
                                // Placed AFTER any waveform switch so the switch can't
                                // re-latch CH2 off this frequency.
                                await sleep(FREQ_PAIR_GAP_MS);
                                if (this.running) await this.gen.setFrequency(2, ch2CarrierHz);
                            }

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

        // Always release the UI, even if the stop sequence errors partway. stopAndReset
        // sends 9 serial commands over several seconds and any one can throw transiently;
        // without this guard the throw skipped the reset below, so the machine stopped
        // but the UI stayed stuck "running" (report: custom program finished, UI frozen).
        // stopProgram() already guards onStop the same way — the completion path didn't.
        try {
            if (this.running) await this.gen.stopAndReset();
        } catch (err) {
            // The program is finished; a failed stop sequence must not reject the
            // whole run (doStart doesn't catch it) or skip the UI reset below.
            console.error('stopAndReset at completion failed:', err);
        } finally {
            this.running = false;
            this.paused = false;
            this.onStop?.();
        }
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

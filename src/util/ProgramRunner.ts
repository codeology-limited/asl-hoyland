import type { Dispatch, SetStateAction } from 'react';
import AppDatabase, { ProgramRow } from './AppDatabase';
import HoylandController from './HoylandController';


type ProgressCallback = (currentStep: number, totalSteps: number, minutesRemaining: number) => void;

const asBool = (v: number | boolean | undefined) => !!Number(v);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
            const applyItemWaveform = async (wt?: 'SINE' | 'SQUARE') => {
                if (wt === 'SINE') await this.gen.setBothChannelsToSineWave();
                else if (wt === 'SQUARE') await this.gen.setBothChannelsToSquareWave();
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
                await this.gen.setFrequency(1, initialHz);
                if (mirrorCh2ToCh1) await this.gen.setFrequency(2, initialHz);
                setRunningFrequency(`${initialHz} Hz`);
            }
            if (program.startFrequency > 0) {
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
                // enable; the run loop re-asserts each step's waveform. enableOutputs sends
                // USA2 so no explicit sync() is needed (same as the SINE/SINE path).
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

                    await this.gen.setFrequency(1, Math.round(f));
                    if (mirrorCh2ToCh1) await this.gen.setFrequency(2, Math.round(f));
                    setRunningFrequency(`${Math.round(f)} Hz`);
                    const rangeEnd = Date.now() + interval;
                    while (this.running && Date.now() < rangeEnd) {
                        while (this.paused && this.running) await sleep(100);
                        if (!this.running) break;
                        await sleep(5);
                    }
                }
            } else {
                for (const item of program.data) {
                    if (!this.running) break;
                    while (this.paused && this.running) await sleep(100);
                    if (!this.running) break;

                    const freq = Number(item.frequency);

                    if ('sweepTo' in item && item.sweepTo != null) {
                        if (item.wavetype) await applyItemWaveform(item.wavetype);
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
                                await this.gen.setFrequency(1, Math.round(f));
                                if (mirrorCh2ToCh1) await this.gen.setFrequency(2, Math.round(f));
                                setRunningFrequency(`${Math.round(f)} Hz`);
                                const sweepEnd = Date.now() + interval;
                                while (this.running && Date.now() < sweepEnd) {
                                    while (this.paused && this.running) await sleep(100);
                                    if (!this.running) break;
                                    await sleep(5);
                                }
                            }
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

                                await this.gen.setFrequency(1, freq);
                                if (ch2Hz > 0) await this.gen.setFrequency(2, ch2Hz);
                                setRunningFrequency(`${freq} Hz`);
                                const onEnd = Math.min(Date.now() + onMs, until);
                                while (this.running && !this.paused && Date.now() < onEnd) await sleep(5);
                                if (!this.running || Date.now() >= until) break;

                                await this.gen.setFrequency(1, 0);
                                if (ch2Hz > 0) await this.gen.setFrequency(2, 0);
                                setRunningFrequency(`${freq} Hz (off)`);
                                const offEnd = Math.min(Date.now() + offMs, until);
                                while (this.running && !this.paused && Date.now() < offEnd) await sleep(5);
                            }
                        } else {
                            // Continuous mode
                            if (item.wavetype) await applyItemWaveform(item.wavetype);
                            await this.gen.setFrequency(1, freq);
                            if (mirrorCh2ToCh1) await this.gen.setFrequency(2, freq);
                            setRunningFrequency(`${freq} Hz`);

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

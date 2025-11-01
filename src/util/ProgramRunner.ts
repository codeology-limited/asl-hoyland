import type { Dispatch, SetStateAction } from 'react';
import AppDatabase from './AppDatabase';
import HoylandController from './HoylandController';

interface Program {
    id?: number;
    name: string;
    range: number | boolean;
    data: { channel: number; frequency: number | string; runTime: number }[];
    maxTimeInMinutes: number;
    default: number | boolean;
    startFrequency: number;
    mirror?: number | boolean;

    // optional slider metadata (present in DB rows)
    sliderMinV?: number;
    sliderMaxV?: number;
    sliderStepV?: number;
}

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

    constructor(
        private db: AppDatabase,
        private gen: HoylandController,
        progressCallback: ProgressCallback | null = null
    ) {
        this.onProgress = progressCallback;
    }

    async loadProgram(name: string): Promise<Program | null> {
        try { return await this.db.loadData(name) as unknown as Program; } catch { return null; }
    }

    setProgressCallback(cb: ProgressCallback) { this.onProgress = cb; }
    setOnStopCallback(cb: () => void) { this.onStop = cb; }

    /** Support both legacy setAmplitude(amplitude) and new setAmplitude(channel, amplitude) */
    private async sendAmp(channel: number, amp: number) {
        const anyGen = this.gen as unknown as { setAmplitude: (...args: any[]) => Promise<void> };
        if (!Number.isFinite(amp)) return;
        if (anyGen.setAmplitude.length >= 2) {
            await (anyGen.setAmplitude as (c: number, a: number) => Promise<void>)(channel, amp);
        } else {
            await (anyGen.setAmplitude as (a: number) => Promise<void>)(amp);
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
    private async applyCurrentIntensity(program?: Program) {
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

        const totalMs = program.maxTimeInMinutes * 60 * 1000;
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




        if (program.name === 'ultrasound') {
            // ensure square + sync FIRST, then apply amplitude (default 25% if unspecified), then run
            await this.gen.setBothChannelsToSquareWave();
            await this.gen.sync();
            await this.applyCurrentIntensity(program);
            await this.runSpecialCase(setRunningFrequency);
        } else {

            if (program.name.includes("ultra")) {
                await this.gen.setBothChannelsToSquareWave();
                await this.gen.sync();
            }
            
            if (program.startFrequency === 0) {
                await this.gen.setBothChannelsToSquareWave();
                await this.gen.sync();
            }

            await this.applyCurrentIntensity(program);

            const isRange = asBool(program.range) && program.data.length === 2;
            if (isRange) {
                const startF = Number(program.data[0].frequency);
                const endF = Number(program.data[1].frequency);
                const direction = startF <= endF ? 1 : -1;
                const totalSteps = Math.abs(endF - startF);
                // Cap steps to reasonable limit to prevent excessive iterations
                // Use 1000 as max (not 1001) to ensure we have at most 1000 iterations
                const maxSteps = 1000;
                const cappedSteps = totalSteps > maxSteps ? maxSteps : totalSteps;
                const stepSize = totalSteps > maxSteps
                    ? (totalSteps / maxSteps) * direction
                    : direction;
                const interval = Math.max(1, Math.floor(totalMs / cappedSteps));

                let iterationCount = 0;
                const condition = direction > 0
                    ? (f: number) => f <= endF && iterationCount < maxSteps
                    : (f: number) => f >= endF && iterationCount < maxSteps;

                for (let f = startF; this.running && condition(f); f += stepSize) {
                    while (this.paused && this.running) await sleep(100);
                    if (!this.running) break;

                    await this.gen.setFrequency(1, Math.round(f));
                    setRunningFrequency(`${Math.round(f)} Hz`);
                    await sleep(interval);
                    iterationCount++;
                }
            } else {
                for (const item of program.data) {
                    if (!this.running) break;
                    while (this.paused && this.running) await sleep(100);
                    if (!this.running) break;

                    const freq = Number(item.frequency);
                    await this.gen.setFrequency(1, freq);
                    setRunningFrequency(`${freq} Hz`);

                    const until = Date.now() + item.runTime;
                    while (this.running && Date.now() < until) {
                        if (this.paused) break;
                        await sleep(5);
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

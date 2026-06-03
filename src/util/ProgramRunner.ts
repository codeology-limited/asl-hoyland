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

    // NOTE: detected from setAmplitude.length, but this is effectively ALWAYS true
    // because HoylandController.setAmplitude is declared with the 2-arg overload
    // implementation signature (arity 2). The single-arg fallback path in sendAmp()
    // is therefore dead in practice — do not rely on it for new behavior.
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
        // Public contract unchanged: still returns null on failure. But distinguish a
        // genuine load error (DB read/parse threw) from a plain not-found in the logs,
        // so a corrupt-database failure isn't silently misread as "program missing".
        try {
            return await this.db.loadData(name);
        } catch (err) {
            console.warn(`loadProgram("${name}") failed to load (treating as not-found):`, err);
            return null;
        }
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
     * Pause-aware wait until a per-item/per-step deadline.
     *
     * The deadline is treated as a duration budget that only counts down while NOT
     * paused. When a pause is observed mid-wait, the paused duration is added back to
     * the deadline on resume so the item is not truncated (previously `Date.now() + ms`
     * deadlines ignored pause and a pause would cut the item short).
     *
     * Also enforces the master deadline: it returns early once the overall program
     * has consumed `totalMs` of un-paused time, so a program cannot overrun its
     * advertised maxTimeInMinutes.
     *
     * Returns when: the deadline passes, the program stops, or the master cap hits.
     */
    private async waitUntil(deadline: number, start: number, totalMs: number) {
        while (this.running && Date.now() < deadline) {
            // Master cap: stop waiting once advertised duration is exhausted.
            if ((Date.now() - start - this.pausedTotal) >= totalMs) break;
            if (this.paused) {
                const pauseSeen = Date.now();
                while (this.paused && this.running) await sleep(100);
                if (!this.running) break;
                // Extend the deadline by however long we were actually paused so the
                // schedule clock advances only while NOT paused (agrees with progress).
                deadline += Date.now() - pauseSeen;
            }
            await sleep(5);
        }
    }

    /** True once the overall un-paused elapsed time has reached the advertised cap. */
    private masterExpired(start: number, totalMs: number) {
        return (Date.now() - start - this.pausedTotal) >= totalMs;
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

    /**
     * Ultrasound special: toggle 0.5 / 0.67 MHz; keep waveform SQUARE (no sine call).
     *
     * `internal` is set when called from startProgram's ultrasound branch, which owns
     * its own try/finally cleanup — so we skip the duplicate stopAndReset/sessionStop/
     * onStop here to avoid firing onStop twice. Public callers omit it and get full
     * standalone cleanup.
     */
    async runSpecialCase(
        setRunningFrequency: Dispatch<SetStateAction<string>>,
        internal = false
    ) {
        if (!internal) {
            this.running = true;
            this.paused = false;
        }

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

        // Deadman: outputs are already enabled by the ultrasound entry path before we
        // get here; arm the watchdog (best-effort). When called internally, startProgram
        // already armed it after enableOutputs(), so skip the duplicate.
        if (!internal) {
            await this.gen.sessionStart();
            // Standalone path has no progressLoop, so run an independent heartbeat ticker
            // that fires REGARDLESS of pause (same rationale as progressLoop above). When
            // internal, startProgram's progressLoop already keeps the session armed.
            void (async () => {
                while (this.running) {
                    void this.gen.heartbeat();
                    await sleep(1000);
                }
            })();
        }

        try {
            const tickMs = 1000;
            while (this.running && !this.masterExpired(start, totalMs)) {
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
        } finally {
            if (!internal) {
                // GUARANTEED cleanup: silence the device and reset UI even if a mid-run
                // setFrequency rejected (e.g. USB unplugged).
                try { await this.gen.stopAndReset(); } catch (e) { console.warn('stopAndReset failed in cleanup', e); }
                this.running = false;
                this.paused = false;
                await this.gen.sessionStop();
                this.onStop?.();
            }
        }
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
        // Re-entrancy guard: a single controller drives one physical device. Starting
        // a second concurrent run would interleave serial writes and race the deadman
        // bookkeeping. Refuse rather than corrupt the in-flight run.
        if (this.running) {
            console.warn('startProgram called while a program is already running — ignoring');
            return;
        }

        const program = await this.loadProgram(programName);
        if (!program) { console.error(`Program ${programName} not found`); return; }

        this.running = true;
        this.paused = false;
        this.pausedTotal = 0;

        const totalMs = Math.max(1, program.maxTimeInMinutes * 60 * 1000);
        const start = Date.now();

        // progress updater. Heartbeat is sent here ~once per tick so the watchdog
        // keeps the session alive while we're scheduling serial writes. heartbeat()
        // is fire-and-forget — we never await-block the schedule on it.
        const progressLoop = (async () => {
            while (this.running) {
                // Heartbeat every tick REGARDLESS of pause: a live-but-paused UI must
                // keep the deadman session armed. Only a crashed/frozen UI (whole loop
                // dead) stops heart-beating — exactly the condition the backend watchdog
                // should catch. Gating this behind !paused let a >30s pause trip the
                // watchdog and force-stop an intentionally paused run.
                void this.gen.heartbeat();
                if (!this.paused) {
                    const elapsed = Date.now() - start - this.pausedTotal;
                    const pct = (elapsed / totalMs) * 100;
                    this.reportProgress(pct, 100, (totalMs - elapsed) / 60000);
                    if (elapsed >= totalMs) break;
                }
                await sleep(50);
            }
        })();

        // Max number of serial writes for any single sweep. Stepping +/-1 Hz produced
        // ~40000 writes for a 0→40kHz hoyland sweep (and millions for kHz/MHz spans),
        // flooding the serial line. Cap the write count and derive an integer step.
        const MAX_STEPS = 2000;

        try {
            if (program.name.toLowerCase() === 'ultrasound') {
                // Ensure amplitude and frequency are set BEFORE outputs are enabled
                await this.applyCurrentIntensity(program);
                const initialHz = Math.round(0.5 * 1_000_000);
                await this.gen.setFrequency(1, initialHz);
                setRunningFrequency(`${initialHz} Hz`);
                await this.gen.setBothChannelsToSquareWave();
                await this.gen.sync();
                await this.gen.enableOutputs();
                // Deadman: arm the watchdog immediately after outputs are live.
                await this.gen.sessionStart();
                // internal=true: this startProgram owns the try/finally cleanup below.
                await this.runSpecialCase(setRunningFrequency, true);
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

                // Apply amplitude and BOTH channel frequencies BEFORE enabling outputs,
                // so the device doesn't briefly output the previous program's frequencies.
                await this.applyCurrentIntensity(program);
                if (initialHz != null && Number.isFinite(initialHz)) {
                    await this.gen.setFrequency(1, initialHz);
                    setRunningFrequency(`${initialHz} Hz`);
                }
                if (program.startFrequency > 0) {
                    await this.gen.setFrequency(2, program.startFrequency * 1_000_000);
                }

                // Set waveform.
                // - SINE+SINE → both sine, asserted explicitly so CH1 doesn't inherit the
                //   square left over from SECONDARY_COMMANDS' WMW01 init. This MUST be
                //   checked first: a no-carrier (startFrequency===0) SINE/SINE program
                //   such as lymphocyte50Hz / tCells30Hz was previously shadowed by the
                //   `startFrequency === 0` square trigger and wrongly emitted square. (Lynne 2 Jun)
                // - ultra*/no-carrier/SQUARE+SQUARE → both square + sync.
                // - otherwise → fall back to sinewave() if CH1 declared SINE.
                const ch1Sine = program.channel1wavetype === 'SINE';
                const ch2Sine = program.channel2wavetype === 'SINE';
                const ch1Square = program.channel1wavetype === 'SQUARE';
                const ch2Square = program.channel2wavetype === 'SQUARE';
                if (!nameLc.includes('ultra') && ch1Sine && ch2Sine) {
                    await this.gen.setBothChannelsToSineWave();
                } else if (nameLc.includes('ultra') || program.startFrequency === 0 ||
                    (ch1Square && ch2Square)) {
                    await this.gen.setBothChannelsToSquareWave();
                    await this.gen.sync();
                } else if (ch1Sine) {
                    await this.gen.sinewave();
                }

                // Enable outputs LAST — after all settings are configured.
                // SAFETY INVARIANT (H11): enableOutputs() MUST come after amplitude,
                // initial frequency and waveform are configured.
                await this.gen.enableOutputs();
                // Deadman: arm the watchdog immediately after outputs are live.
                await this.gen.sessionStart();

                if (isRange) {
                    const [startItem, endItem] = program.data as [ProgramRow['data'][number], ProgramRow['data'][number]];
                    const startF = Number(startItem?.frequency);
                    const endF = Number(endItem?.frequency);
                    if (Number.isFinite(startF) && Number.isFinite(endF)) {
                        const direction = startF <= endF ? 1 : -1;
                        const span = Math.abs(endF - startF);
                        // Bounded step size: never more than MAX_STEPS serial writes.
                        const stepSize = Math.max(1, Math.ceil(span / MAX_STEPS)) * direction;
                        const writeCount = span > 0 ? Math.ceil(span / Math.abs(stepSize)) : 0;
                        // Keep each dwell >= ~10ms so we don't hammer the serial line.
                        const interval = Math.max(10, Math.floor(totalMs / Math.max(1, writeCount)));

                        const condition = direction > 0
                            ? (f: number) => f <= endF
                            : (f: number) => f >= endF;

                        let f = startF;
                        for (; this.running && condition(f) && !this.masterExpired(start, totalMs); f += stepSize) {
                            while (this.paused && this.running) await sleep(100);
                            if (!this.running) break;
                            await this.gen.setFrequency(1, Math.round(f));
                            setRunningFrequency(`${Math.round(f)} Hz`);
                            await this.waitUntil(Date.now() + interval, start, totalMs);
                        }
                        // ALWAYS emit the exact endpoint so the sweep finishes on target,
                        // even when the integer step overshot or the cap stopped the loop.
                        if (this.running) {
                            await this.gen.setFrequency(1, Math.round(endF));
                            setRunningFrequency(`${Math.round(endF)} Hz`);
                        }
                    }
                } else {
                    for (const item of program.data) {
                        if (!this.running || this.masterExpired(start, totalMs)) break;
                        while (this.paused && this.running) await sleep(100);
                        if (!this.running) break;

                        const freq = Number(item.frequency);

                        if ('sweepTo' in item && item.sweepTo != null) {
                            const endF = Number(item.sweepTo);
                            // Guard both endpoints — a corrupt sweep must not run.
                            if (!Number.isFinite(freq) || !Number.isFinite(endF)) continue;
                            const direction = freq <= endF ? 1 : -1;
                            const span = Math.abs(endF - freq);
                            if (span > 0) {
                                const stepSize = Math.max(1, Math.ceil(span / MAX_STEPS)) * direction;
                                const writeCount = Math.ceil(span / Math.abs(stepSize));
                                const interval = Math.max(10, Math.floor(num(item.runTime, 0) / Math.max(1, writeCount)));
                                const condition = direction > 0
                                    ? (f: number) => f <= endF
                                    : (f: number) => f >= endF;
                                let f = freq;
                                for (; this.running && condition(f) && !this.masterExpired(start, totalMs); f += stepSize) {
                                    while (this.paused && this.running) await sleep(100);
                                    if (!this.running) break;
                                    await this.gen.setFrequency(1, Math.round(f));
                                    setRunningFrequency(`${Math.round(f)} Hz`);
                                    await this.waitUntil(Date.now() + interval, start, totalMs);
                                }
                                // ALWAYS land on the exact sweep endpoint.
                                if (this.running) {
                                    await this.gen.setFrequency(1, Math.round(endF));
                                    setRunningFrequency(`${Math.round(endF)} Hz`);
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

                                // NaN guard: a corrupt frequency must not latch a 0-Hz DC source
                                // with amplitude enabled — skip the item entirely.
                                if (!Number.isFinite(freq)) continue;
                                const ch2Hz = program.startFrequency > 0
                                    ? program.startFrequency * 1_000_000
                                    : 0;

                                // Pause-aware item deadline that also honours the master cap.
                                let until = Date.now() + num(item.runTime, 0);
                                while (this.running && Date.now() < until && !this.masterExpired(start, totalMs)) {
                                    if (this.paused) {
                                        const pauseSeen = Date.now();
                                        while (this.paused && this.running) await sleep(100);
                                        if (!this.running) break;
                                        until += Date.now() - pauseSeen;
                                        continue;
                                    }

                                    await this.gen.setFrequency(1, freq);
                                    if (ch2Hz > 0) await this.gen.setFrequency(2, ch2Hz);
                                    setRunningFrequency(`${freq} Hz`);
                                    await this.waitUntil(Math.min(Date.now() + onMs, until), start, totalMs);
                                    if (!this.running || Date.now() >= until || this.masterExpired(start, totalMs)) break;

                                    await this.gen.setFrequency(1, 0);
                                    if (ch2Hz > 0) await this.gen.setFrequency(2, 0);
                                    setRunningFrequency(`${freq} Hz (off)`);
                                    await this.waitUntil(Math.min(Date.now() + offMs, until), start, totalMs);
                                }
                            } else {
                                // Continuous mode.
                                // NaN guard (matches the range path): a corrupt data value must
                                // not become a 0-Hz DC source with amplitude latched on.
                                if (!Number.isFinite(freq)) continue;
                                await this.gen.setFrequency(1, freq);
                                setRunningFrequency(`${freq} Hz`);
                                await this.waitUntil(Date.now() + num(item.runTime, 0), start, totalMs);
                            }
                        }
                        if (!this.running) break;
                    }
                }
            }

            await progressLoop;
        } finally {
            // GUARANTEED cleanup (C2/H2): on ANY error or normal completion, silence the
            // device, reset the run state and notify the UI. This covers a mid-run
            // setFrequency rejecting (USB unplug) — we must never leave outputs enabled.
            try { await this.gen.stopAndReset(); } catch (e) { console.warn('stopAndReset failed in cleanup', e); }
            this.running = false;
            this.paused = false;
            await this.gen.sessionStop();
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
        finally {
            this.running = false;
            this.paused = false;
            // Disarm the deadman watchdog on explicit stop (best-effort).
            await this.gen.sessionStop();
            this.onStop?.();
        }
    }
}

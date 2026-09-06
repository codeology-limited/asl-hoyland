import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { VirtualFY6600, formatFrequency } from './virtualFY6600';

// The mock delegates to a mutable holder so `mockReset: true` can't wipe the impl and each
// test can install a fresh device. Referenced lazily at call time (hoist-safe).
const holder: { dev: VirtualFY6600 } = { dev: new VirtualFY6600() };
vi.mock('@tauri-apps/api/tauri', () => ({
    invoke: (cmd: string, args?: Record<string, unknown>) => holder.dev.invoke(cmd, args),
}));

import AppDatabase, { ProgramRow } from '../AppDatabase';
import HoylandController from '../HoylandController';
import ProgramRunner from '../ProgramRunner';

const mkFakeDb = (row: ProgramRow) => ({ loadData: vi.fn(async () => row) } as unknown as AppDatabase);

/** Replicate the UI's doStart (DefaultPrograms/Index.tsx): CH1 config, CH2 config, CH2
 *  carrier, stash intensity, run. Then capture startup + first step and stop. */
async function runDoStart(device: VirtualFY6600, name: string, row: ProgramRow, intensity = 5) {
    holder.dev = device;
    const gen = new HoylandController();
    const runner = new ProgramRunner(mkFakeDb(row), gen, null);
    await runner.initializeChannel0();                 // send_secondary_commands (CH1 config)
    await runner.initializeChannel1();                 // send_initial_commands (CH2 config)
    await runner.setChannel1StartFrequency(name);      // CH2 carrier when startFrequency > 0
    await runner.setIntensity(intensity, { applyNow: false });
    const p = runner.startProgram(name, () => {});
    await vi.advanceTimersByTimeAsync(1500);           // startup + first continuous step
    await runner.stopProgram();
    await vi.runAllTimersAsync();
    await p;
}

// --- The reference oracle: expected device output derived purely from a program's fields ---
//
// Three categories, each with a distinct CH2 behaviour (confirmed intent, Tony 18 Jul):
//   - independent (channel2frequency): CH2 holds its OWN audio frequency, no sync.
//   - carrier (startFrequency > 0): CH2 HOLDS a fixed MHz carrier while CH1 runs the
//     therapy — waveform-sync (USA0) + amplitude-sync (USA2) only, NO frequency-sync (USA1).
//   - mirror (no carrier): CH2 equals CH1 — full sync(), so the run drives CH1 only.
// CH1 always carries the therapy frequency; both outputs always on.
type Category = 'independent' | 'carrier' | 'mirror';
interface Expected {
    category: Category;
    /** true when the two channels deliberately run different waveforms */
    split?: boolean;
    ch1Hz: number;
    ch1Wave: 'SINE' | 'SQUARE';
    ch2Wave: 'SINE' | 'SQUARE';
    ch2Hz: number;   // resolved CH2 frequency on the device
}

function expectedFor(row: ProgramRow): Expected {
    const wt1 = (row.channel1wavetype as 'SINE' | 'SQUARE') ?? 'SQUARE'; // device default is square
    const startF = Number(row.startFrequency) || 0;
    const ch2indep = Number(row.channel2frequency) || 0;
    const ch1Hz = Number(row.data[0].frequency);
    // ultra500/ultra670: startFrequency is the operating frequency, CH2 == CH1 (mirror).
    if ((row.name || '').toLowerCase().includes('ultra')) {
        return { category: 'mirror', ch1Hz, ch1Wave: wt1, ch2Wave: wt1, ch2Hz: ch1Hz };
    }
    if (ch2indep > 0) {
        const wt2 = (row.channel2wavetype as 'SINE' | 'SQUARE') ?? wt1;
        return { category: 'independent', ch1Hz, ch1Wave: wt1, ch2Wave: wt2, ch2Hz: ch2indep };
    }
    if (startF > 0) {
        // Carrier: CH2 holds the MHz carrier while CH1 runs the therapy.
        // Normally CH2's waveform follows CH1 via USA0 — but when the program declares two
        // DIFFERENT waveforms (cancerSarcomaBX/BY: square therapy tone, sine carrier) each
        // channel is driven on its own and USA0 must stay off, or it would copy CH1's
        // waveform onto CH2 and lose the distinction. (Rob, 14 Aug 2026.)
        const declared2 = row.channel2wavetype as 'SINE' | 'SQUARE' | undefined;
        const split = (declared2 === 'SINE' || declared2 === 'SQUARE') &&
                      (row.channel1wavetype === 'SINE' || row.channel1wavetype === 'SQUARE') &&
                      declared2 !== row.channel1wavetype;
        return {
            category: 'carrier', split, ch1Hz, ch1Wave: wt1,
            ch2Wave: split ? declared2! : wt1,
            ch2Hz: startF * 1_000_000,
        };
    }
    // Mirror: CH2 follows CH1 in both waveform and frequency (full sync).
    return { category: 'mirror', ch1Hz, ch1Wave: wt1, ch2Wave: wt1, ch2Hz: ch1Hz };
}

const trimNl = (s: string) => s.replace(/\n$/, '');

let db: AppDatabase;
const rows = new Map<string, ProgramRow>();

beforeAll(async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    db = new AppDatabase();
    await db.ensurePreloaded();
    const all = await db.getDefaultPrograms();
    for (const p of all) rows.set(p.name, p);
});

beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

// ultrasound has a bespoke runSpecialCase path; test it separately if needed.
const EXCLUDE = new Set(['ultrasound']);

describe('every program emits its spec-derived serial output', () => {
    // Build the list lazily inside a test so it runs after beforeAll populated `rows`.
    it('has programs loaded', () => {
        expect(rows.size).toBeGreaterThan(10);
    });

    // One assertion block per program, generated from the loaded set.
    const names = () => [...rows.keys()].filter((n) => !EXCLUDE.has(n)).sort();

    // vitest needs the describe tree built synchronously; we can't await beforeAll here, so
    // iterate a static name list captured from a synchronous re-read of the JSON is overkill.
    // Instead run every program inside a single data-driven test that reports all failures.
    it('all programs match the oracle (aggregated)', async () => {
        const failures: string[] = [];
        for (const name of names()) {
            const row = rows.get(name)!;
            const exp = expectedFor(row);
            const device = new VirtualFY6600();
            await runDoStart(device, name, row);
            const lines = device.serialLinesBeforeStop();
            const st = device.runningState;      // resolved device state (models sync)
            const errs: string[] = [];

            const firstOutputIdx = lines.findIndex((l) => l === 'WMN1' || l === 'WFN1');
            const before = firstOutputIdx === -1 ? lines : lines.slice(0, firstOutputIdx);
            const after = firstOutputIdx === -1 ? [] : lines.slice(firstOutputIdx);

            // 1. CH1 carries the therapy frequency (first WMF write; robust to sweeps/pulsing).
            const wmf = lines.filter((l) => l.startsWith('WMF'));
            const expWmf = trimNl(formatFrequency(1, exp.ch1Hz));
            if (wmf[0] !== expWmf) errs.push(`CH1 first freq: got ${wmf[0] ?? '(none)'} want ${expWmf}`);

            // 2. Both outputs on.
            if (!st.ch1.outputOn) errs.push('CH1 output not on');
            if (!st.ch2.outputOn) errs.push('CH2 output not on');

            // 3. Resolved waveform per channel.
            if (st.ch1.wave !== exp.ch1Wave) errs.push(`CH1 waveform: got ${st.ch1.wave} want ${exp.ch1Wave}`);
            if (st.ch2.wave !== exp.ch2Wave) errs.push(`CH2 waveform: got ${st.ch2.wave} want ${exp.ch2Wave}`);

            // 4. Resolved CH2 frequency: carrier held / independent own / mirror follows CH1.
            if (exp.category === 'mirror') {
                if (st.ch2.hz !== st.ch1.hz) errs.push(`mirror CH2 should follow CH1: ch2=${st.ch2.hz} ch1=${st.ch1.hz}`);
            } else if (st.ch2.hz !== exp.ch2Hz) {
                errs.push(`CH2 freq: got ${st.ch2.hz} want ${exp.ch2Hz} (${exp.category})`);
            }

            // 5. Sync structure matches the category.
            const usa1 = before.includes('USA1');   // frequency sync (only sync() sends it)
            const usa0 = before.includes('USA0');   // waveform sync
            if (exp.category === 'mirror' && !usa1) {
                errs.push('mirror must full-sync (USA1) before outputs so CH2 follows CH1');
            }
            if (exp.category === 'carrier') {
                if (usa1) errs.push('carrier must NOT frequency-sync (USA1) — would collapse the carrier');
                if (exp.split && usa0) {
                    errs.push('split-waveform carrier must NOT waveform-sync (USA0) — it would copy CH1 onto CH2');
                }
                if (!exp.split && !usa0) {
                    errs.push('carrier should waveform-sync (USA0) so CH2 waveform follows CH1');
                }
            }
            if (exp.category === 'independent' && usa1) {
                errs.push('independent-CH2 must NOT frequency-sync (USA1) — would collapse the two frequencies');
            }

            // 6. No waveform switch AFTER outputs. The exception is a split-waveform
            // carrier, which has no USA0 holding CH2 and must re-assert it once the
            // outputs are on (bench-validated ordering).
            const postWave = after.filter((l) => l.startsWith('WMW') || l.startsWith('WFW'));
            const allowed = exp.split ? (exp.ch2Wave === 'SINE' ? 'WFW00' : 'WFW01') : null;
            const unexpected = postWave.filter((l) => l !== allowed);
            if (unexpected.length > 0) errs.push(`waveform switched after outputs on: ${unexpected.join(',')}`);

            if (errs.length) failures.push(`\n[${name}] ${exp.category} (${exp.ch1Wave}, CH2 ${exp.ch2Hz}Hz)\n   - ` + errs.join('\n   - '));
        }
        if (failures.length) {
            throw new Error(`${failures.length} program(s) diverge from the oracle:\n${failures.join('\n')}`);
        }
    });
});

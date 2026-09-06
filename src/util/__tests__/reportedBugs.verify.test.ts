import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { VirtualFY6600, formatFrequency } from './virtualFY6600';

// Verification suite: each case maps DIRECTLY to a line from the field bug report
// (Lynne/Rob, 18 Jul) and asserts that the exact reported symptom is now fixed, by
// running the REAL program through the REAL engine into the virtual FY6600 and
// checking the resolved per-channel device state. A passing run is the proof.

const holder: { dev: VirtualFY6600 } = { dev: new VirtualFY6600() };
vi.mock('@tauri-apps/api/tauri', () => ({
    invoke: (cmd: string, args?: Record<string, unknown>) => holder.dev.invoke(cmd, args),
}));

import AppDatabase, { ProgramRow } from '../AppDatabase';
import HoylandController from '../HoylandController';
import ProgramRunner from '../ProgramRunner';

const mkFakeDb = (row: ProgramRow) => ({ loadData: vi.fn(async () => row) } as unknown as AppDatabase);

async function run(name: string) {
    const device = new VirtualFY6600();
    holder.dev = device;
    const row = rows.get(name)!;
    const gen = new HoylandController();
    const runner = new ProgramRunner(mkFakeDb(row), gen, null);
    await runner.initializeChannel0();
    await runner.initializeChannel1();
    await runner.setChannel1StartFrequency(name);
    await runner.setIntensity(5, { applyNow: false });
    const p = runner.startProgram(name, () => {});
    await vi.advanceTimersByTimeAsync(1500);
    await runner.stopProgram();
    await vi.runAllTimersAsync();
    await p;
    const lines = device.serialLinesBeforeStop();
    const st = device.runningState;
    const firstCh1 = lines.filter((l) => l.startsWith('WMF'))[0];
    return { device, st, firstCh1, lines };
}

let db: AppDatabase;
const rows = new Map<string, ProgramRow>();
const proof: string[] = [];

beforeAll(async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    db = new AppDatabase();
    await db.ensurePreloaded();
    for (const p of await db.getDefaultPrograms()) rows.set(p.name, p);
});
beforeEach(() => { vi.clearAllMocks(); vi.useFakeTimers(); });
afterEach(() => vi.useRealTimers());

const record = (name: string, symptom: string, st: { ch1: { hz: number; wave: string | null }; ch2: { hz: number; wave: string | null; outputOn: boolean } }) =>
    proof.push(
        `${name.padEnd(22)} | was: ${symptom.padEnd(34)} | now: ` +
        `CH1 ${st.ch1.hz}Hz/${st.ch1.wave}  CH2 ${st.ch2.hz}Hz/${st.ch2.wave} ${st.ch2.outputOn ? 'ON' : 'OFF'}`
    );

describe('reported bug verification (18 Jul field report)', () => {
    it('Hoyland: CH2 turns on (was: not turning on CH2)', async () => {
        const { st } = await run('hoyland');
        expect(st.ch2.outputOn).toBe(true);          // CH2 output enabled
        expect(st.ch2.hz).toBe(3_100_000);           // CH2 holds its 3.1MHz carrier
        expect(st.ch1.outputOn).toBe(true);
        record('hoyland', 'CH2 not turning on', st);
    });

    it('B16MELANOMA: CH1 = 120kHz (was: CH1 set to 0Hz)', async () => {
        const { st, firstCh1 } = await run('b16Melanoma120kHz');
        expect(firstCh1).toBe(formatFrequency(1, 120000).trim()); // WMF0120000, not WMF0000000
        expect(st.ch1.hz).toBe(120000);
        expect(st.ch2.hz).toBe(120000);              // CH2 still ok (mirrors CH1)
        expect(st.ch2.outputOn).toBe(true);
        record('b16Melanoma120kHz', 'CH1 0Hz instead of 120kHz', st);
    });

    it('CANCERSARCOMABX: CH2 turns on (was: not turning on CH2)', async () => {
        const { st } = await run('cancerSarcomaBX');
        expect(st.ch2.outputOn).toBe(true);
        // Rob, 14 Aug 2026: CH2 should be a 27.12MHz SINE carrier under a SQUARE therapy
        // tone. Split waveforms mean no USA0 — see the split-carrier path in startProgram.
        expect(st.ch2.hz).toBe(27_120_000);
        expect(st.ch2.wave).toBe('SINE');
        expect(st.ch1.wave).toBe('SQUARE');
        expect(st.ch1.hz).toBe(1_607_450);           // CH1 therapy frequency
        record('cancerSarcomaBX', 'CH2 not turning on', st);
    });

    it('CANCERSARCOMABY: CH2 turns on (was: not turning on CH2)', async () => {
        const { st } = await run('cancerSarcomaBY');
        expect(st.ch2.outputOn).toBe(true);
        expect(st.ch2.hz).toBe(27_120_000);
        expect(st.ch2.wave).toBe('SINE');
        expect(st.ch1.wave).toBe('SQUARE');
        expect(st.ch1.hz).toBe(1_529_520);
        record('cancerSarcomaBY', 'CH2 not turning on', st);
    });

    it('F98GLIOMA200kHz: CH1 = 200kHz (was: CH1 set to 0Hz)', async () => {
        const { st, firstCh1 } = await run('f98Glioma200kHz');
        expect(firstCh1).toBe(formatFrequency(1, 200000).trim());
        expect(st.ch1.hz).toBe(200000);
        expect(st.ch2.hz).toBe(200000);
        record('f98Glioma200kHz', 'CH1 0Hz instead of 200kHz', st);
    });

    it('HERPES: valid two-channel output (reporter later confirmed "Herpes is ok")', async () => {
        const { st, firstCh1 } = await run('herpes');
        // The report's "???" was uncertainty; a follow-up email (22 Jul) confirmed herpes
        // is OK — on v1.8.5, where CH2 followed CH1. v1.8.6 briefly made it hold a
        // 27.1MHz carrier, which Rob never saw; when he asked for lyme (its twin) to have
        // "both channels the same as CH1" on 14 Aug, herpes was returned to matching it.
        expect(firstCh1).toBe(formatFrequency(1, 322).trim());
        expect(st.ch1.hz).toBe(322);
        expect(st.ch2.hz).toBe(322);
        expect(st.ch1.wave).toBe('SQUARE');
        expect(st.ch2.wave).toBe('SQUARE');
        expect(st.ch1.outputOn && st.ch2.outputOn).toBe(true);
        record('herpes', 'reporter confirmed OK', st);
    });

    // LYMPHOCYTE50HZ was on this list too, but Rob asked for the program to be deleted
    // (14 Aug 2026). tCells30Hz below is the same shape — no-carrier SINE/SINE — and still
    // covers the code path that produced the 0 Hz symptom.

    it('MCF7BREAST150kHz: CH1 = 150kHz (was: CH1 set to 0Hz)', async () => {
        const { st, firstCh1 } = await run('mcf7Breast150kHz');
        expect(firstCh1).toBe(formatFrequency(1, 150000).trim());
        expect(st.ch1.hz).toBe(150000);
        expect(st.ch2.hz).toBe(150000);
        record('mcf7Breast150kHz', 'CH1 0Hz instead of 150kHz', st);
    });

    it('MDAMB231BREAST150kHz: CH1 = 150kHz (was: CH1 set to 0Hz)', async () => {
        const { st, firstCh1 } = await run('mdaMB231Breast150kHz');
        expect(firstCh1).toBe(formatFrequency(1, 150000).trim());
        expect(st.ch1.hz).toBe(150000);
        expect(st.ch2.hz).toBe(150000);
        record('mdaMB231Breast150kHz', 'CH1 0Hz instead of 150kHz', st);
    });

    it('NATURALKILLERCELL: both SQUARE, CH1 = 200kHz (was: sine 0Hz)', async () => {
        const { st, firstCh1 } = await run('naturalKillerCell');
        expect(firstCh1).toBe(formatFrequency(1, 200000).trim());
        expect(st.ch1.hz).toBe(200000);
        expect(st.ch1.wave).toBe('SQUARE');          // was sine
        expect(st.ch2.wave).toBe('SQUARE');          // was sine
        expect(st.ch2.hz).toBe(200000);
        record('naturalKillerCell', 'sine 0Hz (wanted square 200kHz)', st);
    });

    it('TCELLS30HZ: CH1 = 30Hz (was: CH1 set to 0Hz)', async () => {
        const { st, firstCh1 } = await run('tCells30Hz');
        expect(firstCh1).toBe(formatFrequency(1, 30).trim());
        expect(st.ch1.hz).toBe(30);
        expect(st.ch2.hz).toBe(30);
        record('tCells30Hz', 'CH1 0Hz instead of 30Hz', st);
    });

    it('prints the proof table', () => {
        // eslint-disable-next-line no-console
        console.info('\n===== REPORTED BUGS — VERIFIED FIXED =====\n' + proof.join('\n') + '\n');
        expect(proof.length).toBe(10);   // lymphocyte50Hz removed at Rob's request
    });
});

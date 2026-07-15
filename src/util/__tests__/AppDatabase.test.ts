import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Mock Dexie with a minimal in-memory implementation so we don't rely on IndexedDB
vi.mock('dexie', () => {
  class FakeTable<T extends { id?: number; name: string; default?: any }> {
    private rows: T[] = [];
    private autoId = 1;

    where(fieldOrObj: keyof T | Partial<T>) {
      // Support where({ name: value }) shorthand
      if (typeof fieldOrObj === 'object') {
        const [field, val] = Object.entries(fieldOrObj)[0];
        return {
          first: async () => this.rows.find((r) => (r as any)[field] === val) as any,
          toArray: async () => this.rows.filter((r) => (r as any)[field] === val) as any,
          delete: async () => {
            this.rows = this.rows.filter((r) => (r as any)[field] !== val);
          },
        };
      }

      // Support where('name').equals(value) pattern
      const field = fieldOrObj;
      return {
        equals: (val: any) => ({
          first: async () => this.rows.find((r) => (r as any)[field] === val) as any,
          toArray: async () => this.rows.filter((r) => (r as any)[field] === val) as any,
          delete: async () => {
            this.rows = this.rows.filter((r) => (r as any)[field] !== val);
          },
        }),
      };
    }

    toCollection() {
      return {
        modify: async (fn: (row: T) => void) => {
          this.rows.forEach((r) => fn(r));
        },
      };
    }

    async put(row: T) {
      const idx = this.rows.findIndex((r) => r.name === row.name);
      if (idx >= 0) {
        this.rows[idx] = { ...this.rows[idx], ...row } as T;
      } else {
        (row as any).id = this.autoId++;
        this.rows.push(row);
      }
    }
  }

  class FakeDexie {
    private _table = new FakeTable<any>();
    constructor(_name: string) {}
    version() {
      return {
        stores: () => ({
          upgrade: (_cb: any) => this,
        }),
      } as any;
    }
    table() { return this._table as any; }
    async transaction(_mode: any, _tbl: any, fn: any) { await fn(); }
  }
  return { default: FakeDexie };
});

const readJSON = (p: string) => JSON.parse(fs.readFileSync(p, 'utf8'));

describe('AppDatabase (with mocked Dexie)', () => {
  const publicJsonPath = path.resolve(process.cwd(), 'public/defaultPrograms.json');

  let AppDatabase: any;

  beforeEach(async () => {
    // lazy import after mock
    AppDatabase = (await import('../AppDatabase')).default;
    // mock fetch to return default programs
    const data = readJSON(publicJsonPath);
    global.fetch = vi.fn().mockResolvedValue({ json: async () => data } as any);
  });

  it('preloads defaults idempotently and lists default programs', async () => {
    const db = new AppDatabase();
    await db.preloadDefaults();
    expect(db.preloadDone).toBe(true);

    const names1 = (await db.getDefaultPrograms()).map((p: any) => p.name).sort();
    await db.preloadDefaults(); // second call does nothing harmful
    const names2 = (await db.getDefaultPrograms()).map((p: any) => p.name).sort();
    expect(names1).toEqual(names2);
    expect(names1.length).toBeGreaterThan(0);
  });

  it('naturalKillerCell preloads as SINE/SINE (Lynne 10 Jun: was square)', async () => {
    const db = new AppDatabase();
    await db.preloadDefaults();

    const nkc = await db.loadData('naturalKillerCell');
    expect(nkc).toBeTruthy();
    expect(nkc.channel1wavetype).toBe('SINE');
    expect(nkc.channel2wavetype).toBe('SINE');
    expect(nkc.startFrequency).toBe(0);
    expect(nkc.data[0].frequency).toBe(200000);
  });

  it('preload upsert flips an existing SQUARE naturalKillerCell row to SINE (existing installs)', async () => {
    const db = new AppDatabase();
    // Simulate an install that already stored the pre-change SQUARE config; the
    // {...existing, ...row} upsert must overwrite the wavetypes from the JSON.
    await (db as any).programs.put({
      name: 'naturalKillerCell',
      data: [{ channel: 1, frequency: 200000, runTime: 28800000 }],
      range: 0, default: 1, maxTimeInMinutes: 480, startFrequency: 0,
      channel1wavetype: 'SQUARE', channel2wavetype: 'SQUARE',
    });
    await db.preloadDefaults();

    const nkc = await db.loadData('naturalKillerCell');
    expect(nkc.channel1wavetype).toBe('SINE');
    expect(nkc.channel2wavetype).toBe('SINE');
  });

  it('ttf program preloads with category, loop, carrier and 6 sine frequencies (Lynne 17 Jun)', async () => {
    const db = new AppDatabase();
    await db.preloadDefaults();

    const ttf = await db.loadData('ttf');
    expect(ttf).toBeTruthy();
    expect(ttf.category).toBe('ttf');
    expect(ttf.loop).toBe(1);
    expect(ttf.channel1wavetype).toBe('SINE');
    expect(ttf.channel2wavetype).toBe('SINE');
    // CH2 carrier 27.12 MHz, 12-hour total runtime.
    expect(ttf.startFrequency).toBe(27.12);
    expect(ttf.maxTimeInMinutes).toBe(720);
    // 6 frequencies, 3 minutes (180000 ms) each.
    expect(ttf.data.map((d: any) => d.frequency)).toEqual([1873.5, 2221.3, 5882.3, 6350.3, 8452.1, 10456.4]);
    expect(ttf.data.every((d: any) => d.runTime === 180000)).toBe(true);
  });

  it('dualFreq230and430Hz preloads as independent square dual-frequency, looped (27 Jun)', async () => {
    const db = new AppDatabase();
    await db.preloadDefaults();

    const p = await db.loadData('dualFreq230and430Hz');
    expect(p).toBeTruthy();
    expect(p.channel1wavetype).toBe('SQUARE');
    expect(p.channel2wavetype).toBe('SQUARE');
    // CH1 230 Hz (data); CH2 430 Hz (independent, in Hz — NOT a MHz carrier).
    expect(p.data.map((d: any) => d.frequency)).toEqual([230]);
    expect(p.channel2frequency).toBe(430);
    expect(p.startFrequency).toBe(0);
    // 60-minute cycle (3600s → 3_600_000 ms), looped.
    expect(p.data[0].runTime).toBe(3_600_000);
    expect(p.loop).toBe(1);
  });

  it('FSM programs preload under category "fsm" (Barry: Liver, Inflammation, 230/430)', async () => {
    const db = new AppDatabase();
    await db.preloadDefaults();

    // The two new single-frequency square FSM programs.
    const liver = await db.loadData('liver35Hz');
    expect(liver.category).toBe('fsm');
    expect(liver.channel1wavetype).toBe('SQUARE');
    expect(liver.channel2wavetype).toBe('SQUARE');
    expect(liver.data.map((d: any) => d.frequency)).toEqual([35]);
    expect(liver.maxTimeInMinutes).toBe(30);

    const infl = await db.loadData('inflammation284Hz');
    expect(infl.category).toBe('fsm');
    expect(infl.data.map((d: any) => d.frequency)).toEqual([284]);
    expect(infl.maxTimeInMinutes).toBe(30);

    // The 230/430 dual-frequency program moved into the FSM tab.
    const dual = await db.loadData('dualFreq230and430Hz');
    expect(dual.category).toBe('fsm');

    // All three FSM programs, and nothing else, carry category 'fsm'.
    const fsm = (await db.getDefaultPrograms())
      .filter((x: any) => (x.category || '') === 'fsm')
      .map((x: any) => x.name)
      .sort();
    expect(fsm).toEqual(['dualFreq230and430Hz', 'inflammation284Hz', 'liver35Hz']);
  });

  it('TTF tab holds the ttf programs; the cancer TTFields stay uncategorised', async () => {
    // TTF category = the Lynne 17 Jun `ttf` program + the 100-500kHz sweep
    // (Lynne 7 Jul). The mcf7/mdaMB231/b16/f98 programs stay in the Rife list.
    const db = new AppDatabase();
    await db.preloadDefaults();

    const ttfTab = (await db.getDefaultPrograms())
      .filter((p: any) => (p.category || '') === 'ttf')
      .map((p: any) => p.name).sort();
    expect(ttfTab).toEqual(['ttFields100to500kHz', 'ttf']);

    for (const name of ['mcf7Breast150kHz', 'mdaMB231Breast150kHz', 'b16Melanoma120kHz', 'f98Glioma200kHz']) {
      const p = await db.loadData(name);
      expect(p.category ?? '').not.toBe('ttf');
    }
  });

  it('ttFields100to500kHz preloads: 100-500kHz sine, 200kHz for 20min, looped 8h (Lynne 7 Jul)', async () => {
    const db = new AppDatabase();
    await db.preloadDefaults();

    const p = await db.loadData('ttFields100to500kHz');
    expect(p.category).toBe('ttf');
    expect(p.channel1wavetype).toBe('SINE');
    expect(p.channel2wavetype).toBe('SINE');
    // CH2 holds a fixed 27.12 MHz sine carrier for the whole run (startFrequency != 0
    // keeps mirrorCh2ToCh1 OFF), while CH1 loops the 100–500 kHz audio frequencies.
    expect(p.startFrequency).toBe(27.12);
    expect(p.loop).toBe(1);
    expect(p.maxTimeInMinutes).toBe(480); // 8 hours
    expect(p.data.map((d: any) => d.frequency))
      .toEqual([100000, 150000, 200000, 250000, 300000, 350000, 400000, 450000, 500000]);
    const runTimeByFreq = Object.fromEntries(p.data.map((d: any) => [d.frequency, d.runTime]));
    expect(runTimeByFreq[200000]).toBe(1_200_000); // 20 min
    expect(runTimeByFreq[100000]).toBe(300_000);   // 5 min
    expect(runTimeByFreq[500000]).toBe(300_000);   // 5 min
  });

  it('saves and retrieves custom programs with correct coercions', async () => {
    const db = new AppDatabase();
    await db.preloadDefaults();

    const name = 'myCustom';
    await db.saveData({
      name,
      range: false,
      data: [{ channel: 1, frequency: 123.45, runTime: 1000 }],
      maxTimeInMinutes: 1,
      default: 0,
      startFrequency: 0,
      sliderMinV: 0.5,
      sliderMaxV: 2.5,
      sliderStepV: 0.1,
      startIntensityV: 1.1,
      mirror: true,
    });

    const isThere = await db.testForProgram(name);
    expect(isThere).toBe(true);

    const loaded = await db.loadData(name);
    expect(loaded.name).toBe(name);
    expect(loaded.default).toBe(0);
    expect(loaded.range).toBe(0);
    expect(loaded.sliderMinV).toBe(0.5);
    expect(loaded.sliderMaxV).toBe(2.5);
    expect(loaded.sliderStepV).toBe(0.1);
    expect(loaded.startIntensityV).toBe(1.1);

    const customs = await db.getCustomPrograms();
    const first = customs.find((p: any) => p.name === name);
    expect(first).toBeTruthy();
    expect(first!.default).toBe(false);
  });

  it('mirror coercion supports multiple types and fallback', async () => {
    const db = new AppDatabase();
    await db.preloadDefaults();

    await db.saveData({ name: 'm_bool_true', range: 0, data: [], maxTimeInMinutes: 0, default: 0, startFrequency: 0, mirror: true });
    await db.saveData({ name: 'm_num1', range: 0, data: [], maxTimeInMinutes: 0, default: 0, startFrequency: 0, mirror: 1 });
    await db.saveData({ name: 'm_str1', range: 0, data: [], maxTimeInMinutes: 0, default: 0, startFrequency: 0, mirror: '1' as any });
    await db.saveData({ name: 'm_bool_false', range: 0, data: [], maxTimeInMinutes: 0, default: 0, startFrequency: 0, mirror: false });
    await db.saveData({ name: 'm_num0', range: 0, data: [], maxTimeInMinutes: 0, default: 0, startFrequency: 0, mirror: 0 });
    await db.saveData({ name: 'm_str0', range: 0, data: [], maxTimeInMinutes: 0, default: 0, startFrequency: 0, mirror: '0' as any });
    await db.saveData({ name: 'm_str_true', range: 0, data: [], maxTimeInMinutes: 0, default: 0, startFrequency: 0, mirror: 'true' as any });
    await db.saveData({ name: 'm_str_false', range: 0, data: [], maxTimeInMinutes: 0, default: 0, startFrequency: 0, mirror: 'false' as any });
    await db.saveData({ name: 'm_undef', range: 0, data: [], maxTimeInMinutes: 0, default: 0, startFrequency: 0 });

    const get = (name: string) => db.loadData(name).then((r: any) => r.mirror);
    expect(await get('m_bool_true')).toBe(1);
    expect(await get('m_num1')).toBe(1);
    expect(await get('m_str1')).toBe(1);
    expect(await get('m_str_true')).toBe(1);
    expect(await get('m_bool_false')).toBe(0);
    expect(await get('m_num0')).toBe(0);
    expect(await get('m_str0')).toBe(0);
    expect(await get('m_str_false')).toBe(0);
    expect(await db.loadData('m_undef').then((r: any) => r.mirror)).toBeUndefined();
  });

  it('loadData throws on missing item', async () => {
    const db = new AppDatabase();
    await db.preloadDefaults();
    await expect(db.loadData('does_not_exist')).rejects.toThrowError();
  });

  it('clearDatabase removes defaults then re-preloads them', async () => {
    const db = new AppDatabase();
    await db.preloadDefaults();
    const before = await db.getDefaultPrograms();
    expect(before.length).toBeGreaterThan(0);

    await db.clearDatabase();
    const after = await db.getDefaultPrograms();
    expect(after.length).toBeGreaterThan(0);
  });
});

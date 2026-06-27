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

  it('only the ttf program carries category "ttf"; the cancer TTFields stay uncategorised', async () => {
    // Lynne 17 Jun scope decision: TTF tab holds only the new program; the
    // existing mcf7/mdaMB231/b16/f98 programs remain in the Rife list.
    const db = new AppDatabase();
    await db.preloadDefaults();

    const ttfTab = (await db.getDefaultPrograms()).filter((p: any) => (p.category || '') === 'ttf');
    expect(ttfTab.map((p: any) => p.name)).toEqual(['ttf']);

    for (const name of ['mcf7Breast150kHz', 'mdaMB231Breast150kHz', 'b16Melanoma120kHz', 'f98Glioma200kHz']) {
      const p = await db.loadData(name);
      expect(p.category ?? '').not.toBe('ttf');
    }
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

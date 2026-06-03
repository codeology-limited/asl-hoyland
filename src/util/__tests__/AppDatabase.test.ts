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
    // ensure a fresh module (and fresh preloadDone state) per test
    vi.resetModules();
    // lazy import after mock
    AppDatabase = (await import('../AppDatabase')).default;
    // mock fetch to return default programs. Mark ok:true so the new res.ok
    // guard passes; supply a json content-type header for the content-type guard.
    const data = readJSON(publicJsonPath);
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => data,
    } as any);
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

  it('a non-ok fetch leaves preloadDone false and does NOT throw out of preloadDefaults', async () => {
    // Non-ok HTTP response: the internal throw must be caught and logged, not
    // propagated, and the DB must remain un-preloaded so a later call can retry.
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      headers: { get: () => 'text/plain' },
      json: async () => ({}),
    } as any);

    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const db = new AppDatabase();

    // Should resolve (not reject) even though the fetch failed.
    await expect(db.preloadDefaults()).resolves.toBeUndefined();
    expect(db.preloadDone).toBe(false);

    // No default programs got written.
    const defaults = await db.getDefaultPrograms();
    expect(defaults.length).toBe(0);

    errSpy.mockRestore();
  });

  it('a non-ok fetch can be retried successfully on a later call', async () => {
    const data = readJSON(publicJsonPath);
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // First attempt fails.
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      headers: { get: () => null },
      json: async () => ({}),
    } as any);

    const db = new AppDatabase();
    await db.preloadDefaults();
    expect(db.preloadDone).toBe(false);

    // Second attempt succeeds and seeds the defaults.
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => data,
    } as any);

    await db.preloadDefaults();
    expect(db.preloadDone).toBe(true);
    expect((await db.getDefaultPrograms()).length).toBeGreaterThan(0);

    errSpy.mockRestore();
  });

  it('saveData throws when a custom save collides with an existing default name', async () => {
    const db = new AppDatabase();
    await db.preloadDefaults();

    // Pick any seeded default program name.
    const existingDefault = (await db.getDefaultPrograms())[0];
    expect(existingDefault).toBeTruthy();

    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(
      db.saveData({
        name: existingDefault.name,
        range: false,
        data: [{ channel: 1, frequency: 1, runTime: 1000 }],
        maxTimeInMinutes: 1,
        default: 0, // falsy => custom save, must NOT clobber the default
        startFrequency: 0,
      })
    ).rejects.toThrowError(/default program named .* already exists/i);
    errSpy.mockRestore();

    // The original default row must be untouched (still default, original data).
    const reloaded = await db.loadData(existingDefault.name);
    expect(!!reloaded.default).toBe(true);
    expect(reloaded.data).toEqual(existingDefault.data);
  });

  it('saveData still updates an existing DEFAULT when the incoming save is also default', async () => {
    const db = new AppDatabase();
    await db.preloadDefaults();
    const existingDefault = (await db.getDefaultPrograms())[0];

    // default:1 incoming => allowed to update (this is how seeding/curated
    // updates work); collision guard only blocks custom-over-default.
    await db.saveData({
      name: existingDefault.name,
      range: true,
      data: [{ channel: 1, frequency: 999, runTime: 2000 }],
      maxTimeInMinutes: 5,
      default: 1,
      startFrequency: 0,
    });

    const reloaded = await db.loadData(existingDefault.name);
    expect(reloaded.range).toBe(1);
    expect(reloaded.maxTimeInMinutes).toBe(5);
  });

  it('a normal custom save still works (no collision with a default name)', async () => {
    const db = new AppDatabase();
    await db.preloadDefaults();

    const name = 'uniqueCustomThatIsNotADefault';
    await db.saveData({
      name,
      range: false,
      data: [{ channel: 1, frequency: 42, runTime: 1000 }],
      maxTimeInMinutes: 1,
      default: 0,
      startFrequency: 0,
    });

    const loaded = await db.loadData(name);
    expect(loaded.name).toBe(name);
    expect(loaded.default).toBe(0);

    // Re-saving the same custom name (still custom) must not throw.
    await expect(
      db.saveData({
        name,
        range: true,
        data: [{ channel: 1, frequency: 43, runTime: 1000 }],
        maxTimeInMinutes: 2,
        default: 0,
        startFrequency: 0,
      })
    ).resolves.toBeUndefined();
    const reloaded = await db.loadData(name);
    expect(reloaded.range).toBe(1);
    expect(reloaded.maxTimeInMinutes).toBe(2);
  });
});

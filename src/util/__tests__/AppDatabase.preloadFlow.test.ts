import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Dexie with minimal in-memory behavior for concurrency-safe tests
vi.mock('dexie', () => {
  class FakeTable<T extends { id?: number; name: string; default: 0 | 1 }> {
    rows: T[] = [];
    autoId = 1;
    where(field: keyof T) {
      return {
        equals: (val: any) => ({
          first: async () => this.rows.find((r) => (r as any)[field] === val) as any,
          toArray: async () => this.rows.filter((r) => (r as any)[field] === val) as any,
          delete: async () => { this.rows = this.rows.filter((r) => (r as any)[field] !== val); },
        }),
      };
    }
    toCollection() { return { modify: async (fn: (row: T) => void) => { this.rows.forEach(fn); } }; }
    async put(row: T) {
      const i = this.rows.findIndex((r) => r.name === row.name);
      if (i >= 0) this.rows[i] = { ...this.rows[i], ...row } as T; else { (row as any).id = this.autoId++; this.rows.push(row); }
    }
  }
  class FakeDexie {
    _t = new FakeTable<any>();
    constructor(_n: string) {}
    version() {
      const chain = {
        stores: (_: any) => chain,
        upgrade: (_cb: any) => chain,
      } as any;
      return chain;
    }
    table() { return this._t as any; }
    async transaction(_mode: any, _tbl: any, fn: any) { await fn(); }
  }
  return { default: FakeDexie };
});

describe('AppDatabase preload flow', () => {
  let AppDatabase: any;

  beforeEach(async () => {
    vi.resetModules();
    AppDatabase = (await import('../AppDatabase')).default;
  });

  it('getDefaultPrograms works even without manual preload (ensurePreloaded inside)', async () => {
    const data = {
      alpha: { default: true, range: false, data: [100], runTimeInMinutes: 1, startFrequency: 0 },
      beta: { default: true, range: false, data: [200], runTimeInMinutes: 1, startFrequency: 0 },
    } as const;
    // ok:true is required so the new res.ok guard in preloadDefaults passes;
    // headers.get provided for the content-type guard.
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => data,
    } as any);

    const db = new AppDatabase();
    const names = (await db.getDefaultPrograms()).map((p: any) => p.name).sort();
    expect(names).toEqual(['alpha', 'beta']);
    // preloadDone should be true after implicit ensure
    expect(db.preloadDone).toBe(true);
  });

  it('preloadDefaults is single-flight under concurrency and returns stable data', async () => {
    const data = {
      gamma: { default: true, range: false, data: [300], runTimeInMinutes: 1, startFrequency: 0 },
      delta: { default: true, range: false, data: [400], runTimeInMinutes: 1, startFrequency: 0 },
    } as const;
    // Add slight delay to simulate real fetch
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => { await new Promise(r => setTimeout(r, 50)); return data; },
    } as any);

    const db = new AppDatabase();
    // Fire two concurrent calls
    await Promise.all([db.preloadDefaults(), db.preloadDefaults()]);

    const names = (await db.getDefaultPrograms()).map((p: any) => p.name).sort();
    expect(names).toEqual(['delta', 'gamma']);
    expect(db.preloadDone).toBe(true);
    // fetch should be called once due to single-flight
    expect((global.fetch as any).mock.calls.length).toBe(1);
  });

  it('a non-ok fetch leaves preloadDone false and is caught (no throw), allowing retry', async () => {
    const data = {
      epsilon: { default: true, range: false, data: [500], runTimeInMinutes: 1, startFrequency: 0 },
    } as const;
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // First call: server returns a non-ok status -> internal throw is caught,
    // preloadDefaults resolves, preloadDone stays false, nothing seeded.
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      headers: { get: () => null },
      json: async () => ({}),
    } as any);

    const db = new AppDatabase();
    await expect(db.preloadDefaults()).resolves.toBeUndefined();
    expect(db.preloadDone).toBe(false);
    expect((await db.getDefaultPrograms()).length).toBe(0);

    // Retry now succeeds.
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => data,
    } as any);
    await db.preloadDefaults();
    expect(db.preloadDone).toBe(true);
    expect((await db.getDefaultPrograms()).map((p: any) => p.name)).toEqual(['epsilon']);

    errSpy.mockRestore();
  });
});

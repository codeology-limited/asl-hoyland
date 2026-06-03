import Dexie from 'dexie';

export type DBBool = 0 | 1;

export type WaveType = 'SINE' | 'SQUARE' | 'TRIANGLE' | 'SAW' | string;

export interface ProgramRow {
  id?: number;
  name: string;                 // UNIQUE
  range: DBBool;                // stored as 0/1
  data: { channel: number; frequency: number | string; runTime: number; sweepTo?: number }[];
  maxTimeInMinutes: number;
  default: DBBool | boolean;              // stored as 0/1
  startFrequency: number;

  // NEW optional props (persisted)
  sliderMinV?: number;
  sliderMaxV?: number;
  sliderStepV?: number;
  startIntensityV?: number;
  sliderPercent?: number;

  channel1wavetype?: WaveType;
  channel2wavetype?: WaveType;
  onkeysec?: number;
  offkeysec?: number;
  mirror?: DBBool;
}

export interface OldFormatProgram {
  default: boolean;
  range: boolean;
  data: number[];               // Hz
  runTimeInMinutes: number;
  startFrequency: number;

  // optional new props in “old” blobs
  sliderMinV?: number;
  sliderMaxV?: number;
  sliderStepV?: number;
  startIntensityV?: number;
  sliderPercent?: number;
  channel1wavetype?: WaveType;
  channel2wavetype?: WaveType;
  onkeysec?: number;
  offkeysec?: number;
  mirror?: boolean;
}

export interface NewFormatProgram {
  default: boolean;
  range: boolean;
  data: { f: number; s: number; sweepTo?: number }[]; // f=Hz, s=seconds, sweepTo=end Hz for inline sweep
  runTimeInMinutes: number;
  startFrequency: number;

  // optional new props
  sliderMinV?: number;
  sliderMaxV?: number;
  sliderStepV?: number;
  startIntensityV?: number;
  sliderPercent?: number;
  channel1wavetype?: WaveType;
  channel2wavetype?: WaveType;
  onkeysec?: number;
  offkeysec?: number;
  mirror?: boolean;
}

const b2n = (b: boolean): DBBool => (b ? 1 : 0);
const n2b = (n: DBBool | number | boolean): boolean => !!Number(n);

// Coerce any unknown to number with fractional support + safe fallback
function num(v: unknown, fallback: number): number {
  if (v === null || v === undefined) return fallback;
  const n = typeof v === 'string' ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

// Safely coerce maybe-bool to DBBool
function maybeBoolToDB(v: unknown, fallback: DBBool = 0 as DBBool): DBBool {
  if (typeof v === 'boolean') return b2n(v);
  if (typeof v === 'number') return (v ? 1 : 0) as DBBool;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (s === '1' || s === 'true') return 1;
    if (s === '0' || s === 'false') return 0;
  }
  return fallback;
}

export default class AppDatabase extends Dexie {
  programs!: Dexie.Table<ProgramRow, number>;
  preloadDone = false;

  /** prevents concurrent preloads */
  private _preloadInFlight: Promise<void> | null = null;

  constructor() {
    super('AppDatabase');

    // v1 (legacy)
    this.version(1).stores({
      programs: '++id,&name,range,default,maxTimeInMinutes,startFrequency',
    });

    // v2: add new fields (Dexie doesn’t require listing *all* fields; we keep indexes consistent)
    this.version(2)
        .stores({
          // Keep same indexes; new fields are still persisted
          programs: '++id,&name,range,default,maxTimeInMinutes,startFrequency',
        })
        .upgrade(async (tx) => {
          const table = tx.table<ProgramRow>('programs');
          await table.toCollection().modify((row) => {
            // Ensure new numeric props are initialised to sensible defaults if missing
            if (row.sliderMinV === undefined) row.sliderMinV = 1;
            if (row.sliderMaxV === undefined) row.sliderMaxV = 20;
            if (row.sliderStepV === undefined) row.sliderStepV = 1;
            // Intensity defaults to min if not present
            if (row.startIntensityV === undefined) row.startIntensityV = row.sliderMinV ?? 1;
            // Optional fields: no action needed if absent
          });
        });

    this.programs = this.table('programs');
  }

  /** Type guards */
  private isOldFormat(p: unknown): p is OldFormatProgram {
    if (!p || typeof p !== 'object') return false;
    const obj = p as Record<string, unknown>;
    const data = obj.data as unknown;
    if (!Array.isArray(data)) return false;
    // Old format: data is a flat number[] (Hz values). An EMPTY data array is
    // ambiguous (could be either shape) but is treated as old-format here as
    // long as the runtime/start markers exist — preloadDefaults checks
    // isOldFormat first, so empty-data programs fall into the old-format path.
    if (data.length > 0 && typeof data[0] !== 'number') return false;
    return 'runTimeInMinutes' in obj && 'startFrequency' in obj;
  }

  private isNewFormat(p: unknown): p is NewFormatProgram {
    if (!p || typeof p !== 'object') return false;
    const obj = p as Record<string, unknown>;
    const data = obj.data as unknown;
    if (!Array.isArray(data)) return false;
    // Empty data: only the runtime/start markers distinguish a valid program
    // shell. We accept it (same as isOldFormat) so an empty new-format blob is
    // not misclassified as "unknown" and silently skipped.
    if (data.length === 0) return 'runTimeInMinutes' in obj && 'startFrequency' in obj;
    // Non-empty new format: first item is an object with {f, s} (Hz, seconds).
    // candida is currently the only new-format default — its data[0] is {f,s}.
    const first = data[0] as Record<string, unknown>;
    return typeof first === 'object' && first != null && 'f' in first && 's' in first
      && 'runTimeInMinutes' in obj && 'startFrequency' in obj;
  }

  /** Ensure defaults are preloaded; safe to call multiple times. */
  async ensurePreloaded() {
    if (this.preloadDone) return;
    await this.preloadDefaults();
  }

  /** Preload defaults from /defaultPrograms.json (idempotent, transactional, single-flight). */
  async preloadDefaults() {
    if (this._preloadInFlight) return this._preloadInFlight;

    this._preloadInFlight = (async () => {
      try {
        const base = typeof window !== 'undefined' && window.location?.origin
            ? window.location.origin
            : 'http://localhost';
        const defaultProgramsUrl = new URL('/defaultPrograms.json', base).toString();
        const res = await fetch(defaultProgramsUrl);
        // Guard against silent failure: a non-ok HTTP response would otherwise
        // (depending on the fetch impl) parse to garbage/empty and leave the DB
        // empty while still reporting "success". Throwing here keeps preloadDone
        // false so ensurePreloaded() can retry on the next call.
        if (!res.ok) throw new Error('Failed to fetch defaultPrograms.json: HTTP ' + res.status);
        // Optional defensive content-type guard (some dev servers return HTML
        // error pages with 200); only warn so we don't break valid setups.
        const contentType = res.headers?.get?.('content-type');
        if (contentType && !/json/i.test(contentType)) {
          console.warn('Unexpected content-type for defaultPrograms.json:', contentType);
        }
        const defaults = (await res.json()) as Record<string, unknown>;

        await this.transaction('rw', this.programs, async () => {
          // v1.6.11: one-shot removal — Lynne reported the machine rejects this program.
          await this.programs.where('name').equals('ttFields100to300kHz').delete();

          for (const [name, programAny] of Object.entries(defaults)) {
            let dataWithRunTime: ProgramRow['data'] = [];

            if (this.isOldFormat(programAny)) {
              const program = programAny;

              const perItemMs =
                  program.data.length > 0
                      ? (num(program.runTimeInMinutes, 0) * 60000) / program.data.length
                      : 0;

              dataWithRunTime = program.data.map((frequency) => ({
                channel: 1,
                frequency,
                runTime: perItemMs,
              }));

              const row: Omit<ProgramRow, 'id'> = {
                name,
                data: dataWithRunTime,
                range: b2n(!!program.range),
                default: b2n(!!program.default),
                maxTimeInMinutes: num(program.runTimeInMinutes, 0),
                startFrequency: num(program.startFrequency, 0),

                // NEW props with defaults (min=1, max=20, step=1)
                sliderMinV: num(program.sliderMinV, 1),
                sliderMaxV: num(program.sliderMaxV, 20),
                sliderStepV: num(program.sliderStepV, 1),
                startIntensityV: num(program.startIntensityV, num(program.sliderMinV, 1)),
                ...(program.sliderPercent !== undefined ? { sliderPercent: num(program.sliderPercent, 0) } : {}),
                ...(program.channel1wavetype !== undefined ? { channel1wavetype: program.channel1wavetype } : {}),
                ...(program.channel2wavetype !== undefined ? { channel2wavetype: program.channel2wavetype } : {}),
                ...(program.onkeysec !== undefined ? { onkeysec: num(program.onkeysec, 0) } : {}),
                ...(program.offkeysec !== undefined ? { offkeysec: num(program.offkeysec, 0) } : {}),
                ...(program.mirror !== undefined ? { mirror: b2n(!!program.mirror) } : {}),
              };

              // Upsert by UNIQUE name
              const existing = await this.programs.where('name').equals(name).first();
              if (existing) {
                await this.programs.put({ ...existing, ...row });
              } else {
                await this.programs.put(row as ProgramRow);
              }

            } else if (this.isNewFormat(programAny)) {
              const program = programAny;

              dataWithRunTime = program.data.map((item) => ({
                channel: 1,
                frequency: num(item.f, 0),
                runTime: num(item.s, 0) * 1000,
                ...(item.sweepTo !== undefined ? { sweepTo: num(item.sweepTo, 0) } : {}),
              }));

              const row: Omit<ProgramRow, 'id'> = {
                name,
                data: dataWithRunTime,
                range: b2n(!!program.range),
                default: b2n(!!program.default),
                maxTimeInMinutes: num(program.runTimeInMinutes, 0),
                startFrequency: num(program.startFrequency, 0),

                // NEW props with defaults (min=1, max=20, step=1)
                sliderMinV: num(program.sliderMinV, 1),
                sliderMaxV: num(program.sliderMaxV, 20),
                sliderStepV: num(program.sliderStepV, 1),
                startIntensityV: num(program.startIntensityV, num(program.sliderMinV, 1)),
                ...(program.sliderPercent !== undefined ? { sliderPercent: num(program.sliderPercent, 0) } : {}),
                ...(program.channel1wavetype !== undefined ? { channel1wavetype: program.channel1wavetype } : {}),
                ...(program.channel2wavetype !== undefined ? { channel2wavetype: program.channel2wavetype } : {}),
                ...(program.onkeysec !== undefined ? { onkeysec: num(program.onkeysec, 0) } : {}),
                ...(program.offkeysec !== undefined ? { offkeysec: num(program.offkeysec, 0) } : {}),
                ...(program.mirror !== undefined ? { mirror: b2n(!!program.mirror) } : {}),
              };

              // Upsert by UNIQUE name
              const existing = await this.programs.where('name').equals(name).first();
              if (existing) {
                await this.programs.put({ ...existing, ...row });
              } else {
                await this.programs.put(row as ProgramRow);
              }

            } else {
              // Unknown shape; skip safely
              continue;
            }
          }
        });

        this.preloadDone = true;
      } catch (err) {
        console.error('Failed to preload defaults:', err);
      } finally {
        this._preloadInFlight = null;
      }
    })();

    return this._preloadInFlight;
  }

  async resetData() {
    await this.clearDatabase();
  }

  /** Clears only defaults, then re-preloads (safe + idempotent). */
  async clearDatabase() {
    try {
      await this.transaction('rw', this.programs, async () => {
        await this.programs.where('default').equals(1).delete();
      });
      await this.preloadDefaults();
    } catch (err) {
      console.error('Failed to clear the database:', err);
    }
  }

  async loadData(programName: string): Promise<ProgramRow> {
    try {
      await this.ensurePreloaded();
      const program = await this.programs.where('name').equals(programName).first();
      if (!program) throw new Error(`No data found for ${programName}`);
      return program;
    } catch (err) {
      console.error(`Failed to load data: ${err}`);
      throw err;
    }
  }

  /** Save or update by name (no duplicates thanks to &name + put). */
  async saveData(program: {
    name: string;
    range: number | boolean;
    data: ProgramRow['data'];
    maxTimeInMinutes: number;
    default: number | boolean;
    startFrequency: number;

    // NEW props (optional in saves)
    sliderMinV?: number;
    sliderMaxV?: number;
    sliderStepV?: number;
    startIntensityV?: number;
    sliderPercent?: number;
    channel1wavetype?: WaveType;
    channel2wavetype?: WaveType;
    onkeysec?: number;
    offkeysec?: number;
    mirror?: number | boolean;
  }): Promise<void> {
    try {
      if (!program?.name) return;

      const base: Omit<ProgramRow, 'id'> = {
        name: program.name,
        range: b2n(n2b(program.range)),
        data: program.data,
        maxTimeInMinutes: num(program.maxTimeInMinutes, 0),
        default: b2n(n2b(program.default)),
        startFrequency: num(program.startFrequency, 0),

        // Apply defaults for slider bounds if provided; else omit
        ...(program.sliderMinV !== undefined ? { sliderMinV: num(program.sliderMinV, 1) } : {}),
        ...(program.sliderMaxV !== undefined ? { sliderMaxV: num(program.sliderMaxV, 20) } : {}),
        ...(program.sliderStepV !== undefined ? { sliderStepV: num(program.sliderStepV, 1) } : {}),
        ...(program.startIntensityV !== undefined
            ? { startIntensityV: num(program.startIntensityV, program.sliderMinV ?? 1) }
            : {}),
        ...(program.sliderPercent !== undefined ? { sliderPercent: num(program.sliderPercent, 0) } : {}),

        ...(program.channel1wavetype !== undefined ? { channel1wavetype: program.channel1wavetype } : {}),
        ...(program.channel2wavetype !== undefined ? { channel2wavetype: program.channel2wavetype } : {}),
        ...(program.onkeysec !== undefined ? { onkeysec: num(program.onkeysec, 0) } : {}),
        ...(program.offkeysec !== undefined ? { offkeysec: num(program.offkeysec, 0) } : {}),
        ...(program.mirror !== undefined ? { mirror: maybeBoolToDB(program.mirror) } : {}),
      };

      const row: Omit<ProgramRow, 'id'> = base;

      // Upsert by name
      const existing = await this.programs.where('name').equals(program.name).first();
      if (existing) {
        // Collision guard: a custom save (default falsy) must not silently
        // overwrite a curated DEFAULT program of the same name. Throw clearly
        // so the caller can prompt for a different name. (We keep the &name
        // index/schema stable — this is the conservative fix.)
        if (n2b(existing.default) && !n2b(program.default)) {
          throw new Error(
            `A default program named ${program.name} already exists; choose a different name`
          );
        }
        await this.programs.put({ ...existing, ...row });
      } else {
        await this.programs.put(row as ProgramRow);
      }
    } catch (err) {
      console.error('Failed to save data:', err);
      throw err;
    }
  }

  /** Delete a custom program by name. Default (curated) programs cannot be deleted. */
  async deleteData(name: string): Promise<void> {
    try {
      const existing = await this.programs.where('name').equals(name).first();
      if (!existing) return;
      if (n2b(existing.default)) {
        throw new Error(`Default program "${name}" cannot be deleted.`);
      }
      await this.programs.where('name').equals(name).delete();
    } catch (err) {
      console.error('Failed to delete data:', err);
      throw err;
    }
  }

  async getDefaultPrograms(): Promise<ProgramRow[]> {
    try {
      await this.ensurePreloaded();
      const rows = await this.programs.where('default').equals(1).toArray();
      return rows;
    } catch (err) {
      console.error('Failed to get default programs:', err);
      throw err;
    }
  }

  async getCustomPrograms(): Promise<ProgramRow[]> {
    try {
      await this.ensurePreloaded();
      const rows = await this.programs.where('default').equals(0).toArray();
      return rows.map((row) => ({ ...row, default: !!row.default }));
    } catch (err) {
      console.error('Failed to get custom programs:', err);
      throw err;
    }
  }

  async testForProgram(name: string): Promise<boolean> {
    try {
      await this.ensurePreloaded();
      return !!(await this.programs.where({ name }).first());
    } catch (err) {
      console.error('Failed to test for program:', err);
      return false;
    }
  }
}

import Dexie from 'dexie';

type DBBool = 0 | 1;

type WaveType = 'SINE' | 'SQUARE' | 'TRIANGLE' | 'SAW' | string;

interface ProgramRow {
  id?: number;
  name: string;                 // UNIQUE
  range: DBBool;                // stored as 0/1
  data: { channel: number; frequency: number | string; runTime: number }[];
  maxTimeInMinutes: number;
  default: DBBool;              // stored as 0/1
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

interface OldFormatProgram {
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

interface NewFormatProgram {
  default: boolean;
  range: boolean;
  data: { f: number; s: number }[]; // f=Hz, s=seconds
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
            // Optional, leave undefined if not present
            if (row.sliderPercent === undefined) row.sliderPercent = undefined;

            // Optional channel settings / mirror
            if (row.channel1wavetype === undefined) row.channel1wavetype = undefined;
            if (row.channel2wavetype === undefined) row.channel2wavetype = undefined;
            if (row.onkeysec === undefined) row.onkeysec = undefined;
            if (row.offkeysec === undefined) row.offkeysec = undefined;
            if (row.mirror === undefined) row.mirror = undefined;
          });
        });

    this.programs = this.table('programs');
  }

  /** Type guards */
  private isOldFormat(p: any): p is OldFormatProgram {
    return Array.isArray(p?.data)
        && (p.data.length === 0 || typeof p.data[0] === 'number')
        && 'runTimeInMinutes' in p
        && 'startFrequency' in p;
  }

  private isNewFormat(p: any): p is NewFormatProgram {
    return Array.isArray(p?.data)
        && (p.data.length === 0 || typeof p.data[0] === 'object')
        && 'f' in (p.data[0] ?? { f: 0, s: 0 })
        && 's' in (p.data[0] ?? { f: 0, s: 0 })
        && 'runTimeInMinutes' in p
        && 'startFrequency' in p;
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
        const res = await fetch('/defaultPrograms.json');
        const defaults = await res.json();

        await this.transaction('rw', this.programs, async () => {
          for (const [name, programAny] of Object.entries<any>(defaults)) {
            let dataWithRunTime: ProgramRow['data'] = [];

            if (this.isOldFormat(programAny)) {
              const program = programAny as OldFormatProgram;

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
                sliderPercent: program.sliderPercent !== undefined ? num(program.sliderPercent, 0) : undefined,

                channel1wavetype: program.channel1wavetype,
                channel2wavetype: program.channel2wavetype,
                onkeysec: program.onkeysec !== undefined ? num(program.onkeysec, 0) : undefined,
                offkeysec: program.offkeysec !== undefined ? num(program.offkeysec, 0) : undefined,
                mirror: program.mirror !== undefined ? b2n(!!program.mirror) : undefined,
              };

              // Upsert by UNIQUE name
              const existing = await this.programs.where('name').equals(name).first();
              if (existing) {
                await this.programs.put({ ...existing, ...row });
              } else {
                await this.programs.put(row as ProgramRow);
              }

            } else if (this.isNewFormat(programAny)) {
              const program = programAny as NewFormatProgram;

              dataWithRunTime = program.data.map((item) => ({
                channel: 1,
                frequency: num(item.f, 0),
                runTime: num(item.s, 0) * 1000,
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
                sliderPercent: program.sliderPercent !== undefined ? num(program.sliderPercent, 0) : undefined,

                channel1wavetype: program.channel1wavetype,
                channel2wavetype: program.channel2wavetype,
                onkeysec: program.onkeysec !== undefined ? num(program.onkeysec, 0) : undefined,
                offkeysec: program.offkeysec !== undefined ? num(program.offkeysec, 0) : undefined,
                mirror: program.mirror !== undefined ? b2n(!!program.mirror) : undefined,
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

      const row: Omit<ProgramRow, 'id'> = {
        name: program.name,
        range: b2n(n2b(program.range)),
        data: program.data,
        maxTimeInMinutes: num(program.maxTimeInMinutes, 0),
        default: b2n(n2b(program.default)),
        startFrequency: num(program.startFrequency, 0),

        sliderMinV: program.sliderMinV !== undefined ? num(program.sliderMinV, 1) : undefined,
        sliderMaxV: program.sliderMaxV !== undefined ? num(program.sliderMaxV, 20) : undefined,
        sliderStepV: program.sliderStepV !== undefined ? num(program.sliderStepV, 1) : undefined,
        startIntensityV:
            program.startIntensityV !== undefined
                ? num(program.startIntensityV, program.sliderMinV ?? 1)
                : undefined,
        sliderPercent: program.sliderPercent !== undefined ? num(program.sliderPercent, 0) : undefined,

        channel1wavetype: program.channel1wavetype,
        channel2wavetype: program.channel2wavetype,
        onkeysec: program.onkeysec !== undefined ? num(program.onkeysec, 0) : undefined,
        offkeysec: program.offkeysec !== undefined ? num(program.offkeysec, 0) : undefined,
        mirror: program.mirror !== undefined ? maybeBoolToDB(program.mirror) : undefined,
      };

      // Upsert by name
      const existing = await this.programs.where('name').equals(program.name).first();
      if (existing) {
        await this.programs.put({ ...existing, ...row });
      } else {
        await this.programs.put(row as ProgramRow);
      }
    } catch (err) {
      console.error('Failed to save data:', err);
      throw err;
    }
  }

  async getDefaultPrograms() {
    try {
      await this.ensurePreloaded();
      const rows = await this.programs.where('default').equals(1).toArray();
      return rows.map((r) => ({ ...r, default: true }));
    } catch (err) {
      console.error('Failed to get default programs:', err);
      throw err;
    }
  }

  async getCustomPrograms() {
    try {
      await this.ensurePreloaded();
      const rows = await this.programs.where('default').equals(0).toArray();
      return rows.map((r) => ({ ...r, default: false }));
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

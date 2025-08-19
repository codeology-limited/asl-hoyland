import Dexie from 'dexie';

type DBBool = 0 | 1;

interface ProgramRow {
  id?: number;
  name: string;                 // UNIQUE
  range: DBBool;                // stored as 0/1
  data: { channel: number; frequency: number | string; runTime: number }[];
  maxTimeInMinutes: number;
  default: DBBool;              // stored as 0/1
  startFrequency: number;
}

interface OldFormatProgram {
  default: boolean;
  range: boolean;
  data: number[];               // Hz
  runTimeInMinutes: number;
  startFrequency: number;
}

interface NewFormatProgram {
  default: boolean;
  range: boolean;
  data: { f: number; s: number }[]; // f=Hz, s=seconds
  runTimeInMinutes: number;
  startFrequency: number;
}

const b2n = (b: boolean): DBBool => (b ? 1 : 0);
const n2b = (n: DBBool | number | boolean): boolean => !!Number(n);

export default class AppDatabase extends Dexie {
  programs!: Dexie.Table<ProgramRow, number>;
  preloadDone = false;

  /** prevents concurrent preloads */
  private _preloadInFlight: Promise<void> | null = null;

  constructor() {
    super('AppDatabase');
    // UNIQUE &name prevents duplicates
    this.version(1).stores({
      programs: '++id,&name,range,default,maxTimeInMinutes,startFrequency',
    });
    this.programs = this.table('programs');
  }

  /** Type guards */
  private isOldFormat(p: any): p is OldFormatProgram {
    return Array.isArray(p?.data)
        && typeof p.data[0] === 'number'
        && 'runTimeInMinutes' in p
        && 'startFrequency' in p;
  }

  private isNewFormat(p: any): p is NewFormatProgram {
    return Array.isArray(p?.data)
        && typeof p.data[0] === 'object'
        && 'f' in p.data[0]
        && 's' in p.data[0]
        && 'runTimeInMinutes' in p
        && 'startFrequency' in p;
  }

  /** Preload defaults from /defaultPrograms.json (idempotent, transactional, single-flight). */
  async preloadDefaults() {
    if (this._preloadInFlight) return this._preloadInFlight;

    this._preloadInFlight = (async () => {
      try {
        const res = await fetch('/defaultPrograms.json');
        const defaults = await res.json();

        await this.transaction('rw', this.programs, async () => {
          for (const [name, program] of Object.entries(defaults)) {
            let dataWithRunTime: ProgramRow['data'] = [];

            if (this.isOldFormat(program)) {
              const perItemMs =
                  program.data.length > 0
                      ? (program.runTimeInMinutes * 60000) / program.data.length
                      : 0;
              dataWithRunTime = program.data.map((frequency) => ({
                channel: 1,
                frequency,
                runTime: perItemMs,
              }));
            } else if (this.isNewFormat(program)) {
              dataWithRunTime = program.data.map((item) => ({
                channel: 1,
                frequency: item.f,
                runTime: item.s * 1000,
              }));
            } else {
              // Unknown shape; skip safely
              continue;
            }

            const row: Omit<ProgramRow, 'id'> = {
              name,
              data: dataWithRunTime,
              range: b2n(program.range),
              default: b2n(program.default),
              maxTimeInMinutes: program.runTimeInMinutes,
              startFrequency: program.startFrequency,
            };

            // Upsert by UNIQUE name (no duplicates even if called twice)
            const existing = await this.programs.where('name').equals(name).first();
            if (existing) {
              await this.programs.put({ ...existing, ...row });
            } else {
              await this.programs.put(row as ProgramRow);
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
  }): Promise<void> {
    try {
      if (!program?.name) return;

      const row: Omit<ProgramRow, 'id'> = {
        name: program.name,
        range: b2n(n2b(program.range)),
        data: program.data,
        maxTimeInMinutes: program.maxTimeInMinutes,
        default: b2n(n2b(program.default)),
        startFrequency: program.startFrequency,
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
      const rows = await this.programs.where('default').equals(1).toArray();
      return rows.map((r) => ({ ...r, default: true }));
    } catch (err) {
      console.error('Failed to get default programs:', err);
      throw err;
    }
  }

  async getCustomPrograms() {
    try {
      const rows = await this.programs.where('default').equals(0).toArray();
      return rows.map((r) => ({ ...r, default: false }));
    } catch (err) {
      console.error('Failed to get custom programs:', err);
      throw err;
    }
  }

  async testForProgram(name: string): Promise<boolean> {
    try {
      return !!(await this.programs.where({ name }).first());
    } catch (err) {
      console.error('Failed to test for program:', err);
      return false;
    }
  }
}

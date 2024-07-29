import Dexie from "dexie";

interface Program {
  id?: number;
  name: string;
  range: number | boolean;
  data: { channel: number; frequency: number; runTime: number }[];
  maxTimeInMinutes: number;
  default: number | boolean;
  startFrequency: number;
}

interface OldFormatProgram {
  default: boolean;
  range: boolean;
  data: number[];
  runTimeInMinutes: number;
  startFrequency: number;
}

interface NewFormatProgram {
  default: boolean;
  range: boolean;
  data: { f: number; s: number }[];
  runTimeInMinutes: number;
  startFrequency: number;
}

class AppDatabase extends Dexie {
  programs: Dexie.Table<Program, number>;

  constructor() {
    super("AppDatabase");
    this.version(1).stores({
      programs: "++id,name,range,data,maxTimeInMinutes,default,startFrequency",
    });
    this.programs = this.table("programs");
  }

  async preloadDefaults() {
    try {
      const response = await fetch('/defaultPrograms.json'); // Adjust the path as necessary
      const defaultPrograms = await response.json();

      const count = await this.programs.count();

      if (count === 0) {
        for (const [name, program] of Object.entries(defaultPrograms)) {
          if (this.isOldFormatProgram(program)) {
            const dataWithRunTime = program.data.map((frequency) => ({
              channel: 1,
              frequency,
              runTime: (program.runTimeInMinutes * 60000) / program.data.length,
            }));

            await this.programs.add({
              name,
              data: dataWithRunTime,
              range: program.range ? 1 : 0,
              default: program.default ? 1 : 0,
              maxTimeInMinutes: program.runTimeInMinutes,
              startFrequency: program.startFrequency,
            });
          } else if (this.isNewFormatProgram(program)) {
            const dataWithRunTime = program.data.map((item) => ({
              channel: 1,
              frequency: item.f,
              runTime: item.s * 1000, // Assuming 's' is in seconds
            }));

            await this.programs.add({
              name,
              data: dataWithRunTime,
              range: program.range ? 1 : 0,
              default: program.default ? 1 : 0,
              maxTimeInMinutes: program.runTimeInMinutes,
              startFrequency: program.startFrequency,
            });
          }
        }
      }
    } catch (error) {
      console.error('Failed to preload defaults:', error);
    }
  }

  isOldFormatProgram(program: any): program is OldFormatProgram {
    return (
        Array.isArray(program.data) &&
        typeof program.data[0] === 'number' &&
        'runTimeInMinutes' in program &&
        'startFrequency' in program
    );
  }

  isNewFormatProgram(program: any): program is NewFormatProgram {
    return (
        Array.isArray(program.data) &&
        typeof program.data[0] === 'object' &&
        'f' in program.data[0] &&
        's' in program.data[0] &&
        'runTimeInMinutes' in program &&
        'startFrequency' in program
    );
  }

  async resetData() {
    await this.programs.clear();
    await this.preloadDefaults();
  }

  async clearDatabase() {
    try {
      await this.delete();
      this.version(1).stores({
        programs: "++id,name,range,data,maxTimeInMinutes,default,startFrequency",
      });
      this.programs = this.table("programs");
    } catch (error) {
      console.error('Failed to clear the database:', error);
    }
  }

  async loadData(programName: string): Promise<Program> {
    try {
      const program = await this.programs.where("name").equals(programName).first();
      if (program) {
        return program;
      } else {
        throw new Error(`No data found for ${programName}`);
      }
    } catch (err) {
      console.error(`Failed to load data: ${err}`);
      throw err;
    }
  }

  async saveData(program: Program): Promise<void> {
    try {
      await this.programs.put({
        ...program,
        range: program.range ? 1 : 0,
        default: program.default ? 1 : 0, // Convert boolean to number
      });
    } catch (error) {
      console.error('Failed to save data:', error);
      throw error;
    }
  }

  async getDefaultPrograms(): Promise<Program[]> {
    try {
      const programs = await this.programs.where('default').equals(1).toArray();
      return programs.map(program => ({
        ...program,
        default: true, // Convert number back to boolean
      }));
    } catch (error) {
      console.error('Failed to get default programs:', error);
      throw error;
    }
  }

  async getCustomPrograms(): Promise<Program[]> {
    try {
      const programs = await this.programs.where('default').equals(0).toArray();
      return programs.map(program => ({
        ...program,
        default: false, // Convert number back to boolean
      }));
    } catch (error) {
      console.error('Failed to get custom programs:', error);
      throw error;
    }
  }
}

export default AppDatabase;

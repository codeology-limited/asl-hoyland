import Dexie from "dexie";

interface Program {
  id?: number;
  name: string;
  range: number | boolean;
  data: { channel: number; frequency: number; runTime: number }[];
  maxTimeInMinutes: number;
  default: number | boolean;
}

class AppDatabase extends Dexie {
  programs: Dexie.Table<Program, number>;

  constructor() {
    super("AppDatabase");
    this.version(1).stores({
      programs: "++id,name,range,data,maxTimeInMinutes,default",
    });
    this.programs = this.table("programs");
  }

  async preloadDefaults() {
    try {
      const response = await fetch('/defaultPrograms.json'); // Adjust the path as necessary
      const defaultPrograms = await response.json();
      //console.log('Default programs loaded from JSON:', defaultPrograms);

      const count = await this.programs.count();
     // console.log(`Number of programs in database before preload: ${count}`); // Debug log

      if (count === 0) {
        for (const [name, program] of Object.entries(defaultPrograms)) {
          const typedProgram = program as {
            default: boolean;
            range: boolean;
            data: number[];
            runTimeInMinutes: number;
          };

          const dataWithRunTime = typedProgram.data.map((frequency) => ({
            channel: 1,
            frequency,
            runTime: (typedProgram.runTimeInMinutes * 60000) / typedProgram.data.length,
          }));

          await this.programs.add({
            name,
            data: dataWithRunTime,
            range: typedProgram.range ? 1 : 0,
            default: typedProgram.default ? 1 : 0,
            maxTimeInMinutes: typedProgram.runTimeInMinutes,
          });
          // console.log(`Program ${name} added to the database`, {
          //   name,
          //   data: dataWithRunTime,
          //   range: typedProgram.range ? 1 : 0,
          //   default: typedProgram.default ? 1 : 0,
          //   maxTimeInMinutes: typedProgram.runTimeInMinutes,
          // }); // Debug log
        }
        //console.log('Default programs preloaded into the database'); // Debug log
      }
    } catch (error) {
      console.error('Failed to preload defaults:', error);
    }
  }

  async resetData() {
    await this.programs.clear();
    await this.preloadDefaults();
  }

  async clearDatabase() {
    try {
      await this.delete();
   //   console.log("Database cleared");
      this.version(1).stores({
        programs: "++id,name,range,data,maxTimeInMinutes,default",
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
      //console.log('Default programs fetched from the database:', programs); // Debug log
      return programs.map(program => ({
        ...program,
        default: true, // Convert number back to boolean
      }));
    } catch (error) {
      console.error('Failed to get default programs:', error);
      throw error;
    }
  }
}

export default AppDatabase;

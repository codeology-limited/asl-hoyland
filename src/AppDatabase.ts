//AppDatabase.tsx
import Dexie from "dexie";

interface Program {
  id?: number;
  name: string;
  data: { frequency: number; runTime: number }[];
  runTimeInMinutes: number;
  default: boolean; // Add the default boolean property
}

class AppDatabase extends Dexie {
  programs: Dexie.Table<Program, number>;

  constructor() {
    super("AppDatabase");
    this.version(1).stores({
      programs: "++id,name,data,runTimeInMinutes,default",
    });
    this.programs = this.table("programs");
  }

  async preloadDefaults() {
    try {
      const response = await fetch('/defaultPrograms.json');
      const defaultPrograms = await response.json();

      const count = await this.programs.count();
      if (count === 0) {
        for (const [name, program] of Object.entries(defaultPrograms)) {
          const typedProgram = program as Program; // Type assertion

          // Calculate the runTime for each item
          const itemRunTime = (typedProgram.runTimeInMinutes * 60000) / typedProgram.data.length;

          // Ensure each item has the correct structure
          const dataWithRunTime = typedProgram.data.map(frequency => ({
            frequency: frequency as unknown as number,
            runTime: itemRunTime
          }));

          await this.programs.add({
            name,
            data: dataWithRunTime,
            runTimeInMinutes: typedProgram.runTimeInMinutes,
            default: true,
          });
        }
      }
    } catch (error) {
      console.error('Failed to preload defaults:', error);
    }
  }

  async resetData() {
    await this.programs.clear();
    await this.preloadDefaults();
  }

  async loadData(programName: string) {
    try {
      const program = await this.programs.where("name").equals(programName).first();
      if (program) {

        console.log("PROGRAM>>>>",program)
        return {
          data: program.data,
          runTimeInMinutes: program.runTimeInMinutes,
        };
      } else {
        throw new Error(`No data found for ${programName}`);
      }
    } catch (err) {
      console.error(`Failed to load data: ${err}`);
      throw err;
    }
  }
}

export default AppDatabase;

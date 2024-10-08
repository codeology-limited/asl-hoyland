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
  preloadDone: boolean = false; // Add a flag to track preload completion

  constructor() {
    super("AppDatabase");
    this.version(1).stores({
      programs: "++id,name,range,data,maxTimeInMinutes,default,startFrequency",
    });
    this.programs = this.table("programs");
  }

  async preloadDefaults() {
    try {
      console.log("Loading Defaults");
      const response = await fetch('/defaultPrograms.json'); // Adjust the path as necessary
      const defaultPrograms = await response.json();


      for (const [name, program] of Object.entries(defaultPrograms)) {
        let dataWithRunTime: { channel: number; frequency: number; runTime: number }[] = [];

        // Type assertion to handle `unknown` type
        const typedProgram = program as OldFormatProgram | NewFormatProgram;

        if (this.isOldFormatProgram(typedProgram)) {
          console.log("Loading old style Defaults");
          if (typedProgram.data) {
            dataWithRunTime = typedProgram.data.map((frequency) => ({
              channel: 1,
              frequency,
              runTime: (typedProgram.runTimeInMinutes * 60000) / typedProgram.data.length,
            }));
          }
        } else if (this.isNewFormatProgram(typedProgram)) {
          console.log("Loading new style Defaults");
          if (typedProgram.data) {
            dataWithRunTime = typedProgram.data.map((item) => ({
              channel: 1,
              frequency: item.f,
              runTime: item.s * 1000, // Assuming 's' is in seconds
            }));
          }
        }

        // Always overwrite existing named items
        const existingProgram = await this.programs.where({ name }).first();

        if (existingProgram) {
          console.log("Overwrite existing program", name);
          await this.programs.update(existingProgram.id!, {
            name,
            data: dataWithRunTime,
            range: typedProgram.range ? 1 : 0,
            default: typedProgram.default ? 1 : 0,
            maxTimeInMinutes: typedProgram.runTimeInMinutes,
            startFrequency: typedProgram.startFrequency,
          });
        } else {
          console.log("Create new program", name);
          await this.programs.add({
            name,
            data: dataWithRunTime,
            range: typedProgram.range ? 1 : 0,
            default: typedProgram.default ? 1 : 0,
            maxTimeInMinutes: typedProgram.runTimeInMinutes,
            startFrequency: typedProgram.startFrequency,
          });
        }
      }
      this.preloadDone = true; // Set the flag to true once done
      console.log('Defaults preloaded');
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
    await this.clearDatabase();
  }

  async clearDatabase() {
    try {
      // Delete only the default programs
      await this.programs.where('default').equals(1).delete();
      console.log('Default programs cleared');

      // Preload default programs again
      await this.preloadDefaults();
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

      if ( !program ){
        return
      }
      console.log(`Saving program: ${program.name} - Start`);

      const existingProgram = await this.programs.where({ name: program.name }).first();
      console.log("IN DB PROGRAM --->", existingProgram,program);

      const saveData: Omit<Program, 'id'> = {
        name: program.name,
        range: program.range ? 1 : 0,
        data: program.data,
        maxTimeInMinutes: program.maxTimeInMinutes,
        default: program.default ? 1 : 0, // Convert boolean to number
        startFrequency: program.startFrequency,
      };

      if (existingProgram) {
        console.log(`Updating existing program: ${program.name}`);
        await this.programs.update(existingProgram.id!, saveData);
        console.log(`Program ${program.name} updated successfully`);
      } else {
        console.log(`Creating new program: ${program.name}`);
        await this.programs.put(saveData as Program);
        console.log(`Program ${program.name} created successfully`);
      }
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
      const allPrograms = await this.programs.toArray(); // Get all programs in the database
      console.log("Current contents of the database:", allPrograms); // Log the entire contents

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

  async testForProgram(name: string): Promise<boolean> {
    try {
      const program = await this.programs.where({ name }).first();
      return !!program;
    } catch (error) {
      console.error('Failed to test for program:', error);
      return false;
    }
  }
}

export default AppDatabase;

import AppDatabase from './AppDatabase.ts';
import FrequencyGenerator from './FrequencyGenerator.ts';

interface Program {
    id?: number;
    name: string;
    range: number | boolean;
    data: { channel: number; frequency: number; runTime: number }[];
    maxTimeInMinutes: number;
    default: number | boolean;
}

type ProgressCallback = (currentStep: number, totalSteps: number) => void;

class ProgramRunner {
    private database: AppDatabase;
    private generator: FrequencyGenerator;
    private running: boolean;
    private paused: boolean;
    private intensity: number;
    private progressCallback: ProgressCallback | null;

    constructor(database: AppDatabase, generator: FrequencyGenerator, progressCallback: ProgressCallback | null = null) {
        this.database = database;
        this.generator = generator;
        this.running = false;
        this.paused = false;
        this.intensity = 1;
        this.progressCallback = progressCallback;
    }

    async loadProgram(name: string): Promise<Program> {
        return await this.database.loadData(name);
    }

    async saveProgram(program: Program): Promise<void> {
        await this.database.saveData(program);
    }

    setIntensity(intensity: number) {
        this.intensity = intensity;
    }

    setProgressCallback(callback: ProgressCallback) {
        this.progressCallback = callback;
    }

    async startProgram(programName: string) {
        const program = await this.loadProgram(programName);
        if (!program) {
            console.error(`Program ${programName} not found`);
            return;
        }

        this.running = true;
        this.paused = false;

        const totalSteps = program.range && program.data.length === 2
            ? program.data[1].frequency - program.data[0].frequency + 1
            : program.data.length;

        let currentStep = 0;

        const interval = (program.maxTimeInMinutes * 60 * 1000) / totalSteps;
        console.log("Send initial commands")
        await this.generator.sendInitialCommands();
        if (program.range && program.data.length === 2) {
            const startFrequency = program.data[0].frequency;
            const endFrequency = program.data[1].frequency;

            for (let frequency = startFrequency; frequency <= endFrequency; frequency++) {
                if (!this.running) break;
                if (this.paused) {
                    while (this.paused) {
                        await new Promise(resolve => setTimeout(resolve, 100)); // Wait while paused
                    }
                }
                await this.generator.sendFrequency(program.data[0].channel, frequency, this.intensity);
                currentStep++;
                if (this.progressCallback) {
                    this.progressCallback(currentStep, totalSteps);
                }
                await new Promise(resolve => setTimeout(resolve, interval));
            }
        } else {
            for (const item of program.data) {
                if (!this.running) break;
                if (this.paused) {
                    while (this.paused) {
                        await new Promise(resolve => setTimeout(resolve, 100)); // Wait while paused
                    }
                }
                await this.generator.sendFrequency(item.channel, item.frequency, this.intensity);
                currentStep++;
                if (this.progressCallback) {
                    this.progressCallback(currentStep, totalSteps);
                }
                await new Promise(resolve => setTimeout(resolve, interval));
            }
        }
        this.running = false;
        this.paused = false;
        this.generator.stopAndReset();
    }

    pauseProgram() {
        if (this.running) {
            this.paused = true;
        }
    }

    resumeProgram() {
        if (this.running && this.paused) {
            this.paused = false;
        }
    }

    stopProgram() {
        this.running = false;
        this.paused = false;
        this.generator.stop();
    }
}

export default ProgramRunner;

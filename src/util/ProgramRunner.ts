import AppDatabase from './AppDatabase';
import HoylandController from './HoylandController.ts';

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
    private generator: HoylandController;
    private running: boolean;
    private paused: boolean;
    private intensity: number;
    private progressCallback: ProgressCallback | null;

    constructor(database: AppDatabase, generator: HoylandController, progressCallback: ProgressCallback | null = null) {
        this.database = database;
        this.generator = generator;
        this.running = false;
        this.paused = false;
        this.intensity = 1;
        this.progressCallback = progressCallback;
        console.log(this.intensity)
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
        console.log("Send initial commands");
        await this.generator.sendInitialCommands();

        await this.generator.setWaveform(2, 1); // Set Channel 2 to sine wave
        await this.generator.setFrequency(2, 27.1); // Set Channel 2 frequency to 27.1 MHz
        await this.generator.setAmplitude(2, 2); // Set Channel 2 amplitude
        await this.generator.setOffset(2, 0); // Set Channel 2 offset to 0
        await this.generator.setDutyCycle(2, 50); // Set Channel 2 duty cycle to 50%
        await this.generator.setPhase(2, 0); // Set Channel 2 phase to 0
        await this.generator.setAttenuation(2, 0); // Set Channel 2 attenuation to 0
        await this.generator.enableOutput(2, true); // Turn Channel 2 on


        // Set Channel 1 settings
        await this.generator.setWaveform(1, 1); // Set Channel 1 to square wave
        await this.generator.setFrequency(1, 0); // Set Channel 1 frequency to 0 Hz
        await this.generator.setAmplitude(1, 2); // Set Channel 1 amplitude
        await this.generator.setOffset(1, 0); // Set Channel 1 offset to 0
        await this.generator.setDutyCycle(1, 50); // Set Channel 1 duty cycle to 50%
        await this.generator.setPhase(1, 0); // Set Channel 1 phase to 0
        await this.generator.setAttenuation(1, 0); // Set Channel 1 attenuation to 0
        await this.generator.enableOutput(1, true); // Turn Channel 1 on


        // Synchronize voltage output
        await this.generator.synchroniseVoltage();

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
                // Set frequency for Channel 1
                await this.generator.setFrequency(1, frequency);
                await this.generator.setFrequency(2, frequency);
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
                // Set frequency for the specified channel
                await this.generator.setFrequency(1, item.frequency);
                await this.generator.setFrequency(2, item.frequency);
                currentStep++;
                if (this.progressCallback) {
                    this.progressCallback(currentStep, totalSteps);
                }
                await new Promise(resolve => setTimeout(resolve, interval));
            }
        }

        await this.generator.enableOutput(1, false); // Turn Channel 1 off
        await this.generator.enableOutput(2, false); // Turn Channel 2 off

        this.running = false;
        this.paused = false;
        await this.generator.stopAndReset();
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

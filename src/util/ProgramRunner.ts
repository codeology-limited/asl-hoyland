import AppDatabase from './AppDatabase';
import HoylandController from './HoylandController';

interface Program {
    id?: number;
    name: string;
    range: number | boolean;
    data: { channel: number; frequency: number; runTime: number }[];
    maxTimeInMinutes: number;
    default: number | boolean;
    startFrequency: number;
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
        console.log('ProgramRunner initialized with intensity:', this.intensity);
    }

    async loadProgram(name: string): Promise<Program | null> {
        try {
            const program = await this.database.loadData(name);
            console.log('Program loaded:', program);
            return program;
        } catch (error) {
            console.error(`Failed to load program: ${error}`);
            return null;
        }
    }

    async saveProgram(program: Program): Promise<void> {
        try {
            await this.database.saveData(program);
            console.log('Program saved:', program);
        } catch (error) {
            console.error(`Failed to save program: ${error}`);
        }
    }

    async setIntensity(intensity: number) {
        this.intensity = intensity;
        console.log('Intensity set to:', this.intensity);
        await this.generator.setAmplitude(1, this.intensity); // Set Channel 1 amplitude
    }

    setProgressCallback(callback: ProgressCallback) {
        this.progressCallback = callback;
        console.log('Progress callback set');
    }

    async startProgram(programName: string) {
        console.log('Starting program:', programName);
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
        console.log('Total steps calculated:', totalSteps);

        let currentStep = 0;

        const interval = (program.maxTimeInMinutes * 60 * 1000) / totalSteps;
        console.log('Interval between steps:', interval);

        console.log('Sending initial commands...');
        await this.generator.sendInitialCommands();
     //

        // Set Channel 1 settings

        await this.generator.setAmplitude(1, 2); // Set Channel 1 amplitude
        await this.generator.setOffset(1, 0); // Set Channel 1 offset to 0
        await this.generator.setDutyCycle(1, 50); // Set Channel 1 duty cycle to 50%
        await this.generator.setPhase(1, 0); // Set Channel 1 phase to 0
        await this.generator.setAttenuation(1, 0); // Set Channel 1 attenuation to 0

        await this.generator.setAmplitude(2, 2); // Set Channel 2 amplitude
        await this.generator.setOffset(2, 0); // Set Channel 2 offset to 0
        await this.generator.setDutyCycle(2, 50); // Set Channel 2 duty cycle to 50%
        await this.generator.setPhase(2, 0); // Set Channel 2 phase to 0
        await this.generator.setAttenuation(2, 0); // Set Channel 2 attenuation to 0


       // await this.generator.setWaveform(2, 0); // Set Channel 2 to sine wave
        await this.generator.setFrequency(2, 3.1); // Set Channel 2 frequency to 27.1 MHz
      //  await this.generator.setWaveform(1, 1); // Set Channel 1 to square wave
        await this.generator.setFrequency(1, 0); // Set Channel 1 frequency to 0 Hz
        await this.generator.enableOutput(1, true); // Turn Channel 1 on
        await this.generator.enableOutput(2, true); // Turn Channel 2 on
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
                console.log('Setting frequency to:', frequency);
                await this.generator.setFrequency(1, parseFloat(frequency.toString()));


                // await this.generator.synchroniseVoltage();
                currentStep++;
                console.log('Current step:', currentStep);

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
                console.log('Setting frequency for item:', item);
                await this.generator.setFrequency(1, parseFloat(item.frequency.toString()));
               // await this.generator.setAmplitude(1, this.intensity); // Set Channel 1 amplitude

              // await this.generator.synchroniseVoltage();
                currentStep++;
                console.log('Current step:', currentStep);

                if (this.progressCallback) {
                    this.progressCallback(currentStep, totalSteps);
                }
                await new Promise(resolve => setTimeout(resolve, item.runTime)); // Use item.runTime instead of interval
            }
        }

        await this.generator.enableOutput(1, false); // Turn Channel 1 off
        await this.generator.enableOutput(2, false); // Turn Channel 2 off

        this.running = false;
        this.paused = false;
        await this.generator.stopAndReset();
        alert(`Your program named "${programName}" has now completed.  \nPlease press ok to choose again`)
        console.log('Program completed:', programName);
    }

    pauseProgram() {
        if (this.running) {
            this.paused = true;
            console.log('Program paused');
        }
    }

    resumeProgram() {
        if (this.running && this.paused) {
            this.paused = false;
            console.log('Program resumed');
        }
    }

    stopProgram() {
        this.running = false;
        this.paused = false;
        this.generator.stop();
        console.log('Program stopped');
    }
}

export default ProgramRunner;

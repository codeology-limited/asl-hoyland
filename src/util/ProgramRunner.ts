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

        await this.generator.setFrequency(2, program.startFrequency * 1_000_000); // Set Channel 2 frequency to 27.1 MHz
        await new Promise(resolve => setTimeout(resolve, 700)); // Wait while paused


        if (program.range && program.data.length === 2) {
            const startFrequency = program.data[0].frequency;
            const endFrequency = program.data[1].frequency;
            this.generator.delay = 100;
            for (let frequency = startFrequency; frequency <= endFrequency; frequency++) {
                if (!this.running) break; // Immediately exit if not running
                if (this.paused) {
                    while (this.paused) {
                        await new Promise(resolve => setTimeout(resolve, 100)); // Wait while paused
                        if (!this.running) return; // Exit if not running
                    }
                }
                console.log('Setting frequency to:', frequency, "delay", this.generator.delay);
                await this.generator.setFrequency(1, parseFloat(frequency.toString()) * 1000);

                currentStep++;
                console.log('Current step:', currentStep);

                if (this.progressCallback) {
                    this.progressCallback(currentStep, totalSteps);
                }

                // Use a custom timeout that can be cleared and resolved immediately
                await new Promise(resolve => {
                    const timeoutId = setTimeout(() => {
                        resolve();
                    }, interval);

                    const checkRunning = setInterval(() => {
                        if (!this.running) {
                            clearTimeout(timeoutId);
                            clearInterval(checkRunning);
                            resolve(); // Resolve immediately if running is false
                        }
                    }, 10); // Check every 10ms
                });

                if (!this.running) break; // Immediately exit if not running
            }
        } else {
            console.log("PROGRAM ---->>>>>", program);
            console.log("INTERVAKL ---->>>>>", interval);

            for (const item of program.data) {
                if (!this.running) break; // Immediately exit if not running
                if (this.paused) {
                    while (this.paused) {
                        await new Promise(resolve => setTimeout(resolve, 100)); // Wait while paused
                        if (!this.running) return; // Exit if not running
                    }
                }
                console.log('Setting frequency for item:', item);
                await this.generator.setFrequency(1, parseFloat(item.frequency.toString()) * 1000);

                currentStep++;
                console.log('Current step:', currentStep);

                if (this.progressCallback) {
                    this.progressCallback(currentStep, totalSteps);
                }

                // Use a custom timeout that can be cleared and resolved immediately
                await new Promise(resolve => {
                    const timeoutId = setTimeout(() => {
                        resolve();
                    }, interval);

                    const checkRunning = setInterval(() => {
                        if (!this.running) {
                            clearTimeout(timeoutId);
                            clearInterval(checkRunning);
                            resolve(); // Resolve immediately if running is false
                        }
                    }, 10); // Check every 10ms
                });

                if (!this.running) break; // Immediately exit if not running
            }
        }

        

        // await this.generator.enableOutput(1, false); // Turn Channel 1 off
        // await this.generator.enableOutput(2, false); // Turn Channel 2 off

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

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

type ProgressCallback = (currentStep: number, totalSteps: number, currentFrequency: number) => void;


class ProgramRunner {
    private database: AppDatabase;
    private generator: HoylandController;
    private running: boolean;
    private paused: boolean;
    private intensity: number;
    private progressCallback: ProgressCallback | null;
    private pauseStartTime: number = 0;
    private totalPausedTime: number = 0;

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

    async setIntensity(intensity: number) {
        this.intensity = intensity;
        console.log('Intensity set to:', this.intensity);
        this.generator.setAmplitude(1, this.intensity); // Set Channel 1 amplitude
    }

    setProgressCallback(callback: ProgressCallback) {
        this.progressCallback = callback;
        console.log('Progress callback set');
    }

    async runSpecialCase() {
        console.log('Running special case program with 0.5 MHz and 0.67 MHz for 9 minutes');

        await this.generator.sinewave();
        await new Promise(resolve => setTimeout(resolve, 700)); // Initial delay
        this.running = true;
        this.paused = false;

        const totalDurationMs = 9 * 60 * 1000; // 9 minutes in milliseconds
        const startTime = Date.now(); // Record the start time
        let lastReportedPercentage = -1; // Initialize to an invalid value

        const updateProgress = () => {
            const elapsedMs = Date.now() - startTime - this.totalPausedTime;
            const percentageComplete = Math.floor((elapsedMs / totalDurationMs) * 100);

            if (percentageComplete > lastReportedPercentage) {
                lastReportedPercentage = percentageComplete;
                if (this.progressCallback) {
                    this.progressCallback(percentageComplete, 100, (totalDurationMs-elapsedMs) / 60_000);
                }
            }
        };

        const progressTimer = setInterval(() => {
            if (!this.running || this.paused) {
                return; // Skip update if paused or stopped
            }
            updateProgress();
        }, 500); // Update progress every second

        while (this.running && (Date.now() - startTime - this.totalPausedTime) < totalDurationMs) {
            if (this.paused) {
                while (this.paused) {
                    await new Promise(resolve => setTimeout(resolve, 100)); // Wait while paused
                    if (!this.running) {
                        clearInterval(progressTimer);
                        return; // Exit if not running
                    }
                }
            }

            // Set frequency to 0.5 MHz
            await this.generator.setFrequency(1, 0.5 * 1_000_000);
            await new Promise(resolve => setTimeout(resolve, 100)); // Wait for 100 ms

            // Set frequency to 0.67 MHz
            await this.generator.setFrequency(1, 0.67 * 1_000_000);
            await new Promise(resolve => setTimeout(resolve, 100)); // Wait for 100 ms

            // Update the progress bar
            updateProgress();
        }

        clearInterval(progressTimer); // Ensure the timer is cleared

        // Stop the generator after the loop completes
        await this.generator.stopAndReset();
        console.log('Special case program completed');
        this.running = false;
    }

    async initProgram() {
        console.log('Sending initial commands...');
        await this.generator.sendInitialCommands();
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
        this.totalPausedTime = 0; // Reset paused time
        const startTime = Date.now(); // Record the start time
        const totalDurationMs = program.maxTimeInMinutes * 60 * 1000; // Total time in milliseconds

        await this.generator.setFrequency(2, program.startFrequency * 1_000_000); // Set Channel 2 frequency to startFrequency
        await new Promise(resolve => setTimeout(resolve, 700)); // Initial delay

        const updateProgressBar = async () => {
            while (this.running) {
                if (this.paused) {
                    await new Promise(resolve => setTimeout(resolve, 100)); // Wait while paused
                    continue;
                }

                const elapsedMs = Date.now() - startTime - this.totalPausedTime;
                const percentageComplete = (elapsedMs / totalDurationMs) * 100;

                if (this.progressCallback) {
                    this.progressCallback(percentageComplete, 100, (totalDurationMs-elapsedMs) / 60_000); // Update progress every second
                }

                if (elapsedMs >= totalDurationMs) {
                    break; // Exit the loop if the total duration is reached
                }

                await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for 1 second
            }
        };

        const progressUpdater = updateProgressBar(); // Start the progress bar updater

        if (program.name === "ultrasound") {
            await this.runSpecialCase();
        } else {
            if (program.range && program.data.length === 2) {
                const startFrequency = program.data[0].frequency;
                const endFrequency = program.data[1].frequency;
                const interval = totalDurationMs / (endFrequency - startFrequency);

                for (let frequency = startFrequency; frequency <= endFrequency; frequency++) {
                    if (!this.running) break;
                    if (this.paused) {
                        while (this.paused) {
                            await new Promise(resolve => setTimeout(resolve, 100));
                            if (!this.running) return;
                        }
                    }

                    console.log('Setting frequency to:', frequency);
                    await this.generator.setFrequency(1, parseFloat(frequency.toString()));

                    await new Promise(resolve => setTimeout(resolve, interval));

                    if (!this.running) break;
                }
            } else {
                for (const item of program.data) {
                    if (!this.running) break; // Immediately exit if not running
                    if (this.paused) {
                        while (this.paused) {
                            await new Promise(resolve => setTimeout(resolve, 100)); // Wait while paused
                            if (!this.running) return; // Exit if not running
                        }
                    }
                    console.log('Setting frequency for item:', item);
                    await this.generator.setFrequency(1, parseFloat(item.frequency.toString()));

                    await new Promise<void>(resolve => {
                        const timeoutId = setTimeout(() => {
                            resolve();
                        }, item.runTime);

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
        }

        await progressUpdater; // Wait for the progress bar updater to complete

        if (this.running) {
            await this.generator.stopAndReset();
        }

        this.running = false;
        this.paused = false;
        console.log('Program completed:', programName);
    }

    pauseProgram() {
        if (this.running) {
            this.paused = true;
            this.pauseStartTime = Date.now(); // Record the time when the pause starts
            console.log('Program paused');
        }
    }

    resumeProgram() {
        if (this.running && this.paused) {
            this.paused = false;
            this.totalPausedTime += Date.now() - this.pauseStartTime; // Add the paused duration to the total
            console.log('Program resumed');
        }
    }

    async stopProgram() {
        await this.generator.stopAndReset();
        this.running = false;
        this.paused = false;
        console.log('Program stopped');
    }
}

export default ProgramRunner;

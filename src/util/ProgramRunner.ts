import AppDatabase from './AppDatabase';
import HoylandController from './HoylandController';
import { Program } from './types';

interface Program {
    id?: number;
    name: string;
    range: number | boolean;
    data: { channel: number; frequency: number | string; runTime: number }[];
    maxTimeInMinutes: number;
    default: number | boolean;
    startFrequency: number;
    minAmplitude?: number; // New field for minimum amplitude
    maxAmplitude?: number; // New field for maximum amplitude
    initialAmplitude?: number; // New field for initial amplitude
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
    private onStopCallback: (() => void) | null = null;

    constructor(database: AppDatabase, generator: HoylandController, progressCallback: ProgressCallback | null = null) {
        this.database = database;
        this.generator = generator;
        this.running = false;
        this.paused = false;
        this.intensity = 1;
        this.progressCallback = progressCallback;
    }

    async loadProgram(name: string): Promise<Program | null> {
        try {
            const program = await this.database.loadData(name);
            return program;
        } catch (error) {
            console.error(`Failed to load program: ${error}`);
            return null;
        }
    }

    async setIntensity(intensity: number) {
        this.intensity = intensity;
        await this.generator.setAmplitude(this.intensity);
    }

    setProgressCallback(callback: ProgressCallback) {
        this.progressCallback = callback;
    }

    setOnStopCallback(callback: () => void) {
        this.onStopCallback = callback;
    }

    async runSpecialCase(programName: string, setRunningFrequency: React.Dispatch<React.SetStateAction<string>>) {
        const program = await this.loadProgram(programName);
        if (!program) {
            console.error(`Program ${programName} not found`);
            return;
        }

        await this.generator.set_both_channels_to_square_wave();
        this.running = true;
        this.paused = false;
        const totalDurationMs = 10 * 60 * 1000; // 10 minutes
        const startTime = Date.now();
        let lastReportedPercentage = -1;

        const updateProgress = () => {
            const elapsedMs = Date.now() - startTime - this.totalPausedTime;
            const percentageComplete = Math.floor((elapsedMs / totalDurationMs) * 100);
            if (percentageComplete > lastReportedPercentage) {
                lastReportedPercentage = percentageComplete;
                if (this.progressCallback) {
                    this.progressCallback(percentageComplete, 100, (totalDurationMs - elapsedMs) / 60_000);
                }
            }
        };

        const progressTimer = setInterval(() => {
            if (!this.running || this.paused) return;
            updateProgress();
        }, 50);

        if (programName === "ultrasound") {
            while (this.running && (Date.now() - startTime - this.totalPausedTime) < totalDurationMs) {
                if (this.paused) {
                    while (this.paused) {
                        await new Promise(resolve => setTimeout(resolve, 100));
                        if (!this.running) {
                            clearInterval(progressTimer);
                            return;
                        }
                    }
                }

                // 500 kHz for 1 second
                await this.generator.setFrequency(1, 0.5 * 1_000_000);
                await this.generator.setFrequency(2, 0.5 * 1_000_000);
                setRunningFrequency(`${(0.5 * 1_000_000).toString()} Hz`);
                await new Promise(resolve => setTimeout(resolve, 1000));

                // Off for 1 second
                await this.generator.write_to_port({ data: "WMN0\n" });
                await this.generator.write_to_port({ data: "WFN0\n" });
                setRunningFrequency("0 Hz");
                await new Promise(resolve => setTimeout(resolve, 1000));

                // 670 kHz for 1 second
                await this.generator.setFrequency(1, 0.67 * 1_000_000);
                await this.generator.setFrequency(2, 0.67 * 1_000_000);
                setRunningFrequency(`${(0.67 * 1_000_000).toString()} Hz`);
                await new Promise(resolve => setTimeout(resolve, 1000));

                // Off for 1 second
                await this.generator.write_to_port({ data: "WMN0\n" });
                await this.generator.write_to_port({ data: "WFN0\n" });
                setRunningFrequency("0 Hz");
                await new Promise(resolve => setTimeout(resolve, 1000));

                updateProgress();
            }
        } else if (programName === "ultrasound 500") {
            await this.generator.setFrequency(1, 0.5 * 1_000_000);
            await this.generator.setFrequency(2, 0.5 * 1_000_000);
            setRunningFrequency(`${(0.5 * 1_000_000).toString()} Hz`);
            while (this.running && (Date.now() - startTime - this.totalPausedTime) < totalDurationMs) {
                if (this.paused) {
                    while (this.paused) {
                        await new Promise(resolve => setTimeout(resolve, 100));
                        if (!this.running) {
                            clearInterval(progressTimer);
                            return;
                        }
                    }
                }
                updateProgress();
                await new Promise(resolve => setTimeout(resolve, 50));
            }
        } else if (programName === "ultrasound 670") {
            await this.generator.setFrequency(1, 0.67 * 1_000_000);
            await this.generator.setFrequency(2, 0.67 * 1_000_000);
            setRunningFrequency(`${(0.67 * 1_000_000).toString()} Hz`);
            while (this.running && (Date.now() - startTime - this.totalPausedTime) < totalDurationMs) {
                if (this.paused) {
                    while (this.paused) {
                        await new Promise(resolve => setTimeout(resolve, 100));
                        if (!this.running) {
                            clearInterval(progressTimer);
                            return;
                        }
                    }
                }
                updateProgress();
                await new Promise(resolve => setTimeout(resolve, 50));
            }
        }

        clearInterval(progressTimer);
        await this.generator.stopAndReset();
        this.running = false;
        if (this.onStopCallback) this.onStopCallback();
    }

    async initializeChannel1() {
        await this.generator.sendInitialCommands();
    }

    async initializeChannel0() {
        await this.generator.sendSecondaryCommands();
    }

    async setChannel1StartFrequency(programName: string) {
        const program = await this.loadProgram(programName);
        if (!program || program.startFrequency <= 0) return;
        await this.generator.setFrequency(2, program.startFrequency * 1_000_000);
    }

    async startProgram(programName: string, setRunningFrequency: React.Dispatch<React.SetStateAction<string>>) {
        const program = await this.loadProgram(programName);
        if (!program) {
            console.error(`Program ${programName} not found`);
            return;
        }

        this.running = true;
        this.paused = false;
        this.totalPausedTime = 0;
        const startTime = Date.now();
        const totalDurationMs = program.maxTimeInMinutes * 60 * 1000;

        const updateProgressBar = async () => {
            while (this.running) {
                if (this.paused) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                    continue;
                }
                const elapsedMs = Date.now() - startTime - this.totalPausedTime;
                const percentageComplete = (elapsedMs / totalDurationMs) * 100;
                if (this.progressCallback) {
                    this.progressCallback(percentageComplete, 100, (totalDurationMs - elapsedMs) / 60_000);
                }
                if (elapsedMs >= totalDurationMs) break;
                await new Promise(resolve => setTimeout(resolve, 50));
            }
        };

        const progressUpdater = updateProgressBar();

        if (["ultrasound", "ultrasound 500", "ultrasound 670"].includes(programName)) {
            await this.runSpecialCase(programName, setRunningFrequency);
        } else {
            if (program.startFrequency === 0) {
                await this.generator.set_both_channels_to_square_wave();
                await this.generator.sync();
            }
            for (const item of program.data) {
                if (!this.running) break;
                if (this.paused) {
                    while (this.paused) {
                        await new Promise(resolve => setTimeout(resolve, 100));
                        if (!this.running) return;
                    }
                }
                await this.generator.setFrequency(1, parseFloat(item.frequency.toString()));
                setRunningFrequency(`${item.frequency.toString()} Hz`);
                await new Promise<void>(resolve => {
                    const timeoutId = setTimeout(resolve, item.runTime);
                    const checkRunning = setInterval(() => {
                        if (!this.running) {
                            clearTimeout(timeoutId);
                            clearInterval(checkRunning);
                            resolve();
                        }
                    }, 5);
                });
                if (!this.running) break;
            }
        }

        await progressUpdater;
        if (this.running) {
            await this.generator.stopAndReset();
        }
        this.running = false;
        this.paused = false;
        if (this.onStopCallback) this.onStopCallback();
    }

    pauseProgram() {
        if (this.running) {
            this.paused = true;
            this.pauseStartTime = Date.now();
        }
    }

    resumeProgram() {
        if (this.running && this.paused) {
            this.paused = false;
            this.totalPausedTime += Date.now() - this.pauseStartTime;
        }
    }

    async stopProgram() {
        await this.generator.stopAndReset();
        this.running = false;
        this.paused = false;
        if (this.onStopCallback) this.onStopCallback();
    }
}

export default ProgramRunner;
import React, { useState, useEffect, useRef } from 'react';
import { useAppContext } from '../AppContext';
import ProgramRunner from '../util/ProgramRunner';

interface CustomProgramsProps {
    setIsRunning: (isRunning: boolean) => void;
    isRunning: boolean;
}

const CustomPrograms: React.FC<CustomProgramsProps> = ({ setIsRunning, isRunning }) => {
    const [progress, setProgress] = useState(0);
    const [totalSteps, setTotalSteps] = useState(0);
    const [intensity, setIntensity] = useState(1);
    const [selectedProgram, setSelectedProgram] = useState('');
    const [programNames, setProgramNames] = useState<string[]>([]);
    const [isPaused, setIsPaused] = useState(false);

    const { appDatabase, hoylandController } = useAppContext();
    const runnerRef = useRef<ProgramRunner | null>(null);

    useEffect(() => {
        const loadCustomPrograms = async () => {
            try {
                const programs = await appDatabase.getCustomPrograms();
                const names = programs.map(program => program.name);


                setProgramNames(names);
            } catch (error) {
                console.error('Failed to load custom programs:', error);
            }
        };

        if (appDatabase) {
            loadCustomPrograms();
        }
    }, [appDatabase]);

    const handleProgressUpdate = (currentStep: number, totalSteps: number) => {
        setProgress(currentStep);
        setTotalSteps(totalSteps);
    };

    useEffect(() => {
        if (runnerRef.current) {
            runnerRef.current?.setIntensity(intensity);
            runnerRef.current?.setProgressCallback(handleProgressUpdate);
        }
    }, [intensity]);

    const loadProgram = async (programName: string) => {
        const program = await appDatabase.loadData(programName);
        if (program) {
            runnerRef.current = new ProgramRunner(appDatabase, hoylandController, handleProgressUpdate);
            runnerRef.current?.setIntensity(intensity);

            const totalSteps = program.range && program.data.length === 2
                ? program.data[1].frequency - program.data[0].frequency + 1
                : program.data.length;
            setTotalSteps(totalSteps);
        }
    };

    const handleStartStop = async () => {
        if (isRunning) {
            runnerRef.current?.stopProgram();
            runnerRef.current = null;
            setIsRunning(false);
            setIsPaused(false);
            setProgress(0);
            setTotalSteps(0);
        } else {
            if (selectedProgram) {
                await loadProgram(selectedProgram);
                if (runnerRef.current) {
                    setIsRunning(true);
                    await runnerRef.current?.startProgram(selectedProgram);
                    setIsRunning(false);
                    setProgress(0);
                }
            } else {
                alert('Please select a program');
            }
        }
    };

    const handlePauseContinue = () => {
        if (isPaused) {
            runnerRef.current?.resumeProgram();
            setIsPaused(false);
        } else {
            runnerRef.current?.pauseProgram();
            setIsPaused(true);
        }
    };

    return (
        <div className="tab-body custom-programs">
            <div>
                <select value={selectedProgram} onChange={(e) => setSelectedProgram(e.target.value)}
                        disabled={isRunning}>
                    <option value="" disabled>Choose</option>
                    {programNames.map((name) => (
                        <option key={name} value={name}>{name}</option>
                    ))}
                </select>


                <button
                    className={isRunning ? 'stop' : 'start'}
                    onClick={handleStartStop}
                    disabled={!selectedProgram && !isRunning} // Only disable when no program is selected and not running
                >
                    {isRunning ? 'Stop' : 'Start'}
                </button>

                <button onClick={handlePauseContinue} disabled={!isRunning}>{isPaused ? 'Continue' : 'Pause'}</button>
            </div>

            <div>
                <progress className="progress-bar" value={progress} max={totalSteps}></progress>
                <label>Step {progress} of {totalSteps} steps</label>
            </div>

            <div>
            <label>Intensity: {intensity}</label>
                <input
                    type="range"
                    min="1"
                    max="20"
                    value={intensity}
                    onChange={(e) => setIntensity(parseInt(e.target.value, 10))}
                />
            </div>
        </div>
    );
};

export default CustomPrograms;

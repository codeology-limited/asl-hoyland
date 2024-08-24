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
    const [intensity, setIntensity] = useState(5);
    const [selectedProgram, setSelectedProgram] = useState('');
    const [programNames, setProgramNames] = useState<string[]>([]);
    const [isPaused, setIsPaused] = useState(false);
    const [isStopping, setIsStopping] = useState(false);

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
            runnerRef.current.setIntensity(intensity);
            runnerRef.current.setProgressCallback(handleProgressUpdate);
        }
    }, [intensity]);

    const loadProgram = async (programName: string) => {
        const program = await appDatabase.loadData(programName);
        if (program) {
            runnerRef.current = new ProgramRunner(appDatabase, hoylandController, handleProgressUpdate);

            const totalSteps = program.range && program.data.length === 2
                ? program.data[1].frequency - program.data[0].frequency + 1
                : program.data.length;
            setTotalSteps(totalSteps);
        }
    };

    const handleStartStop = async () => {
        if (isRunning) {
            setIsStopping(true);
            await runnerRef.current?.stopProgram();
            resetUI();
        } else {
            if (selectedProgram) {
                await loadProgram(selectedProgram);
                if (runnerRef.current) {
                    setIsRunning(true);
                    await runnerRef.current.initProgram();
                    setIntensity(20);
                    await runnerRef.current.startProgram(selectedProgram);
                    resetUI();
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

    const resetUI = () => {
        setIsStopping(false);
        setIsRunning(false);
        setIsPaused(false);
        setProgress(0);
        setTotalSteps(0);
        setSelectedProgram('');
        setIntensity(5);
        runnerRef.current = null;
    };

    return (
        <div className="tab-body custom-programs">
            <div>
                <select value={selectedProgram} onChange={(e) => setSelectedProgram(e.target.value)} disabled={isRunning}>
                    <option value="" disabled>Choose</option>
                    {programNames.map((name) => (
                        <option key={name} value={name}>{name}</option>
                    ))}
                </select>

                <button
                    className={isStopping ? 'stopping' : isRunning ? 'stop' : 'start'}
                    onClick={handleStartStop}
                    disabled={!selectedProgram && !isRunning} // Disable when no program is selected and not running
                >
                    {isStopping ? 'Stopping...' : isRunning ? 'Stop' : 'Start'}
                </button>

                <button onClick={handlePauseContinue} disabled={!isRunning}>
                    {isPaused ? 'Continue' : 'Pause'}
                </button>
            </div>

            <div>
                <progress className="progress-bar" value={progress} max={totalSteps}></progress>
                <label>{totalSteps > 0 ? `${Math.floor((progress / totalSteps) * 100)}% complete` : '0% complete'}</label>
            </div>

            <div>
                <label>Intensity: {Math.floor(((intensity || 0) / 20) * 100)}%</label>
                <input
                    type="range"
                    min="1"
                    max="20"
                    value={intensity}
                    onChange={(e) => setIntensity(parseInt(e.target.value, 10))}
                    disabled={isStopping}
                />
            </div>
        </div>
    );
};

export default CustomPrograms;

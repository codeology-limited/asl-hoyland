import React, { useState, useEffect, useRef } from 'react';
import { useAppContext } from '../AppContext';
import ProgramRunner from '../util/ProgramRunner'; // Ensure this is the correct path to ProgramRunner

const DefaultPrograms: React.FC = () => {
    const [progress, setProgress] = useState(0);
    const [totalSteps, setTotalSteps] = useState(0);
    const [intensity, setIntensity] = useState(1);
    const [selectedProgram, setSelectedProgram] = useState('');
    const [programNames, setProgramNames] = useState<string[]>([]);
    const [isRunning, setIsRunning] = useState(false);
    const [isPaused, setIsPaused] = useState(false);

    const { appDatabase, hoylandController, programRunner } = useAppContext();
    const runnerRef = useRef<ProgramRunner | null>(programRunner);

    useEffect(() => {
        const loadDefaultPrograms = async () => {
            try {
                //await appDatabase.preloadDefaults(); // Ensure defaults are preloaded
                const programs = await appDatabase.getDefaultPrograms();
                const names = programs.map(program => program.name);
                setProgramNames(names);
            } catch (error) {
                console.error('Failed to load default programs:', error);
            }
        };

        loadDefaultPrograms();
    }, [appDatabase]);

    const handleProgressUpdate = (currentStep: number, totalSteps: number) => {
        setProgress(currentStep);
        setTotalSteps(totalSteps);
    };

    useEffect(() => {
        if (runnerRef.current) {

                if (runnerRef.current instanceof ProgramRunner) {
                    runnerRef.current.setIntensity(intensity);
                }


            if (runnerRef.current instanceof ProgramRunner) {
                runnerRef.current.setProgressCallback(handleProgressUpdate);
            }
        }
    }, [intensity]);

    const loadProgram = async (programName: string) => {
        const program = await appDatabase.loadData(programName);
        if (program) {
            runnerRef.current = new ProgramRunner(appDatabase, hoylandController, handleProgressUpdate);
            if (runnerRef.current instanceof ProgramRunner) {
                runnerRef.current.setIntensity(intensity);
            }
        }
    };

    const handleStartStop = async () => {
        if (isRunning) {
            runnerRef.current?.stopProgram();
            runnerRef.current = null;
            setIsRunning(false);
            setIsPaused(false);
            setProgress(0);
        } else {
            if (selectedProgram) {
                await loadProgram(selectedProgram);
                if (runnerRef.current) {
                    setIsRunning(true);
                    if (runnerRef.current instanceof ProgramRunner) {
                        await runnerRef.current.startProgram(selectedProgram);
                    }
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
        <div className="tab-body default-programs">
            <div>
                <select value={selectedProgram} onChange={(e) => setSelectedProgram(e.target.value)}>
                    <option value="" disabled>Select default program</option>
                    {programNames.map((name) => (
                        <option key={name} value={name}>{name}</option>
                    ))}
                </select>

                <button className={isRunning ? 'stop' : 'start'} onClick={handleStartStop}>{isRunning ? 'Stop' : 'Start'}</button>
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
                    max="10"
                    value={intensity}
                    onChange={(e) => setIntensity(parseInt(e.target.value, 10))}
                />
            </div>
        </div>
    );
};

export default DefaultPrograms;

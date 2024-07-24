import React, { useState, useEffect, useRef } from 'react';
import ProgramRunner from '../util/ProgramRunner';
import AppDatabase from '../util/AppDatabase';
import FrequencyGenerator from '../util/FrequencyGenerator';

const DefaultPrograms: React.FC = () => {
    const [progress, setProgress] = useState(0);
    const [totalSteps, setTotalSteps] = useState(0);
    const [intensity, setIntensity] = useState(1);
    const [selectedProgram, setSelectedProgram] = useState('');
    const [programNames, setProgramNames] = useState<string[]>([]);
    const [isRunning, setIsRunning] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const runnerRef = useRef<ProgramRunner | null>(null);

    const database = new AppDatabase();
    const generator = new FrequencyGenerator();

    useEffect(() => {
        const loadDefaultPrograms = async () => {
            try {
                await database.preloadDefaults(); // Ensure defaults are preloaded
                const programs = await database.getDefaultPrograms();
                const names = programs.map(program => program.name);
                console.log('Loaded default programs:', names); // Debug log
                setProgramNames(names);
            } catch (error) {
                console.error('Failed to load default programs:', error);
            }
        };

        loadDefaultPrograms();
    }, [database]);

    const handleProgressUpdate = (currentStep: number, totalSteps: number) => {
        setProgress(currentStep);
        setTotalSteps(totalSteps);
    };

    useEffect(() => {
        if (runnerRef.current) {
            runnerRef.current.setIntensity(intensity);
        }
    }, [intensity]);

    const loadProgram = async (programName: string) => {
        const program = await database.loadData(programName);
        if (program) {
            runnerRef.current = new ProgramRunner(database, generator, handleProgressUpdate);
            runnerRef.current.setIntensity(intensity);
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
                    await runnerRef.current.startProgram(selectedProgram);
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
        <div className="tab-body">
            <div>
                <select value={selectedProgram} onChange={(e) => setSelectedProgram(e.target.value)}>
                    <option value="" disabled>Select a program</option>
                    {programNames.map((name) => (
                        <option key={name} value={name}>{name}</option>
                    ))}
                </select>

                <button onClick={handleStartStop}>{isRunning ? 'Stop' : 'Start'}</button>
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

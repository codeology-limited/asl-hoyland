import React, { useState, useEffect, useRef } from 'react';
import { useAppContext } from '../AppContext';
import ProgramRunner from '../util/ProgramRunner';

interface DefaultProgramsProps {
    setIsRunning: (isRunning: boolean) => void;
    isRunning: boolean;
}

function convertToMinutesAndSeconds(decimalMinutes: number): string {
    const minutes = Math.floor(decimalMinutes);
    const seconds = Math.floor((decimalMinutes - minutes) * 60);
    return `${minutes} minutes and ${seconds} seconds`;
}

const DefaultPrograms: React.FC<DefaultProgramsProps> = ({ setIsRunning, isRunning }) => {
    const [progress, setProgress] = useState(0);
    const [currentFrequency, setCurrentFrequency] = useState(0);
    const [totalSteps, setTotalSteps] = useState(0);
    const [intensity, setIntensity] = useState(5);
    const [selectedProgram, setSelectedProgram] = useState('');
    const [programNames, setProgramNames] = useState<string[]>([]);
    const [isPaused, setIsPaused] = useState(false);
    const [isStopping, setIsStopping] = useState(false);
    const [isConnected, setIsConnected] = useState(false);

    const { appDatabase, hoylandController } = useAppContext();
    const runnerRef = useRef<ProgramRunner | null>(null);

    const loadDefaultPrograms = async () => {
        try {
            const programs = await appDatabase.getDefaultPrograms();
            const names = programs.map(program => program.name);
            setProgramNames(names);
        } catch (error) {
            console.error('Failed to load default programs:', error);
        }
    };
    useEffect(() => {


        if (appDatabase.preloadDone) {
            loadDefaultPrograms();
        }
    }, [appDatabase.preloadDone]);

    const handleProgressUpdate = (currentStep: number, totalSteps: number, currentF: number) => {
        setProgress(currentStep);
        setTotalSteps(totalSteps);
        setCurrentFrequency(currentF);
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
        }

        setTimeout(function(){
            hoylandController.reconnectDevice().then(function(port){
                if ( port === "TEST"){
                    setIsConnected(false)
                } else {
                    setIsConnected(true)
                }
            })
        },0)

    };

    const handleStartStop = async () => {
        if (isRunning) {
            setIsStopping(true);
            await runnerRef.current?.stopProgram();
            setCurrentFrequency(0);
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
        setSelectedProgram('');
        setIntensity(5);
        runnerRef.current = null;
    };

    return (
        <div className={`${isConnected ? 'connected' : 'disconnected'} tab-body default-programs`}>

            <div>
                <select disabled={isRunning || !isConnected} value={selectedProgram}
                        onMouseEnter={() => loadDefaultPrograms()}
                        onChange={(e) => setSelectedProgram(e.target.value)}
                      >
                    <option value="" disabled>Choose</option>
                    {programNames.map((name) => (
                        <option key={name} value={name}>{name}</option>
                    ))}
                </select>

                <button
                    className={isStopping ? 'stopping' : isRunning ? 'stop' : 'start'}
                    onClick={handleStartStop}
                    disabled={(!selectedProgram && !isRunning) || isStopping}
                >
                    {isStopping ? 'Stopping...' : isRunning ? 'Stop' : 'Start'}
                </button>

                <button onClick={handlePauseContinue} disabled={!isRunning}>
                    {isPaused ? 'Continue' : 'Pause'}
                </button>
            </div>

            <div className="progress-bar-wrapper">
                <progress className="progress-bar" value={progress} max={totalSteps}></progress>
                <label>{totalSteps > 0 ? `${Math.floor((progress / totalSteps) * 100)}% complete` : '0% complete'}</label>
                <span>{currentFrequency > 0 ? `${convertToMinutesAndSeconds(currentFrequency)} remain` : null}</span>
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

export default DefaultPrograms;

import React, {  useEffect, useRef, useReducer, useCallback } from 'react';
import { useAppContext } from '../AppContext';
import ProgramRunner from '../util/ProgramRunner';

interface CustomProgramsProps {
    setIsRunning: (isRunning: boolean) => void;
    isRunning: boolean;
    isPortConnected: boolean;
}

function convertToMinutesAndSeconds(decimalMinutes: number): string {
    const minutes = Math.floor(decimalMinutes);
    const seconds = Math.floor((decimalMinutes - minutes) * 60);
    return `${minutes} minutes and ${seconds} seconds`;
}

// Consolidate state management with useReducer
interface State {
    progress: number;
    currentFrequency: number;
    totalSteps: number;
    intensity: number;
    selectedProgram: string;
    programNames: string[];
    isPaused: boolean;
    isStopping: boolean;
    isConnected: boolean;
}

const initialState: State = {
    progress: 0,
    currentFrequency: 0,
    totalSteps: 0,
    intensity: 5,
    selectedProgram: '',
    programNames: [],
    isPaused: false,
    isStopping: false,
    isConnected: false,
};

type Action =
    | { type: 'SET_PROGRESS'; currentStep: number; totalSteps: number; currentFrequency: number }
    | { type: 'SET_PROGRAM_NAMES'; names: string[] }
    | { type: 'SET_INTENSITY'; intensity: number }
    | { type: 'SET_CONNECTED'; isConnected: boolean }
    | { type: 'SET_SELECTED_PROGRAM'; selectedProgram: string }
    | { type: 'TOGGLE_PAUSE' }
    | { type: 'START_STOPPING' }
    | { type: 'RESET' };

const reducer = (state: State, action: Action): State => {
    switch (action.type) {
        case 'SET_PROGRESS':
            return {
                ...state,
                progress: action.currentStep,
                totalSteps: action.totalSteps,
                currentFrequency: action.currentFrequency,
            };
        case 'SET_PROGRAM_NAMES':
            return { ...state, programNames: action.names };
        case 'SET_INTENSITY':
            return { ...state, intensity: action.intensity };
        case 'SET_CONNECTED':
            return { ...state, isConnected: action.isConnected };
        case 'SET_SELECTED_PROGRAM':
            return { ...state, selectedProgram: action.selectedProgram };
        case 'TOGGLE_PAUSE':
            return { ...state, isPaused: !state.isPaused };
        case 'START_STOPPING':
            return { ...state, isStopping: true };
        case 'RESET':
            return initialState;
        default:
            throw new Error();
    }
};

const CustomPrograms: React.FC<CustomProgramsProps> = ({ setIsRunning, isRunning, isPortConnected }) => {
    const [state, dispatch] = useReducer(reducer, initialState);
    const { appDatabase, hoylandController } = useAppContext();
    const runnerRef = useRef<ProgramRunner | null>(null);

    // Set connection status based on port connection
    useEffect(() => {
        dispatch({ type: 'SET_CONNECTED', isConnected: isPortConnected });
    }, [isPortConnected]);

    // Load custom programs from database
    useEffect(() => {
        const loadCustomPrograms = async () => {
            try {
                const programs = await appDatabase.getCustomPrograms();
                const names = programs.map((program) => program.name);
                dispatch({ type: 'SET_PROGRAM_NAMES', names });
            } catch (error) {
                console.error('Failed to load custom programs:', error);
            }
        };

        if (appDatabase) {
            loadCustomPrograms();
        }
    }, [appDatabase]);

    // Memoize the handleProgressUpdate to avoid unnecessary re-renders
    const handleProgressUpdate = useCallback((currentStep: number, totalSteps: number, currentF: number) => {
        dispatch({ type: 'SET_PROGRESS', currentStep, totalSteps, currentFrequency: currentF });
    }, []);

    // Handle intensity changes
    useEffect(() => {
        if (runnerRef.current) {
            runnerRef.current.setIntensity(state.intensity);
            runnerRef.current.setProgressCallback(handleProgressUpdate);
        }
    }, [state.intensity, handleProgressUpdate]);

    // Load the selected program and initialize the runner
    const loadProgram = async (programName: string) => {
        const program = await appDatabase.loadData(programName);
        if (program) {
            runnerRef.current = new ProgramRunner(appDatabase, hoylandController, handleProgressUpdate);

            const totalSteps = program.range && program.data.length === 2
                ? program.data[1].frequency - program.data[0].frequency + 1
                : program.data.length;
            dispatch({ type: 'SET_PROGRESS', currentStep: 0, totalSteps, currentFrequency: 0 });
        }

        const port = await hoylandController.reconnectDevice();
        dispatch({ type: 'SET_CONNECTED', isConnected: port !== 'TEST' });
    };

    // Handle Start/Stop button
    const handleStartStop = async () => {
        if (isRunning) {
            dispatch({ type: 'START_STOPPING' });
            await runnerRef.current?.stopProgram();
            resetUI();
        } else {
            if (state.selectedProgram) {
                await loadProgram(state.selectedProgram);
                if (runnerRef.current) {
                    setIsRunning(true);
                    await runnerRef.current.initProgram();
                    dispatch({ type: 'SET_INTENSITY', intensity: 20 });
                    await runnerRef.current.initChannel1();
                    await runnerRef.current.startProgram(state.selectedProgram);
                    resetUI();
                }
            } else {
                alert('Please select a program');
            }
        }
    };

    // Toggle pause/resume
    const handlePauseContinue = useCallback(() => {
        if (state.isPaused) {
            runnerRef.current?.resumeProgram();
        } else {
            runnerRef.current?.pauseProgram();
        }
        dispatch({ type: 'TOGGLE_PAUSE' });
    }, [state.isPaused]);

    // Reset the UI and state
    const resetUI = () => {
        setIsRunning(false);
        dispatch({ type: 'RESET' });
        runnerRef.current = null;
    };

    return (
        <div className={`${state.isConnected ? 'connected' : 'disconnected'} tab-body custom-programs-programs`}>
            <div>
                <select
                    disabled={isRunning || !state.isConnected}
                    value={state.selectedProgram}
                    onChange={(e) => dispatch({ type: 'SET_SELECTED_PROGRAM', selectedProgram: e.target.value })}
                >
                    <option value="" disabled>Choose Custom&nbsp;&nbsp;&nbsp;&nbsp;</option>
                    {state.programNames.map((name) => (
                        <option key={name} value={name}>{name}</option>
                    ))}
                </select>

                <button
                    className={state.isStopping ? 'stopping' : isRunning ? 'stop' : 'start'}
                    onClick={handleStartStop}
                    disabled={!state.selectedProgram && !isRunning} // Disable when no program is selected and not running
                >
                    {state.isStopping ? 'Stopping...' : isRunning ? 'Stop' : 'Start'}
                </button>

                <button onClick={handlePauseContinue} disabled={!isRunning}>
                    {state.isPaused ? 'Continue' : 'Pause'}
                </button>
            </div>

            <div className="progress-bar-wrapper">
                <progress className="progress-bar" value={state.progress} max={state.totalSteps}></progress>
                <label>{state.totalSteps > 0 ? `${Math.floor((state.progress / state.totalSteps) * 100)}% complete` : '0% complete'}</label>
                <span>{state.currentFrequency > 0 ? `${convertToMinutesAndSeconds(state.currentFrequency)} remain` : null}</span>
            </div>

            <div>
                <label>Intensity: {Math.floor(((state.intensity || 0) / 20) * 100)}%</label>
                <input
                    type="range"
                    min="1"
                    max="20"
                    value={state.intensity}
                    onChange={(e) => dispatch({ type: 'SET_INTENSITY', intensity: parseInt(e.target.value, 10) })}
                    disabled={state.isStopping}
                />
            </div>
        </div>
    );
};

export default CustomPrograms;

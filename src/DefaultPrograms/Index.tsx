import React, { useReducer, useEffect, useRef, useCallback, useState } from 'react';
import { useAppContext } from '../AppContext';
import ProgramRunner from '../util/ProgramRunner';
import ProgramSelect from './ProgramSelect';

interface DefaultProgramsProps {
    setIsRunning: (isRunning: boolean) => void;
    isRunning: boolean;
    isPortConnected: boolean;
}

function convertToMinutesAndSeconds(decimalMinutes: number): string {
    const minutes = Math.floor(decimalMinutes);
    const seconds = Math.floor((decimalMinutes - minutes) * 60);
    return `${minutes} minutes and ${seconds} seconds`;
}

interface State {
    progress: number;
    timeRemaining: number;
    totalSteps: number;
    intensity: number;
    minIntensity: number;
    maxIntensity: number;
    selectedProgram: string;
    programNames: string[];
    isPaused: boolean;
    isStopping: boolean;
}

type Action =
    | { type: 'SET_PROGRESS'; payload: number }
    | { type: 'SET_TIME_REMAINING'; payload: number }
    | { type: 'SET_TOTAL_STEPS'; payload: number }
    | { type: 'SET_INTENSITY'; payload: number }
    | { type: 'SET_MIN_MAX_INTENSITY'; min: number; max: number }
    | { type: 'SET_SELECTED_PROGRAM'; payload: string }
    | { type: 'SET_PROGRAM_NAMES'; payload: string[] }
    | { type: 'SET_IS_PAUSED'; payload: boolean }
    | { type: 'SET_IS_STOPPING'; payload: boolean }
    | { type: 'RESET_UI' };

const initialState: State = {
    progress: 0,
    timeRemaining: 0,
    totalSteps: 0,
    intensity: 5,
    minIntensity: 1,
    maxIntensity: 20,
    selectedProgram: '',
    programNames: [],
    isPaused: false,
    isStopping: false,
};

function reducer(state: State, action: Action): State {
    switch (action.type) {
        case 'SET_PROGRESS':
            return { ...state, progress: action.payload };
        case 'SET_TIME_REMAINING':
            return { ...state, timeRemaining: action.payload };
        case 'SET_TOTAL_STEPS':
            return { ...state, totalSteps: action.payload };
        case 'SET_INTENSITY':
            return { ...state, intensity: action.payload };
        case 'SET_MIN_MAX_INTENSITY':
            return { ...state, minIntensity: action.min, maxIntensity: action.max };
        case 'SET_SELECTED_PROGRAM':
            return { ...state, selectedProgram: action.payload };
        case 'SET_PROGRAM_NAMES':
            return { ...state, programNames: action.payload };
        case 'SET_IS_PAUSED':
            return { ...state, isPaused: action.payload };
        case 'SET_IS_STOPPING':
            return { ...state, isStopping: action.payload };
        case 'RESET_UI':
            return {
                ...initialState,
                programNames: state.programNames,
                minIntensity: 1,
                maxIntensity: 20,
            };
        default:
            return state;
    }
}

const DefaultPrograms: React.FC<DefaultProgramsProps> = ({ setIsRunning, isRunning, isPortConnected }) => {
    const [state, dispatch] = useReducer(reducer, initialState);
    const [runningFrequency, setRunningFrequency] = useState<string>('0 Hz');
    const { appDatabase, hoylandController } = useAppContext();
    const runnerRef = useRef<ProgramRunner | null>(null);

    const loadDefaultPrograms = useCallback(async () => {
        try {
            await appDatabase.clearDatabase();
            const programs = await appDatabase.getDefaultPrograms();
            const names = programs.map(program => program.name);
            dispatch({ type: 'SET_PROGRAM_NAMES', payload: names });
        } catch (error) {
            console.error('Failed to load default programs:', error);
        }
    }, [appDatabase]);

    useEffect(() => {
        if (appDatabase.preloadDone) {
            loadDefaultPrograms();
        }
    }, [appDatabase.preloadDone, loadDefaultPrograms]);

    useEffect(() => {
        console.log("runningFrequency updated:", runningFrequency);
    }, [runningFrequency]);

    const handleProgressUpdate = useCallback(
        (currentStep: number, totalSteps: number, timeRemaining: number) => {
            dispatch({ type: 'SET_PROGRESS', payload: currentStep });
            dispatch({ type: 'SET_TOTAL_STEPS', payload: totalSteps });
            dispatch({ type: 'SET_TIME_REMAINING', payload: timeRemaining });
        },
        []
    );

    useEffect(() => {
        if (runnerRef.current) {
            runnerRef.current.setIntensity(state.intensity);
            runnerRef.current.setProgressCallback(handleProgressUpdate);
            runnerRef.current.setOnStopCallback(() => {
                resetUI();
            });
        }
    }, [state.intensity, handleProgressUpdate]);

    const loadProgram = useCallback(
        async (programName: string) => {
            try {
                const program = await appDatabase.loadData(programName);
                if (program) {
                    runnerRef.current = new ProgramRunner(appDatabase, hoylandController, handleProgressUpdate);
                    let minIntensity = 1;
                    let maxIntensity = 20;
                    let initialIntensity = 5;
                    if (programName === "ultrasound") {
                        minIntensity = 0.3 / 0.015; // 0.3V at 0%, step 0.015V
                        maxIntensity = 1.8 / 0.015; // 1.8V at 100%
                        initialIntensity = 0.825 / 0.015; // 0.825V at 35%
                    } else if (programName === "ultrasound 500") {
                        minIntensity = 0.8 / 0.01; // 0.8V at 0%, step 0.01V
                        maxIntensity = 1.8 / 0.01; // 1.8V at 100%
                        initialIntensity = 1.05 / 0.01; // 1.05V at 25%
                    } else if (programName === "ultrasound 670") {
                        minIntensity = 0.3 / 0.011; // 0.3V at 0%, step 0.011V
                        maxIntensity = 1.4 / 0.011; // 1.4V at 100%
                        initialIntensity = 0.575 / 0.011; // 0.575V at 25%
                    }
                    dispatch({ type: 'SET_MIN_MAX_INTENSITY', min: minIntensity, max: maxIntensity });
                    dispatch({ type: 'SET_INTENSITY', payload: initialIntensity });
                }
            } catch (error) {
                console.error('Failed to load program:', error);
            }
        },
        [appDatabase, hoylandController, handleProgressUpdate]
    );

    const handleStartStop = async () => {
        try {
            if (isRunning) {
                dispatch({ type: 'SET_IS_STOPPING', payload: true });
                await runnerRef.current?.stopProgram();
                dispatch({ type: 'SET_TIME_REMAINING', payload: 0 });
                resetUI();
            } else {
                if (state.selectedProgram) {
                    await loadProgram(state.selectedProgram);
                    if (runnerRef.current) {
                        setIsRunning(true);
                        await runnerRef.current.initializeChannel1();
                        await runnerRef.current.setChannel1StartFrequency(state.selectedProgram);
                        await runnerRef.current.initializeChannel0();
                        await runnerRef.current.startProgram(state.selectedProgram, setRunningFrequency);
                    }
                } else {
                    alert('Please select a program');
                }
            }
        } catch (error) {
            console.error('Error in handleStartStop:', error);
        }
    };

    const handlePauseContinue = () => {
        try {
            if (state.isPaused) {
                runnerRef.current?.resumeProgram();
                dispatch({ type: 'SET_IS_PAUSED', payload: false });
            } else {
                runnerRef.current?.pauseProgram();
                dispatch({ type: 'SET_IS_PAUSED', payload: true });
            }
        } catch (error) {
            console.error('Error in handlePauseContinue:', error);
        }
    };

    const resetUI = () => {
        dispatch({ type: 'RESET_UI' });
        setIsRunning(false);
        runnerRef.current = null;
    };

    useEffect(() => {
        return () => {
            runnerRef.current?.stopProgram().catch(error => {
                console.error('Error stopping program on unmount:', error);
            });
            runnerRef.current = null;
        };
    }, []);

    return (
        <div className={`${isPortConnected ? 'connected' : 'disconnected'} tab-body default-programs`}>
            <div>
                <select
                    disabled={isRunning || !isPortConnected}
                    value={state.selectedProgram}
                    onChange={(e) => dispatch({ type: 'SET_SELECTED_PROGRAM', payload: e.target.value })}
                >
                    <ProgramSelect programNames={state.programNames} />
                </select>
                <button
                    className={state.isStopping ? 'stopping' : isRunning ? 'stop' : 'start'}
                    onClick={handleStartStop}
                    disabled={(!state.selectedProgram && !isRunning) || state.isStopping}
                >
                    {state.isStopping ? 'Stopping...' : isRunning ? 'Stop' : 'Start'}
                </button>
                <button onClick={handlePauseContinue} disabled={!isRunning}>
                    {state.isPaused ? 'Continue' : 'Pause'}
                </button>
            </div>
            <div className="progress-bar-wrapper">
                <progress className="progress-bar" value={state.progress} max={state.totalSteps}></progress>
                <label>
                    {state.totalSteps > 0 ? `${Math.floor((state.progress / state.totalSteps) * 100)}% complete` : '0% complete'}
                </label>
                <span>
                    {state.timeRemaining > 0 ? `${convertToMinutesAndSeconds(state.timeRemaining)} remain` : null}
                </span>
                <div id="intensity-display">{runningFrequency}</div>
            </div>
            <div>
                <label>Intensity: {Math.floor(((state.intensity * ((state.maxIntensity - state.minIntensity) / 100) + state.minIntensity) / state.maxIntensity) * 100)}%</label>
                <input
                    type="range"
                    min={state.minIntensity}
                    max={state.maxIntensity}
                    value={state.intensity}
                    onChange={(e) => dispatch({ type: 'SET_INTENSITY', payload: parseInt(e.target.value, 10) })}
                    disabled={state.isStopping}
                />
            </div>
        </div>
    );
};

export default DefaultPrograms;
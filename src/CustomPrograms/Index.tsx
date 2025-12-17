import React, {useEffect, useRef, useReducer, useCallback, useState} from 'react';
import { useAppContext } from '../AppContext';
import ProgramRunner from '../util/ProgramRunner';
import ProgramSelect, { ProgramOption } from "./ProgramSelect.tsx";
import ConfirmModal from '../components/ConfirmModal';

interface CustomProgramsProps {
    setIsRunning: (isRunning: boolean) => void;
    isRunning: boolean;
    isDeviceReady: boolean;
    testMode: boolean;
    isUltrasoundOnly: boolean;
    setChannel1Active: (active: boolean) => void;
    setChannel2Active: (active: boolean) => void;
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
    programOptions: ProgramOption[];
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
    programOptions: [],
    isPaused: false,
    isStopping: false,
    isConnected: false,
};

type Action =
    | { type: 'SET_PROGRESS'; currentStep: number; totalSteps: number; currentFrequency: number }
    | { type: 'SET_PROGRAM_OPTIONS'; options: ProgramOption[] }
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
        case 'SET_PROGRAM_OPTIONS':
            return { ...state, programOptions: action.options };
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
            return {
                ...initialState,
                programOptions: state.programOptions,
                selectedProgram: '',
                isConnected: state.isConnected,
            };
        default:
            throw new Error();
    }
};

const CustomPrograms: React.FC<CustomProgramsProps> = ({ setIsRunning, isRunning, isDeviceReady, testMode, isUltrasoundOnly, setChannel1Active, setChannel2Active }) => {
    const [state, dispatch] = useReducer(reducer, initialState);
    const [runningFrequency, setRunningFrequency] = useState<string>('0  Hz');

    const { appDatabase, hoylandController } = useAppContext();
    const runnerRef = useRef<ProgramRunner | null>(null);

    // Set connection status based on port connection
    useEffect(() => {
        dispatch({ type: 'SET_CONNECTED', isConnected: isDeviceReady });
    }, [isDeviceReady]);

    // Load custom programs from database
    useEffect(() => {
        const loadCustomPrograms = async () => {
            try {
                let programs = await appDatabase.getCustomPrograms();

                // Filter based on ultrasound checkbox
                const isUltra = (n: string) => {
                    const s = (n || '').trim().toLowerCase();
                    return s.startsWith('ultra') || s === 'ultrasound';
                };
                programs = programs.filter(p => (isUltrasoundOnly ? isUltra(p.name) : !isUltra(p.name)));

                const options = programs.map((program) => ({
                    name: program.name,
                    durationMinutes: program.maxTimeInMinutes,
                }));
                dispatch({ type: 'SET_PROGRAM_OPTIONS', options });
                // Reset selected program when ultrasound filter changes
                dispatch({ type: 'SET_SELECTED_PROGRAM', selectedProgram: '' });
            } catch (error) {
                console.error('Failed to load custom programs:', error);
            }
        };

        if (appDatabase) {
            loadCustomPrograms();
        }
    }, [appDatabase, isUltrasoundOnly]);

    // Memoize the handleProgressUpdate to avoid unnecessary re-renders
    const handleProgressUpdate = useCallback((currentStep: number, totalSteps: number, currentF: number) => {
        dispatch({ type: 'SET_PROGRESS', currentStep, totalSteps, currentFrequency: currentF });
    }, []);
    

    useEffect(() => {
        if (runnerRef.current) {
            runnerRef.current.setIntensity(state.intensity);
            runnerRef.current.setProgressCallback(handleProgressUpdate);

            // Set the onStop callback to reset the UI when the program stops
            runnerRef.current.setOnStopCallback(() => {
                resetUI();  // Reset UI when the program stops
            });
        }
    }, [state.intensity, handleProgressUpdate]);



    // Load the selected program and initialize the runner
    const loadProgram = async (programName: string) => {
        const program = await appDatabase.loadData(programName);
        if (program) {
            runnerRef.current = new ProgramRunner(appDatabase, hoylandController, handleProgressUpdate);

            const totalSteps = program.range && program.data.length === 2
                ? Number(program.data[1]?.frequency) - Number(program.data[0]?.frequency) + 1
                : program.data.length;
            dispatch({ type: 'SET_PROGRESS', currentStep: 0, totalSteps, currentFrequency: 0 });
        }

        // Do not attempt to (re)connect device here; rely on top-level Connect button
    };

    // Handle Start/Stop button
    const [showConfirm, setShowConfirm] = useState(false);
    const pendingStartRef = useRef(false);

    const doStart = async () => {
        await loadProgram(state.selectedProgram);
        if (runnerRef.current) {
            setIsRunning(true);
            // Setup CH2 and turn it on (WFN1 in INITIAL_COMMANDS)
            await runnerRef.current.initializeChannel1();
            setChannel1Active(true);
            // Setup CH1, turn it on (WMN1), and sync (USA2) in SECONDARY_COMMANDS
            await runnerRef.current.initializeChannel0();
            setChannel2Active(true);
            dispatch({ type: 'SET_INTENSITY', intensity: 20 });
            await runnerRef.current.startProgram(state.selectedProgram, setRunningFrequency);
            resetUI();
        }
    };

    const handleStartStop = async () => {
        if (isRunning) {
            dispatch({ type: 'START_STOPPING' });
            await runnerRef.current?.stopProgram();
            setChannel1Active(false);
            setChannel2Active(false);
            resetUI();
        } else {
            if (state.selectedProgram) {
                if (!isUltrasoundOnly) {
                    pendingStartRef.current = true;
                    setShowConfirm(true);
                    return;
                }
                await doStart();
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
        setChannel1Active(false);
        setChannel2Active(false);
        dispatch({ type: 'RESET' });
        runnerRef.current = null;
    };

    const canUseControls = isDeviceReady || testMode;

    return (
        <>
        <div className={`${state.isConnected ? 'connected' : 'disconnected'} tab-body custom-programs-programs`}>
            <div>
                <select
                    disabled={isRunning || !canUseControls}
                    value={state.selectedProgram}
                    onChange={(e) => dispatch({type: 'SET_SELECTED_PROGRAM', selectedProgram: e.target.value})}
                >
                    <ProgramSelect
                        programOptions={state.programOptions}
                    />
                </select>

                    <button
                        className={state.isStopping ? 'stopping' : isRunning ? 'stop' : 'start'}
                        onClick={handleStartStop}
                        disabled={((( !canUseControls) || (!state.selectedProgram)) && !isRunning) || state.isStopping}
                    >
                        {state.isStopping ? 'Stopping...' : isRunning ? 'Stop' : 'Start'}
                    </button>

                    <button onClick={handlePauseContinue} disabled={!isRunning}>
                        {state.isPaused ? 'Continue' : 'Pause'}
                    </button>
            </div>

            <div className="progress-bar-wrapper">
                <progress
                    className="progress-bar"
                    value={Math.max(0, state.progress)}
                    max={Math.max(state.totalSteps, 1)}
                ></progress>
                <label>{state.totalSteps > 0 ? `${Math.floor((state.progress / state.totalSteps) * 100)}% complete` : '0% complete'}</label>
                <span>{state.currentFrequency > 0 ? `${convertToMinutesAndSeconds(state.currentFrequency)} remain` : null}</span>
                <div id="intensity-display">{runningFrequency}
                </div>
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
        <ConfirmModal
            open={showConfirm}
            title="Is Ultrasound device disconnected"
            onYes={async () => {
                setShowConfirm(false);
                if (pendingStartRef.current) {
                    pendingStartRef.current = false;
                    await doStart();
                }
            }}
            onNo={() => {
                pendingStartRef.current = false;
                setShowConfirm(false);
            }}
        />
        </>
    );
};

export default CustomPrograms;

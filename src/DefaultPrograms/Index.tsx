import React, { useReducer, useEffect, useRef, useCallback, useState } from 'react';
import { useAppContext } from '../AppContext';
import ProgramRunner from '../util/ProgramRunner';
import ProgramSelect, { ProgramOption } from './ProgramSelect.tsx';
import type { ProgramRow } from '../util/AppDatabase';

interface DefaultProgramsProps {
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

interface State {
    progress: number;
    timeRemaining: number;
    totalSteps: number;
    intensity: number;
    selectedProgram: string;
    programOptions: ProgramOption[];
    isPaused: boolean;
    isStopping: boolean;
    intensity_step: number;
    intensity_min: number;
    intensity_max: number;
}

type Action =
    | { type: 'SET_PROGRESS'; payload: number }
    | { type: 'SET_TIME_REMAINING'; payload: number }
    | { type: 'SET_TOTAL_STEPS'; payload: number }
    | { type: 'SET_INTENSITY'; payload: number }
    | { type: 'SET_SELECTED_PROGRAM'; payload: string }
    | { type: 'SET_PROGRAM_OPTIONS'; payload: ProgramOption[] }
    | { type: 'SET_IS_PAUSED'; payload: boolean }
    | { type: 'SET_IS_STOPPING'; payload: boolean }
    | { type: 'SET_BOUNDS_AND_INTENSITY'; payload: { min: number; max: number; step: number; intensity: number } }
    | { type: 'RESET_UI' };

const initialState: State = {
    progress: 0,
    timeRemaining: 0,
    totalSteps: 0,
    intensity: 1,
    selectedProgram: '',
    programOptions: [],
    isPaused: false,
    isStopping: false,
    intensity_step: 1,
    intensity_min: 1,
    intensity_max: 20,
};

// ───────────────────────── helpers ─────────────────────────

// Coerce any unknown to number with a safe fallback (supports fractional strings)
function num(v: unknown, fallback: number): number {
    if (v === null || v === undefined) return fallback;
    const n = typeof v === 'string' ? parseFloat(v) : Number(v);
    return Number.isFinite(n) ? n : fallback;
}

// Snap to nearest step within [min, max] (handles inverted bounds & bad step)
function clampAndSnap(value: number, min: number, max: number, step: number): number {
    const lo = Math.min(min, max);
    const hi = Math.max(min, max);
    const s = step > 0 ? step : 1;
    const clamped = Math.min(Math.max(value, lo), hi);
    const steps = Math.round((clamped - lo) / s);
    return +(lo + steps * s).toFixed(6); // tame FP noise
}

// Compute the desired starting intensity from programme fields.
// Priority: startIntensityV → sliderPercent → fallback.
// Fallback rule: default to 25% along the slider; BUT if using the default bounds (1..20 step 1), force 5.
function deriveStartIntensity(program: Partial<ProgramRow> | null | undefined, min: number, max: number, step: number): number {
    if (program && program.startIntensityV !== undefined) {
        return clampAndSnap(num(program.startIntensityV, min), min, max, step);
    }
    if (program && program.sliderPercent !== undefined) {
        const pct = Math.max(0, Math.min(100, num(program.sliderPercent, 0)));
        return clampAndSnap(min + (pct / 100) * (max - min), min, max, step);
    }

    // Fallbacks
    const isDefaultBounds = min === 1 && max === 20 && Math.abs(step - 1) < 1e-9;
    if (isDefaultBounds) {
        // User requirement: default intensity should be exactly 5 for default slider
        return 5;
    }
    // Otherwise, 25% along the slider
    return clampAndSnap(min + 0.25 * (max - min), min, max, step);
}

// ───────────────────────── reducer ─────────────────────────

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
        case 'SET_SELECTED_PROGRAM':
            return { ...state, selectedProgram: action.payload };
        case 'SET_PROGRAM_OPTIONS':
            return { ...state, programOptions: action.payload };
        case 'SET_IS_PAUSED':
            return { ...state, isPaused: action.payload };
        case 'SET_IS_STOPPING':
            return { ...state, isStopping: action.payload };
        case 'SET_BOUNDS_AND_INTENSITY':
            return {
                ...state,
                intensity_min: action.payload.min,
                intensity_max: action.payload.max,
                intensity_step: action.payload.step,
                intensity: action.payload.intensity,
            };
        case 'RESET_UI':
            return {
                ...initialState,
                programOptions: state.programOptions, // retain loaded programme names
                selectedProgram: '', // reset to "Choose" option when program stops
            };
        default:
            return state;
    }
}

// ───────────────────────── component ─────────────────────────

import ConfirmModal from '../components/ConfirmModal';

const DefaultPrograms: React.FC<DefaultProgramsProps> = ({ setIsRunning, isRunning, isDeviceReady, testMode, isUltrasoundOnly, setChannel1Active, setChannel2Active }) => {
    const [state, dispatch] = useReducer(reducer, initialState);
    const [runningFrequency, setRunningFrequency] = useState<string>('0  Hz');

    const { appDatabase, hoylandController } = useAppContext();
    const runnerRef = useRef<ProgramRunner | null>(null);

    const loadDefaultPrograms = useCallback(async () => {
        try {
            await appDatabase.ensurePreloaded();
            let programs = await appDatabase.getDefaultPrograms();

            // Filter based on ultrasound checkbox
            const isUltra = (n: string) => {
                const s = (n || '').trim().toLowerCase();
                return s.startsWith('ultra') || s === 'ultrasound';
            };
            programs = programs.filter(p => (isUltrasoundOnly ? isUltra(p.name) : !isUltra(p.name)));

            const options: ProgramOption[] = programs.map((program) => ({
                name: program.name,
                durationMinutes: num(program.maxTimeInMinutes, 0),
            }));
            dispatch({ type: 'SET_PROGRAM_OPTIONS', payload: options });
            // Reset selected program when ultrasound filter changes
            dispatch({ type: 'SET_SELECTED_PROGRAM', payload: '' });
        } catch (error) {
            console.error('Failed to load default programs:', error);
        }
    }, [appDatabase, isUltrasoundOnly]);

    useEffect(() => {
        loadDefaultPrograms();
    }, [loadDefaultPrograms]);


    useEffect(() => {
        console.log('runningFrequency updated:', runningFrequency);
    }, [runningFrequency]);

    const handleProgressUpdate = useCallback(
        (currentStep: number, totalSteps: number, timeRemaining: number) => {
            dispatch({ type: 'SET_PROGRESS', payload: currentStep });
            dispatch({ type: 'SET_TOTAL_STEPS', payload: totalSteps });
            dispatch({ type: 'SET_TIME_REMAINING', payload: timeRemaining });
        },
        []
    );

    const loadProgram = useCallback(
        async (programName: string) => {
            try {
                const program = await appDatabase.loadData(programName);
                if (program) {
                    const runner = new ProgramRunner(appDatabase, hoylandController, handleProgressUpdate);
                    runner.setOnStopCallback(() => resetUI());
                    runner.setProgressCallback(handleProgressUpdate);
                    runnerRef.current = runner;
                }
            } catch (error) {
                console.error('Failed to load program:', error);
            }
        },
        [appDatabase, hoylandController, handleProgressUpdate]
    );

    // Apply slider bounds + starting intensity whenever the selected programme changes (atomic update).
    useEffect(() => {
        const applyProgramSlider = async () => {
            if (!state.selectedProgram) return;

            try {
                const program = await appDatabase.loadData(state.selectedProgram);
                if (!program) return;

                // Programme-provided bounds with required defaults (min=1, max=20, step=1)
                const min = num(program.sliderMinV, 1);
                const max = num(program.sliderMaxV, 20);
                const step = num(program.sliderStepV, 1);

                // startIntensityV > sliderPercent > fallback rule (25% or 5 if default bounds)
                const startApplied = deriveStartIntensity(program, min, max, step);

                console.log('Programme slider applied:', {
                    program: state.selectedProgram,
                    min, max, step,
                    startApplied,
                    from: {
                        startIntensityV: program.startIntensityV,
                        sliderPercent: program.sliderPercent,
                    },
                });

                // UI update only; device not touched here
                dispatch({
                    type: 'SET_BOUNDS_AND_INTENSITY',
                    payload: { min, max, step, intensity: startApplied },
                });

                // Prime runner’s internal intensity (no device write yet)
                if (runnerRef.current) {
                    await runnerRef.current.setIntensity(startApplied, { applyNow: false });
                }
            } catch (err) {
                console.error('Failed to apply slider config from program:', err);
                const min = 1, max = 20, step = 1;
                const fallback = deriveStartIntensity({}, min, max, step);
                dispatch({
                    type: 'SET_BOUNDS_AND_INTENSITY',
                    payload: { min, max, step, intensity: fallback },
                });
                if (runnerRef.current) {
                    await runnerRef.current.setIntensity(fallback, { applyNow: false });
                }
            }
        };

        applyProgramSlider();
    }, [state.selectedProgram, appDatabase]);

    const [showConfirm, setShowConfirm] = useState(false);
    const pendingStartRef = useRef(false);

    const doStart = async () => {
        await loadProgram(state.selectedProgram);
        if (!runnerRef.current) return;

        setIsRunning(true);
        // Setup channels (no turn on yet)
        await runnerRef.current.initializeChannel1();
        await runnerRef.current.setChannel1StartFrequency(state.selectedProgram);
        await runnerRef.current.initializeChannel0();
        await runnerRef.current.setIntensity(state.intensity, { applyNow: true });
        // Turn on BOTH channels together (last step before program starts)
        await runnerRef.current.turnOnChannels();
        // UI updates AFTER hardware commands sent
        setChannel1Active(true);
        setChannel2Active(true);
        await runnerRef.current.startProgram(state.selectedProgram, setRunningFrequency);
    };

    const handleStartStop = async () => {
        try {
            if (isRunning) {
                dispatch({ type: 'SET_IS_STOPPING', payload: true });
                await runnerRef.current?.stopProgram();
                dispatch({ type: 'SET_TIME_REMAINING', payload: 0 });
                setChannel1Active(false);
                setChannel2Active(false);
                resetUI();
            } else {
                if (!state.selectedProgram) {
                    alert('Please select a program');
                    return;
                }
                // If ultrasound device is NOT connected, confirm every time before starting
                if (!isUltrasoundOnly) {
                    pendingStartRef.current = true;
                    setShowConfirm(true);
                    return;
                }
                await doStart();
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
        setChannel1Active(false);
        setChannel2Active(false);
        runnerRef.current = null;
    };

    useEffect(() => {
        return () => {
            runnerRef.current
                ?.stopProgram()
                .catch((error) => {
                    console.error('Error stopping program on unmount:', error);
                });
            runnerRef.current = null;
        };
    }, []);

    // Relative % label based on current bounds
    const relativePct = Math.round(
        ((state.intensity - state.intensity_min) / (state.intensity_max - state.intensity_min)) * 100
    );

    const canUseControls = isDeviceReady || testMode;

    return (
        <>
        <div className={`${isDeviceReady ? 'connected' : 'disconnected'} tab-body default-programs`}>
            <div>
                <select
                    disabled={isRunning || !canUseControls}
                    value={state.selectedProgram}
                    onChange={(e) => dispatch({ type: 'SET_SELECTED_PROGRAM', payload: e.target.value })}
                >
                    <ProgramSelect programOptions={state.programOptions} />
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
                    value={state.totalSteps > 0 ? Math.max(0, state.progress - 1) : 0}
                    max={Math.max(state.totalSteps, 1)}
                />
                <label>
                    {state.totalSteps > 0
                        ? `${Math.max(0, Math.floor(((state.progress - 1) / state.totalSteps) * 100))}% complete`
                        : '0% complete'}
                </label>
                <span>
          {state.timeRemaining > 0 ? `${convertToMinutesAndSeconds(state.timeRemaining)} remain` : null}
        </span>
                <div id="intensity-display">{runningFrequency}</div>
            </div>

            <div>
                <label>Intensity: {Number.isFinite(relativePct) ? relativePct : 0}%</label>
                <input
                    type="range"
                    min={state.intensity_min}
                    max={state.intensity_max}
                    step={state.intensity_step}
                    value={state.intensity}
                    onChange={async (e) => {
                        const value = Number(e.target.value);
                        const snapped = clampAndSnap(value, state.intensity_min, state.intensity_max, state.intensity_step);
                        dispatch({ type: 'SET_INTENSITY', payload: snapped });

                        // Keep ProgramRunner’s internal intensity aligned; only push to device if running
                        if (runnerRef.current) {
                            try {
                                await runnerRef.current.setIntensity(snapped, { applyNow: isRunning });
                            } catch (err) {
                                console.error('Failed to apply intensity:', err);
                            }
                        }

                        console.log('Intensity slider changed:', {
                            min: state.intensity_min,
                            max: state.intensity_max,
                            step: state.intensity_step,
                            start: state.intensity,
                            current: snapped,
                            sentToDevice: isRunning,
                        });
                    }}
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

export default DefaultPrograms;

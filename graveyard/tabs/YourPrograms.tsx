import React from "react";
import { ProgramItem } from "../types.ts";

interface YourProgramsProps {
    name: string;
    setName: (name: string) => void;
    programNames: string[];
    isRunning: boolean;
    handleStartStop: () => void;
    isPaused: boolean;
    handlePause: () => void;
    handleStopAndReset: () => void;
    intensity: number;
    setIntensity: (intensity: number) => void;
    progress: number;
    currentFrequency: number | null;
    errors: { id: number; message: string }[];
    dismissError: (id: number) => void;
}

const YourPrograms: React.FC<YourProgramsProps> = ({
                                                       name,
                                                       setName,
                                                       programNames,
                                                       isRunning,
                                                       handleStartStop,
                                                       isPaused,
                                                       handlePause,
                                                       handleStopAndReset,
                                                       intensity,
                                                       setIntensity,
                                                       progress,
                                                       currentFrequency,
                                                       errors,
                                                       dismissError,
                                                   }) => {
    return (
        <div id="your-programs" className="tabBody">
            <h2>Personalised Programs</h2>
            <div className="progress-bar-wrapper program-toolbar">
                <label htmlFor="your-progress-bar">Running Program: {name}</label>
                <div className="progress-bar">
                    <div id="your-progress-bar" className="progress" style={{ width: `${progress}%` }}></div>
                    {currentFrequency !== null && (
                        <div className="current-frequency">{`Frequency: ${currentFrequency} Hz`}</div>
                    )}
                </div>
            </div>

            <div className="program-toolbar">
                <label htmlFor="your-program-select">Select Program:</label>
                <select id="your-program-select" value={name} onChange={(e) => setName(e.currentTarget.value)}>
                    <option value="">Click here to choose personal program</option>
                    {programNames.map((programName) => (
                        <option key={programName} value={programName}>
                            {programName}
                        </option>
                    ))}
                </select>
                <div>
                    <button type="button" onClick={handleStartStop}>
                        {isRunning ? "Stop" : "Start"}
                    </button>
                    <button type="button" onClick={handlePause}>
                        {isPaused ? "Resume" : "Pause"}
                    </button>
                </div>
                <div>
                    <button type="button" onClick={handleStopAndReset}>
                        Stop and Reset
                    </button>
                </div>
            </div>

            <div className="program-toolbar">
                <label htmlFor="intensity-slider2">
                    Intensity: <span>{intensity}%</span>
                </label>
                <input
                    id="intensity-slider2"
                    type="range"
                    min="0"
                    max="100"
                    value={intensity}
                    onChange={(e) => setIntensity(Number(e.currentTarget.value))}
                />
            </div>
        </div>
    );
};

export default YourPrograms;

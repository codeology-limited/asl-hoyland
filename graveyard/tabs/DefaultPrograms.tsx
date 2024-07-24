import React, { useState, useEffect } from "react";
import { ProgramItem } from "../types.ts";

interface DefaultProgramsProps {
    name: string;
    setName: (name: string) => void;
    defaultProgramNames: string[];
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

const DefaultPrograms: React.FC<DefaultProgramsProps> = ({
                                                             name,
                                                             setName,
                                                             defaultProgramNames,
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
        <div id="default-programs" className="tabBody">
            <h2>Standard Programs</h2>
            <div className="progress-bar-wrapper program-toolbar">
                <label htmlFor="default-progress-bar">Running Program: {name}</label>
                <div className="progress-bar">
                    <div id="default-progress-bar" className="progress" style={{ width: `${progress}%` }}></div>
                    {currentFrequency !== null && (
                        <div className="current-frequency">{`Frequency: ${currentFrequency} Hz`}</div>
                    )}
                </div>
            </div>

            <div className="program-toolbar">
                <label htmlFor="default-program-select">Select Program:</label>
                <select id="default-program-select" value={name} onChange={(e) => setName(e.currentTarget.value)}>
                    <option value="">Click here to choose program</option>
                    {defaultProgramNames.map((programName) => (
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
                <label htmlFor="intensity-slider">
                    Intensity: <span>{intensity}%</span>
                </label>
                <input
                    id="intensity-slider"
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

export default DefaultPrograms;

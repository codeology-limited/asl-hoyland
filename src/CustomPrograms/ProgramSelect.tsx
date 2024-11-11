import React from 'react';

interface ProgramSelectProps {
    isConnected: boolean;
    isRunning: boolean;
    selectedProgram: string;
    programNames: string[];
    onProgramChange: (program: string) => void;
}

const ProgramSelect: React.FC<ProgramSelectProps> = ({
                                                         isConnected,
                                                         isRunning,
                                                         selectedProgram,
                                                         programNames,
                                                         onProgramChange
                                                     }) => {
    if (!programNames || programNames.length === 0) {
        return null; // Don't render the select if no programs are available
    }

    return (
        <select
            disabled={isRunning || !isConnected}
            value={selectedProgram}
            onChange={(e) => onProgramChange(e.target.value)}
        >
            <option value="" disabled>Choose Custom&nbsp;&nbsp;&nbsp;&nbsp;</option>
            {programNames.map((name) => (
                <option key={name} value={name}>{name}</option>
            ))}
        </select>
    );
};

export default ProgramSelect;

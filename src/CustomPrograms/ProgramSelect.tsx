import React from 'react';

export interface ProgramOption {
    name: string;
    durationMinutes?: number;
}

interface ProgramSelectProps {
    programOptions: ProgramOption[];
    chooseLabel?: string;
}

const formatDuration = (minutes?: number) => {
    const minutesRounded = Number.isFinite(minutes ?? NaN) ? Math.round(minutes!) : 0;
    return `${minutesRounded}m`;
};

const ProgramSelect: React.FC<ProgramSelectProps> = ({ programOptions, chooseLabel = 'Choose Custom' }) => {
    if (!programOptions || programOptions.length === 0) {
        return null;
    }

    return (
        <>
            <option value="" disabled>{chooseLabel}&nbsp;&nbsp;&nbsp;&nbsp;</option>
            {programOptions.map(({ name, durationMinutes }) => (
                <option key={name} value={name}>
                    {name} ({formatDuration(durationMinutes)})
                </option>
            ))}
        </>
    );
};

export default ProgramSelect;

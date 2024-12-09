import React from 'react';

interface ProgramSelectProps {
    programNames: string[];
}

const ProgramSelect: React.FC<ProgramSelectProps> = ({ programNames }) => {
    if (!programNames || programNames.length === 0) {
        return null; // Don't render anything if no programs are available
    }

    return (
        <>
            <option value="" disabled>Choose&nbsp;&nbsp;&nbsp;&nbsp;</option>
            {programNames.map((name) => (
                <option key={name} value={name}>{name}</option>
            ))}
        </>
    );
};

export default ProgramSelect;

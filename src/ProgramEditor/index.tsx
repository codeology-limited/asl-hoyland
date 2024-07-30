import React, { useState, useEffect } from 'react';
import { ProgramItem } from '../types';
import { useAppContext } from '../AppContext';

interface ProgramEditorProps {
    onSave: (programName: string, programData: ProgramItem[], programMaxTime: number, range: boolean) => void;
    onCancel: () => void;
}

interface Program {
    id?: number;
    name: string;
    range: boolean;
    data: ProgramItem[];
    maxTimeInMinutes: number;
    default: boolean;
    startFrequency: number;
}

const ProgramEditor: React.FC<ProgramEditorProps> = ({ onSave, onCancel }) => {
    const [programName, setProgramName] = useState('');
    const [range, setRange] = useState(false);
    const [rows, setRows] = useState<ProgramItem[]>([{ channel: 1, frequency: 0, runTime: 0 }]);
    const [customPrograms, setCustomPrograms] = useState<string[]>([]);
    const { appDatabase } = useAppContext();

    useEffect(() => {
        const loadCustomPrograms = async () => {
            const programs = await appDatabase.getCustomPrograms();
            const programNames = programs.map(program => program.name);
            setCustomPrograms(programNames);
        };
        loadCustomPrograms();
    }, [appDatabase]);

    useEffect(() => {
        if (range) {
            setRows([
                { channel: 1, frequency: 0, runTime: 0 },
                { channel: 1, frequency: 0, runTime: 0 },
            ]);
        } else {
            setRows([{ channel: 1, frequency: 0, runTime: 0 }]);
        }
    }, [range]);

    const handleAddRow = () => {
        if (!range) {
            setRows([...rows, { channel: 1, frequency: 0, runTime: 0 }]);
        }
    };

    const handleDeleteRow = (index: number) => {
        if (!range) {
            const newRows = rows.filter((_, i) => i !== index);
            setRows(newRows);
        }
    };

    const handleInputChange = (index: number, field: string, value: string) => {
        const newRows = [...rows];
        newRows[index] = { ...newRows[index], [field]: Number(value) };
        setRows(newRows);
    };

    const handleSave = async () => {
        const program: Program = {
            name: programName,
            range,
            data: rows,
            maxTimeInMinutes: 0, // Adjust this as needed
            default: false,
            startFrequency: 0 // Adjust this as needed
        };

        try {
            // Check if the program already exists
            const existingProgram = await appDatabase.testForProgram(programName);
            if (existingProgram) {
                // Overwrite the existing program
                console.log("Program exists overwriting")
            }

            console.log('Saving program:', program);
            await appDatabase.saveData(program);
            console.log('Program saved successfully');
            onSave(programName, rows, 0, range); // Adjust the parameters as needed
        } catch (error) {
            console.error('Error saving program:', error);
        }
    };

    const handleLoadProgram = async (programName: string) => {
        const program = await appDatabase.loadData(programName);
        if (program) {
            setProgramName(program.name);
            setRange(!!program.range);
            setRows(program.data);
        }
    };

    return (
        <div id="editor" className="tab-body editor">
            <div>
                <select onChange={(e) => handleLoadProgram(e.target.value)}>
                    <option value="">Choose existing or create a new Program</option>
                    {customPrograms.map(name => (
                        <option key={name} value={name}>{name}</option>
                    ))}
                </select>
                <button type="button">Edit</button>
            </div>
            <div>
                <label>
                    Program Name:
                    <input
                        type="text"
                        placeholder="Enter program name"
                        value={programName}
                        onChange={(e) => setProgramName(e.target.value)}
                    />
                </label>
            </div>
            <div>
                <label>
                    Range:
                    <input
                        type="checkbox"
                        checked={range}
                        onChange={(e) => setRange(e.target.checked)}
                    />
                </label>
            </div>
            <div>
                <table>
                    <thead>
                    <tr>
                        <th></th>
                        <th>Frequency (Hz)</th>
                        <th>Run Time (ms)</th>
                        <th></th>
                        <th></th>
                    </tr>
                    </thead>
                    <tbody>
                    {rows.map((row, index) => (
                        <tr key={index}>
                            <td className="drag-handle">
                                <span>|||</span>
                            </td>
                            <td>
                                <input
                                    type="text"
                                    value={row.frequency.toString()}
                                    onChange={(e) => handleInputChange(index, 'frequency', e.target.value)}
                                />
                            </td>
                            <td>
                                <input
                                    type="text"
                                    value={row.runTime.toString()}
                                    onChange={(e) => handleInputChange(index, 'runTime', e.target.value)}
                                />
                            </td>
                            <td className="add-frequency-btn">
                                {!range && index === rows.length - 1 && (
                                    <button type="button" onClick={handleAddRow}>
                                        +
                                    </button>
                                )}
                            </td>
                            <td>
                                {!range && index !== 0 && (
                                    <button type="button" onClick={() => handleDeleteRow(index)} className="delete-frequency-btn">
                                        -
                                    </button>
                                )}
                            </td>
                        </tr>
                    ))}
                    </tbody>
                </table>
            </div>
            <div>
                <button type="button" onClick={handleSave}>Save</button>
                <button type="button" onClick={onCancel}>Cancel</button>
            </div>
        </div>
    );
};

export default ProgramEditor;

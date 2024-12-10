import React, { useState, useEffect } from 'react';
import { Program, ProgramItem } from '../types';
import { useAppContext } from '../AppContext';

// src/types.ts
interface LocalProgramItem {
    channel: number;
    frequency: string;
    runTime: number;
}
interface ProgramEditorProps {
    onSave: (programName: string, programData: LocalProgramItem[], programMaxTime: number, range: boolean) => void;
    onCancel: () => void;
}

const ProgramEditor: React.FC<ProgramEditorProps> = ({ onSave }) => {
    const [programName, setProgramName] = useState('');
    const [range, setRange] = useState(false);
    const [rows, setRows] = useState<LocalProgramItem[]>([{ channel: 1, frequency: '', runTime: 0 }]);
    const [customPrograms, setCustomPrograms] = useState<string[]>([]);
    const [isSaving, setIsSaving] = useState(false);

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
                { channel: 1, frequency: '', runTime: 0 },
                { channel: 1, frequency: '', runTime: 0 },
            ]);
        } else {
            setRows([{ channel: 1, frequency: '', runTime: 0 }]);
        }
    }, [range]);

    const handleAddRow = () => {
        if (!range) {
            setRows([...rows, { channel: 1, frequency: '', runTime: 0 }]);
        }
    };

    const handleDeleteRow = (index: number) => {
        if (!range) {
            const newRows = rows.filter((_, i) => i !== index);
            setRows(newRows);
        }
    };

    const handleInputChange = (index: number, field: string, value: string) => {
        // Allow only numbers and at most one decimal point
        const isValid = /^(\d+\.?\d*|\.\d*)$/.test(value);

        if (isValid || value === '') { // Allow clearing the field
            const newRows = [...rows];
            newRows[index] = { ...newRows[index], [field]: value };
            setRows(newRows);
        }
    };


    const handleSave = async () => {
        if (isSaving) return; // Prevent multiple calls
        setIsSaving(true);

        try {
            // Convert frequency to a number for saving
            const validatedRows = rows.map(row => ({
                ...row,
                frequency: parseFloat(row.frequency) || 0, // Convert to number or default to 0
                runTime: row.runTime * 60_000, // Convert runtime to milliseconds
            }));

            const maxTimeInMinutes = validatedRows.reduce((total, item) => total + item.runTime / 60_000, 0);

            const program: Program = {
                name: programName,
                range,
                data: validatedRows,
                maxTimeInMinutes,
                default: false,
                startFrequency: 3.1, // Adjust as needed
            };

            console.log('Saving program:', JSON.stringify(program));
            await appDatabase.saveData(program);
            console.log('Program saved successfully');

            onSave(programName, rows, maxTimeInMinutes, range);
        } catch (error) {
            console.error('Error saving program:', error);
        } finally {
            setIsSaving(false);
        }
    };

    const handleLoadProgram = async (programName: string) => {
        const program = await appDatabase.loadData(programName);
        if (program) {
            const data = program.data.map(row => ({
                ...row,
                frequency: row.frequency.toString(), // Convert to string for editing
                runTime: row.runTime / 60_000, // Convert back to minutes
            }));

            setProgramName(programName);
            setRange(!!program.range);
            setRows(data);
        }
    };

    return (
        <div id="editor" className="tab-body editor">
            <div>
                <label>
                    New program or Choose Program:<br />
                    <select onChange={(e) => handleLoadProgram(e.target.value)}>
                        <option value="">New Program&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</option>
                        {customPrograms.map(name => (
                            <option key={name} value={name}>{name}</option>
                        ))}
                    </select>
                </label>
            </div>
            <div>
                <label>
                    Program Name:<br />
                    <input
                        type="text"
                        placeholder="Enter program name"
                        value={programName}
                        onChange={(e) => setProgramName(e.target.value)}
                    />
                </label>
            </div>
            <div id="range-selector">
                <label><input
                    type="checkbox"
                    checked={range}
                    onChange={(e) => setRange(e.target.checked)}
                />&nbsp;&nbsp;This is a ranged program.<br />
                    Note 1: If this program is a range you must supply a start and an end frequency.<br />
                    Note 2: More than 400 frequency adjustments per minute not supported.)<br />
                </label>
            </div>
            <div className='program-table'>
                <table className={range ? 'range' : ''}>
                    <thead>
                    <tr>
                        <th></th>
                        <th>Frequency in Hertz</th>
                        <th>{range ? 'Total run time' : 'Minutes per frequency'}</th>
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
                                    value={row.frequency}
                                    onChange={(e) => handleInputChange(index, 'frequency', e.target.value)}
                                    placeholder={range ? (index === 0 ? 'Start Frequency' : 'End Frequency') : 'Frequency'}
                                />
                            </td>
                            <td>
                                <input
                                    className='time'
                                    type="text"
                                    value={row.runTime.toString()}
                                    onChange={(e) => handleInputChange(index, 'runTime', e.target.value)}
                                    placeholder="Time in minutes"
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
                                    <button
                                        type="button"
                                        onClick={() => handleDeleteRow(index)}
                                        className="delete-frequency-btn"
                                    >
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
                <button type="button" onClick={handleSave} disabled={isSaving}>Save</button>
            </div>
        </div>
    );
};

export default ProgramEditor;

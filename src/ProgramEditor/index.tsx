import React, { useState, useEffect } from 'react';
import { Program , ProgramItem} from '../types';
import { useAppContext } from '../AppContext';


interface ProgramEditorProps {
    onSave: (programName: string, programData: ProgramItem[], programMaxTime: number, range: boolean) => void;
    onCancel: () => void;
}


type EditRow = { channel: number; frequency: string; runTime: string; sweepTo?: string };

const ProgramEditor: React.FC<ProgramEditorProps> = ({ onSave }) => {
    const [programName, setProgramName] = useState('');
    const [range, setRange] = useState(false);
    const [rows, setRows] = useState<EditRow[]>([{ channel: 1, frequency: '', runTime: '' }]);
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
                { channel: 1, frequency: '', runTime: '' },
                { channel: 1, frequency: '', runTime: '' },
            ]);
        } else {
            setRows([{ channel: 1, frequency: '', runTime: '' }]);
        }
    }, [range]);

    const handleAddRow = () => {
        if (!range) {
            setRows([...rows, { channel: 1, frequency: '', runTime: '' }]);
        }
    };

    const handleDeleteRow = (index: number) => {
        if (!range) {
            const newRows = rows.filter((_, i) => i !== index);
            setRows(newRows);
        }
    };

    const handleInputChange = (index: number, field: 'frequency' | 'runTime', value: string) => {
        // Allow only numbers and at most one decimal point
        const isValid = /^(\d+\.?\d*|\.\d*)$/.test(value);

        if (isValid || value === '') { // Allow clearing the field
            const newRows = [...rows];
            newRows[index] = { ...newRows[index], [field]: value } as EditRow;
            setRows(newRows);
        }
    };


    const handleSave = async () => {
        if (isSaving) return;
        if (!programName.trim()) { alert('Please enter a program name.'); return; }
        if (rows.every(r => !r.frequency.trim())) { alert('Please enter at least one frequency.'); return; }
        setIsSaving(true);

        try {
            const validatedRows: ProgramItem[] = rows.map(row => ({
                channel: row.channel,
                frequency: parseFloat(row.frequency) || 0,
                runTime: (parseFloat(row.runTime) || 0) * 60_000,
                ...(row.sweepTo ? { sweepTo: parseFloat(row.sweepTo) } : {}),
            }));

            const maxTimeInMinutes = validatedRows.reduce((total, item) => total + item.runTime / 60_000, 0);

            const program: Program = {
                name: programName.trim(),
                range,
                data: validatedRows,
                maxTimeInMinutes,
                default: false,
                startFrequency: 0,
            };

            console.log('Saving program:', JSON.stringify(program));
            await appDatabase.saveData(program);
            console.log('Program saved successfully');

            onSave(programName, validatedRows, maxTimeInMinutes, range);
        } catch (error) {
            console.error('Error saving program:', error);
        } finally {
            setIsSaving(false);
        }
    };

    const handleLoadProgram = async (programName: string) => {
        const program = await appDatabase.loadData(programName);
        if (program) {
            const data: EditRow[] = program.data.map(row => ({
                channel: row.channel,
                frequency: String(row.frequency),
                runTime: String(row.runTime / 60_000),
                ...(row.sweepTo != null ? { sweepTo: String(row.sweepTo) } : {}),
            }));

            setProgramName(programName);
            setRange(Boolean(program.range));
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
                                    value={row.runTime}
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

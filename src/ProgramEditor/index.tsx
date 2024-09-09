import React, { useState, useEffect } from 'react';
import { Program, ProgramItem } from '../types';
import { useAppContext } from '../AppContext';

interface ProgramEditorProps {
    onSave: (programName: string, programData: ProgramItem[], programMaxTime: number, range: boolean) => void;
    onCancel: () => void;
}

const ProgramEditor: React.FC<ProgramEditorProps> = ({ onSave }) => {
    const [programName, setProgramName] = useState('');
    const [range, setRange] = useState(false);
    const [rows, setRows] = useState<ProgramItem[]>([{ channel: 1, frequency: 0, runTime: 0 }]);
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
        if (isSaving) return; // Prevent multiple calls
        setIsSaving(true);

        // Calculate maxTimeInMinutes directly from the rows
        const maxTimeInMinutes = rows.reduce((total, item) => total + item.runTime, 0); // The rows already store time in minutes

        const data = rows.map( row =>{
            return {...row, runTime: row.runTime * 60_000}
        })
        const program: Program = {
            name: programName,
            range,
            data, // Keep runTime in minutes in the UI
            maxTimeInMinutes,
            default: false,
            startFrequency: 3.1 // Adjust this as needed
        };

        try {
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
            const data = program.data.map( row =>{ console.log(">>>>>", row.runTime)
                return {...row, runTime: row.runTime / 60_000}
            })
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
                <label>
                    If this program is a range you must supply a start and an end frequency.  <br />
                    <input
                        type="checkbox"
                        checked={range}
                        onChange={(e) => setRange(e.target.checked)}
                    />&nbsp;&nbsp;This is a ranged program
                </label>
            </div>
            <div className='program-table'>
                <table className={range ? 'range' : ''} >
                    <thead>
                    <tr>
                        <th></th>
                        <th>Frequency in Hertz</th>
                        <th>{range ? 'Total run time':'Minutes per frequency'}</th>
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
                                    value={row.frequency ? row.frequency.toString() : ''}
                                    onChange={(e) => handleInputChange(index, 'frequency', e.target.value)}
                                    placeholder={range ? ( index === 0 ? 'Start Frequency':'End Frequency' ):'Frequency'}
                                />
                            </td>
                            <td>
                                <input className='time'
                                       type="text"
                                       value={row.runTime ? row.runTime.toString() : ''} // Time is now directly in minutes
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
                <button type="button" onClick={handleSave} disabled={isSaving}>Save</button>
            </div>
        </div>
    );
};

export default ProgramEditor;

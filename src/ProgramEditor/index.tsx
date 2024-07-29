import React, { useState, useEffect } from 'react';
import { ProgramItem } from '../types';

interface ProgramEditorProps {
    onSave: (programName: string, programData: ProgramItem[], programMaxTime: number, range: boolean) => void;
    onCancel: () => void;
}

const ProgramEditor: React.FC<ProgramEditorProps> = ({ onSave, onCancel }) => {
    const [programName, setProgramName] = useState('');
    const [range, setRange] = useState(false);
    const [rows, setRows] = useState([{ frequency: '', runTime: '' }]);

    useEffect(() => {
        if (range) {
            setRows([
                { frequency: '', runTime: '' },
                { frequency: '', runTime: '' },
            ]);
        } else {
            setRows([{ frequency: '', runTime: '' }]);
        }
    }, [range]);

    const handleAddRow = () => {
        if (!range) {
            setRows([...rows, { frequency: '', runTime: '' }]);
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
        newRows[index] = { ...newRows[index], [field]: value };
        setRows(newRows);
    };

    const handleSave = () => {
        // Implement save functionality here
        onSave(programName, rows, 0, range); // Adjust the parameters as needed
    };

    return (
        <div id="editor" className="tab-body editor">
            <div>
                <select>
                    <option value="">Choose existing or create a new Program</option>
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
                                    value={row.frequency}
                                    onChange={(e) => handleInputChange(index, 'frequency', e.target.value)}
                                />
                            </td>
                            <td>
                                <input
                                    type="text"
                                    value={row.runTime}
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

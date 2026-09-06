import React, { useState, useEffect, useCallback } from 'react';
import { Program , ProgramItem} from '../types';
import { useAppContext } from '../AppContext';
import { buildProgramsTsv, safeFileName, saveTextFile, openTextFiles, parseProgramsTsv, ExportableProgram } from '../util/exportPrograms';


interface ProgramEditorProps {
    onSave: (programName: string, programData: ProgramItem[], programMaxTime: number, range: boolean) => void;
    onCancel: () => void;
}


type EditRow = { channel: number; frequency: string; runTime: string; sweepTo?: string; wavetype: 'SINE' | 'SQUARE' };

const newRow = (): EditRow => ({ channel: 1, frequency: '', runTime: '', wavetype: 'SINE' });

const ProgramEditor: React.FC<ProgramEditorProps> = ({ onSave }) => {
    const [programName, setProgramName] = useState('');
    const [range, setRange] = useState(false);
    const [rows, setRows] = useState<EditRow[]>([newRow()]);
    const [customPrograms, setCustomPrograms] = useState<string[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [dragIndex, setDragIndex] = useState<number | null>(null);
    const [dropIndex, setDropIndex] = useState<number | null>(null);

    const { appDatabase } = useAppContext();

    const refreshCustomPrograms = useCallback(async () => {
        const programs = await appDatabase.getCustomPrograms();
        const programNames = programs
            .map(program => program.name)
            .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }));
        setCustomPrograms(programNames);
    }, [appDatabase]);

    useEffect(() => {
        void refreshCustomPrograms();
    }, [refreshCustomPrograms]);

    // Reset rows ONLY when the user explicitly toggles range — not when a loaded
    // program sets range (a `[range]` effect would clobber the freshly loaded rows,
    // wiping a saved ranged program on load).
    const handleRangeToggle = (checked: boolean) => {
        setRange(checked);
        setRows(checked ? [newRow(), newRow()] : [newRow()]);
    };

    const handleAddRow = () => {
        if (!range) {
            setRows([...rows, newRow()]);
        }
    };

    const handleDeleteRow = (index: number) => {
        if (!range) {
            const newRows = rows.filter((_, i) => i !== index);
            setRows(newRows);
        }
    };

    const handleInputChange = (index: number, field: 'frequency' | 'runTime', value: string) => {
        // Native number inputs already constrain to numeric; store the raw value.
        const newRows = [...rows];
        newRows[index] = { ...newRows[index], [field]: value } as EditRow;
        setRows(newRows);
    };

    const handleWavetypeChange = (index: number, value: 'SINE' | 'SQUARE') => {
        const newRows = [...rows];
        newRows[index] = { ...newRows[index], wavetype: value } as EditRow;
        setRows(newRows);
    };

    // Drag-to-reorder (non-range only). The handle is the drag source; each row
    // is a drop target. Reorder on drop, moving the dragged row before the target.
    const moveRow = (from: number, to: number) => {
        if (from === to) return;
        setRows(prev => {
            const moved = prev[from];
            if (!moved) return prev;
            const next = [...prev];
            next.splice(from, 1);
            next.splice(to, 0, moved);
            return next;
        });
    };

    const handleSave = async () => {
        if (isSaving) return;
        if (!programName.trim()) { alert('Please enter a program name.'); return; }
        if (rows.every(r => !r.frequency.trim())) { alert('Please enter at least one frequency.'); return; }
        // In sequence mode a trailing "+" row left blank is simply ignored; in range mode
        // both endpoints are required. Frequencies must be real numbers >= 0 Hz and every
        // kept row needs a dwell, otherwise the runner would emit 0 Hz DC steps or a 1 ms
        // sweep (maxTimeInMinutes 0).
        const keptRows = range ? rows : rows.filter(r => r.frequency.trim() !== '');
        const badFrequency = keptRows.find(r => !(Number.isFinite(parseFloat(r.frequency)) && parseFloat(r.frequency) >= 0));
        if (badFrequency) { alert(range ? 'A range needs a start and an end frequency (numbers, 0 Hz or more).' : 'Frequencies must be numbers of 0 Hz or more.'); return; }
        const dwellRows = range ? keptRows.slice(0, 1) : keptRows;
        if (dwellRows.some(r => !(parseFloat(r.runTime) > 0))) { alert('Each frequency needs a run time greater than 0 minutes.'); return; }
        // The generator reliably accepts a new frequency about every 50 ms. A sweep asking
        // for more steps than that leaves the device dropping most of them: it still ends
        // on the right frequency, but the patient never receives the ones in between.
        if (range && keptRows.length >= 2) {
            const from = parseFloat(keptRows[0]?.frequency ?? '0');
            const to = parseFloat(keptRows[1]?.frequency ?? '0');
            const minutes = parseFloat(keptRows[0]?.runTime ?? '0');
            const steps = Math.abs(to - from) + 1;
            const msPerStep = (minutes * 60_000) / steps;
            if (msPerStep < 50) {
                const willRun = Math.floor((minutes * 60_000) / 50);
                const ok = window.confirm(
                    `This sweep asks for ${steps.toLocaleString()} steps in ${minutes} minutes, ` +
                    `about ${msPerStep.toFixed(0)} ms each.\n\n` +
                    `The generator only accepts a new frequency every 50 ms, so it will emit ` +
                    `roughly ${willRun.toLocaleString()} of them and skip the rest. It will still ` +
                    `finish on the right frequency.\n\nSave anyway?`);
                if (!ok) { return; }
            }
        }
        setIsSaving(true);

        try {
            const validatedRows: ProgramItem[] = keptRows.map(row => ({
                channel: row.channel,
                frequency: parseFloat(row.frequency) || 0,
                runTime: (parseFloat(row.runTime) || 0) * 60_000,
                wavetype: row.wavetype,
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

            // Refresh the "edit a saved program" list so a newly saved name appears.
            await refreshCustomPrograms();
            onSave(programName, validatedRows, maxTimeInMinutes, range);
        } catch (error) {
            console.error('Error saving program:', error);
        } finally {
            setIsSaving(false);
        }
    };

    // Build an exportable program from the current on-screen rows, so Export
    // reflects exactly what's in the editor (including unsaved edits).
    const currentEditorProgram = (): ExportableProgram => ({
        name: programName.trim(),
        range,
        data: rows.map(row => ({
            frequency: parseFloat(row.frequency) || 0,
            runTime: (parseFloat(row.runTime) || 0) * 60_000,
            wavetype: row.wavetype,
            ...(row.sweepTo ? { sweepTo: parseFloat(row.sweepTo) } : {}),
        })),
    });

    const handleExportCurrent = async () => {
        const name = programName.trim();
        if (!name) { alert('Enter or choose a program name to export.'); return; }
        try {
            const tsv = buildProgramsTsv([currentEditorProgram()]);
            await saveTextFile(`${safeFileName(name)}.tsv`, tsv);
        } catch (error) {
            console.error('Failed to export program:', error);
        }
    };

    const handleExportAll = async () => {
        try {
            const programs = await appDatabase.getCustomPrograms();
            if (!programs.length) { alert('No custom programs to export.'); return; }
            const tsv = buildProgramsTsv(programs);
            await saveTextFile('custom-programs.tsv', tsv);
        } catch (error) {
            console.error('Failed to export programs:', error);
        }
    };

    // Import one or more custom programs from exported TSV file(s). Each program in
    // the file(s) is saved to the custom-program store (overwriting a same-named
    // custom program); the last one is loaded into the editor.
    const handleImport = async () => {
        if (isImporting) return;
        setIsImporting(true);
        try {
            const files = await openTextFiles();
            if (!files.length) return; // cancelled
            const parsed = files.flatMap((f) => parseProgramsTsv(f.content));
            if (!parsed.length) {
                alert('No programs found. Expected the exported TSV format (Program, Range, Frequency, Minutes, Waveform, SweepTo).');
                return;
            }

            const failures: string[] = [];
            let saved = 0;
            for (const prog of parsed) {
                try {
                    await appDatabase.saveData(prog);
                    saved++;
                } catch (e) {
                    failures.push(`${prog.name}: ${e instanceof Error ? e.message : String(e)}`);
                }
            }

            await refreshCustomPrograms();
            const last = parsed[parsed.length - 1];
            if (last) await handleLoadProgram(last.name);

            const names = parsed.map((p) => p.name).join(', ');
            alert(
                failures.length
                    ? `Imported ${saved} program(s): ${names}\n\n${failures.length} failed:\n${failures.join('\n')}`
                    : `Imported ${saved} program(s): ${names}`
            );
        } catch (error) {
            console.error('Failed to import programs:', error);
            alert('Import failed. See console for details.');
        } finally {
            setIsImporting(false);
        }
    };

    const handleLoadProgram = async (programName: string) => {
        const program = await appDatabase.loadData(programName);
        if (program) {
            const data: EditRow[] = program.data.map(row => ({
                channel: row.channel,
                frequency: String(row.frequency),
                runTime: String(row.runTime / 60_000),
                wavetype: row.wavetype ?? (program.channel1wavetype === 'SQUARE' ? 'SQUARE' : 'SINE'),
                ...(row.sweepTo != null ? { sweepTo: String(row.sweepTo) } : {}),
            }));

            setProgramName(programName);
            setRange(Boolean(program.range));
            setRows(data);
        }
    };

    // One combined field: typing a name creates a new program; choosing (or typing)
    // the exact name of a saved program loads it for editing.
    const handleProgramNameChange = (value: string) => {
        setProgramName(value);
        if (customPrograms.includes(value)) {
            void handleLoadProgram(value);
        }
    };

    return (
        <div id="editor" className="tab-body program-editor">
            <div className="pe-top">
                <div className="pe-field">
                    <span className="pe-label">Program name</span>
                    <div className="pe-namerow">
                        <input
                            className="pe-input"
                            type="text"
                            autoComplete="off"
                            placeholder="Enter a program name"
                            value={programName}
                            onChange={(e) => handleProgramNameChange(e.target.value)}
                        />
                        <button type="button" className="pe-save" onClick={handleSave} disabled={isSaving}>
                            {isSaving ? 'Saving…' : 'Save program'}
                        </button>
                        <button type="button" className="pe-export" onClick={handleExportCurrent} title="Export this program as a TSV text file">
                            Export
                        </button>
                        <button type="button" className="pe-export" onClick={handleExportAll} title="Export all custom programs as one TSV text file">
                            Export all
                        </button>
                        <button type="button" className="pe-export" onClick={handleImport} disabled={isImporting} title="Import one or more custom programs from exported TSV file(s)">
                            {isImporting ? 'Importing…' : 'Import'}
                        </button>
                    </div>
                    <div className="pe-loadrow">
                        <span className="pe-label">Edit a saved program</span>
                        <select
                            className="pe-loadselect"
                            value={customPrograms.includes(programName) ? programName : ''}
                            onChange={(e) => { const v = e.target.value; if (v) void handleLoadProgram(v); }}
                        >
                            <option value="">Choose a saved program…</option>
                            {customPrograms.map(name => (
                                <option key={name} value={name}>{name}</option>
                            ))}
                        </select>
                        <button
                            type="button"
                            className="pe-new"
                            onClick={() => { setProgramName(''); setRange(false); setRows([newRow()]); }}
                            title="Clear the form to start a new program"
                        >
                            New
                        </button>
                    </div>
                    <span className="pe-fieldhint">
                        Type a name to create a new program, or pick a saved program to edit it. Choosing another
                        program from the list switches to it.
                    </span>
                </div>
            </div>

            <div className="pe-rangebar">
                <label className="pe-switch">
                    <input
                        type="checkbox"
                        checked={range}
                        onChange={(e) => handleRangeToggle(e.target.checked)}
                    />
                    <span className="pe-switch__track"><span className="pe-switch__thumb" /></span>
                    <span className="pe-switch__label">Ranged program</span>
                </label>
                <p className="pe-hint">
                    {range
                        ? 'Sweeps from a start frequency to an end frequency over the total run time.'
                        : 'One row per frequency. Max 400 frequency adjustments per minute. Drag the handle to reorder.'}
                </p>
            </div>

            <div className="pe-grid">
                <div className="pe-grid__head">
                    <span className="pe-c-handle" aria-hidden="true" />
                    <span className="pe-c-freq">Frequency (Hz)</span>
                    <span className="pe-c-time">{range ? 'Total run time (min)' : 'Minutes per frequency'}</span>
                    <span className="pe-c-wave">Waveform</span>
                    <span className="pe-c-act" aria-hidden="true" />
                </div>

                {rows.map((row, index) => {
                    const showTime = !range || index === 0;
                    const draggable = !range && rows.length > 1;
                    return (
                        <div
                            className={`pe-grid__row${dragIndex === index ? ' is-dragging' : ''}${dropIndex === index && dragIndex !== index ? ' is-dropTarget' : ''}`}
                            key={index}
                            onDragOver={draggable ? (e) => { e.preventDefault(); if (dropIndex !== index) setDropIndex(index); } : undefined}
                            onDrop={draggable ? (e) => {
                                e.preventDefault();
                                if (dragIndex !== null) moveRow(dragIndex, index);
                                setDragIndex(null);
                                setDropIndex(null);
                            } : undefined}
                        >
                            <span
                                className="pe-c-handle"
                                title={draggable ? 'Drag to reorder' : undefined}
                                aria-hidden="true"
                                draggable={draggable}
                                onDragStart={draggable ? (e) => { setDragIndex(index); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(index)); } : undefined}
                                onDragEnd={() => { setDragIndex(null); setDropIndex(null); }}
                            >⠿</span>

                            <input
                                className="pe-num pe-c-freq"
                                type="number"
                                inputMode="decimal"
                                min="0"
                                step="any"
                                value={row.frequency}
                                onChange={(e) => handleInputChange(index, 'frequency', e.target.value)}
                                placeholder={range ? (index === 0 ? 'Start Frequency' : 'End Frequency') : 'Frequency'}
                            />

                            {showTime ? (
                                <input
                                    className="pe-num pe-c-time"
                                    type="number"
                                    inputMode="decimal"
                                    min="0"
                                    step="any"
                                    value={row.runTime}
                                    onChange={(e) => handleInputChange(index, 'runTime', e.target.value)}
                                    placeholder="Time in minutes"
                                />
                            ) : (
                                <span className="pe-c-time pe-c-time--empty" aria-hidden="true" />
                            )}

                            <div className="pe-seg pe-c-wave" role="group" aria-label={`Waveform for frequency ${index + 1}`}>
                                <button
                                    type="button"
                                    className={row.wavetype === 'SINE' ? 'is-active' : ''}
                                    aria-pressed={row.wavetype === 'SINE'}
                                    onClick={() => handleWavetypeChange(index, 'SINE')}
                                >Sine</button>
                                <button
                                    type="button"
                                    className={row.wavetype === 'SQUARE' ? 'is-active' : ''}
                                    aria-pressed={row.wavetype === 'SQUARE'}
                                    onClick={() => handleWavetypeChange(index, 'SQUARE')}
                                >Square</button>
                            </div>

                            <span className="pe-c-act">
                                {!range && (index === rows.length - 1 ? (
                                    <button
                                        type="button"
                                        className="pe-add"
                                        title="Add frequency"
                                        aria-label="Add frequency"
                                        onClick={handleAddRow}
                                    >+</button>
                                ) : (
                                    <button
                                        type="button"
                                        className="pe-del"
                                        title="Remove frequency"
                                        aria-label={`Remove frequency ${index + 1}`}
                                        onClick={() => handleDeleteRow(index)}
                                    >×</button>
                                ))}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default ProgramEditor;

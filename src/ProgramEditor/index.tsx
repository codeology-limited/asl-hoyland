import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Program, ProgramItem } from '../types';
import { useAppContext } from '../AppContext';
import ConfirmModal from '../components/ConfirmModal';

interface ProgramEditorProps {
    onSave: (programName: string, programData: ProgramItem[], programMaxTime: number, range: boolean) => void;
    onCancel: () => void;
}

type EditRow = { channel: number; frequency: string; runTime: string; sweepTo?: string };
type ProgramOption = { name: string; minutes: number };

// Device/protocol cap on frequency (Hz). The FY6600 cannot accept values above this.
const MAX_FREQUENCY_HZ = 9_999_999;

const emptyRow = (): EditRow => ({ channel: 1, frequency: '', runTime: '' });

// Accept a number or at most one decimal point (keystroke filter).
const NUMERIC = /^(\d+\.?\d*|\.\d*)$/;

const fmtDuration = (minutes: number): string => {
    if (!Number.isFinite(minutes) || minutes <= 0) return '0 min';
    const totalSeconds = Math.round(minutes * 60);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    if (m === 0) return `${s} sec`;
    if (s === 0) return `${m} min`;
    return `${m} min ${s} sec`;
};

type ValidationResult = { message: string; key: string | null };

const ProgramEditor: React.FC<ProgramEditorProps> = ({ onSave, onCancel }) => {
    const [programName, setProgramName] = useState('');
    const [range, setRange] = useState(false);
    const [rows, setRows] = useState<EditRow[]>([emptyRow()]);
    const [customPrograms, setCustomPrograms] = useState<ProgramOption[]>([]);
    const [loadedName, setLoadedName] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    const [invalidKey, setInvalidKey] = useState<string | null>(null);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    const { appDatabase } = useAppContext();

    const refreshCustomPrograms = useCallback(async () => {
        try {
            const programs = await appDatabase.getCustomPrograms();
            setCustomPrograms(programs.map((p) => ({ name: p.name, minutes: Number(p.maxTimeInMinutes) || 0 })));
        } catch (error) {
            console.error('Failed to load custom programs:', error);
        }
    }, [appDatabase]);

    useEffect(() => {
        refreshCustomPrograms();
    }, [refreshCustomPrograms]);

    const clearFeedback = () => {
        setErrorMessage('');
        setSuccessMessage('');
        setInvalidKey(null);
    };

    const resetEditor = () => {
        setProgramName('');
        setLoadedName('');
        setRange(false);
        setRows([emptyRow()]);
        clearFeedback();
    };

    // NOTE: we deliberately reset rows inside the toggle handler rather than in a
    // useEffect([range]) — the old effect fired AFTER handleLoadProgram set its rows,
    // wiping a loaded program's frequencies whenever its range flag changed.
    const handleRangeToggle = (checked: boolean) => {
        setRange(checked);
        setRows(checked ? [emptyRow(), emptyRow()] : [emptyRow()]);
        clearFeedback();
    };

    const handleAddRow = () => {
        if (!range) setRows((r) => [...r, emptyRow()]);
        clearFeedback();
    };

    const handleDeleteRow = (index: number) => {
        if (!range && rows.length > 1) setRows((r) => r.filter((_, i) => i !== index));
        clearFeedback();
    };

    const moveRow = (index: number, dir: -1 | 1) => {
        if (range) return;
        setRows((r) => {
            const j = index + dir;
            if (j < 0 || j >= r.length) return r;
            const copy = r.slice();
            const tmp = copy[index]!;
            copy[index] = copy[j]!;
            copy[j] = tmp;
            return copy;
        });
        clearFeedback();
    };

    const handleInputChange = (index: number, field: 'frequency' | 'runTime' | 'sweepTo', value: string) => {
        if (value === '' || NUMERIC.test(value)) {
            setRows((r) => {
                const copy = r.slice();
                copy[index] = { ...copy[index], [field]: value } as EditRow;
                return copy;
            });
            if (errorMessage || successMessage) clearFeedback();
        }
    };

    // Live program summary.
    const totalMinutes = useMemo(() => {
        if (range) return parseFloat(rows[0]?.runTime ?? '') || 0;
        return rows.reduce((sum, r) => sum + (parseFloat(r.runTime) || 0), 0);
    }, [rows, range]);
    const stepCount = range ? 1 : rows.length;

    // Up-front validation. Safety-critical: frequency/runTime drive output applied to a human body.
    const validateRows = (): ValidationResult => {
        const cap = `${MAX_FREQUENCY_HZ.toLocaleString()} Hz`;
        if (range) {
            const startRow = rows[0];
            const endRow = rows[1];
            if (rows.length !== 2 || !startRow || !endRow) {
                return { message: 'A ranged program must have exactly a start and an end frequency.', key: 'range-start' };
            }
            const start = parseFloat(startRow.frequency);
            const end = parseFloat(endRow.frequency);
            if (!Number.isFinite(start) || start <= 0) return { message: 'Range start and end frequencies must be positive numbers.', key: 'range-start' };
            if (!Number.isFinite(end) || end <= 0) return { message: 'Range start and end frequencies must be positive numbers.', key: 'range-end' };
            if (start === end) return { message: 'Range start and end frequencies must be different.', key: 'range-end' };
            if (start > MAX_FREQUENCY_HZ) return { message: `Frequency must not exceed ${cap}.`, key: 'range-start' };
            if (end > MAX_FREQUENCY_HZ) return { message: `Frequency must not exceed ${cap}.`, key: 'range-end' };
            const runTime = parseFloat(startRow.runTime);
            if (!Number.isFinite(runTime) || runTime <= 0) return { message: 'Total run time must be greater than zero.', key: 'range-time' };
            return { message: '', key: null };
        }

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            if (!row) continue;
            const freq = parseFloat(row.frequency);
            const runTime = parseFloat(row.runTime);
            const rowLabel = rows.length > 1 ? `Row ${i + 1}: ` : '';

            if (!Number.isFinite(freq) || freq <= 0) return { message: `${rowLabel}frequency must be a positive number.`, key: `${i}-frequency` };
            if (freq > MAX_FREQUENCY_HZ) return { message: `${rowLabel}frequency must not exceed ${cap}.`, key: `${i}-frequency` };
            if (!Number.isFinite(runTime) || runTime <= 0) return { message: `${rowLabel}minutes per frequency must be greater than zero.`, key: `${i}-runTime` };
            if (row.sweepTo !== undefined && row.sweepTo !== '') {
                const sweepTo = parseFloat(row.sweepTo);
                if (!Number.isFinite(sweepTo) || sweepTo <= 0) return { message: `${rowLabel}sweep-to frequency must be a positive number.`, key: `${i}-sweepTo` };
                if (sweepTo > MAX_FREQUENCY_HZ) return { message: `${rowLabel}sweep-to frequency must not exceed ${cap}.`, key: `${i}-sweepTo` };
            }
        }
        return { message: '', key: null };
    };

    const handleSave = async () => {
        if (isSaving) return;
        setSuccessMessage('');
        if (!programName.trim()) {
            setErrorMessage('Please enter a program name.');
            setInvalidKey('name');
            return;
        }
        const { message, key } = validateRows();
        if (message) {
            setErrorMessage(message);
            setInvalidKey(key);
            return;
        }
        clearFeedback();
        setIsSaving(true);

        try {
            const validatedRows: ProgramItem[] = rows.map((row) => ({
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

            await appDatabase.saveData(program);
            await refreshCustomPrograms();
            setLoadedName(program.name);
            setSuccessMessage(`Saved “${program.name}”.`);
            onSave(programName, validatedRows, maxTimeInMinutes, range);
        } catch (error) {
            console.error('Error saving program:', error);
            setErrorMessage(error instanceof Error ? error.message : 'Failed to save program.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleLoadProgram = async (name: string) => {
        clearFeedback();
        if (!name) {
            resetEditor();
            return;
        }
        try {
            const program = await appDatabase.loadData(name);
            if (!program) return;
            const data: EditRow[] = program.data.map((row) => ({
                channel: row.channel,
                frequency: String(row.frequency),
                runTime: String(row.runTime / 60_000),
                ...(row.sweepTo != null ? { sweepTo: String(row.sweepTo) } : {}),
            }));
            setProgramName(name);
            setLoadedName(name);
            setRange(Boolean(program.range));
            setRows(data.length ? data : [emptyRow()]);
        } catch (error) {
            console.error('Failed to load program:', error);
            setErrorMessage('Failed to load that program.');
        }
    };

    const handleDuplicate = () => {
        // Detach from the loaded program so the next Save creates a new one.
        setLoadedName('');
        setProgramName((name) => (name.trim() ? `${name.trim()} copy` : 'copy'));
        clearFeedback();
    };

    const confirmDelete = async () => {
        setShowDeleteConfirm(false);
        if (!loadedName) return;
        const deleted = loadedName;
        try {
            await appDatabase.deleteData(deleted);
            await refreshCustomPrograms();
            setProgramName('');
            setLoadedName('');
            setRange(false);
            setRows([emptyRow()]);
            setInvalidKey(null);
            setErrorMessage('');
            setSuccessMessage(`Deleted “${deleted}”.`);
        } catch (error) {
            console.error('Failed to delete program:', error);
            setErrorMessage(error instanceof Error ? error.message : 'Failed to delete program.');
        }
    };

    const errClass = (key: string) => (invalidKey === key ? 'ed-input input-error' : 'ed-input');
    const nameChanged = Boolean(loadedName) && programName.trim() !== loadedName;

    return (
        <>
        <div id="editor" className="tab-body editor editor-v2">
            <div className="ed-section ed-load-row">
                <label className="ed-field">
                    <span className="ed-label">Load a saved program</span>
                    <select className="ed-input" value={loadedName} onChange={(e) => handleLoadProgram(e.target.value)}>
                        <option value="">＋ New program</option>
                        {customPrograms.map(({ name, minutes }) => (
                            <option key={name} value={name}>
                                {name} ({fmtDuration(minutes)})
                            </option>
                        ))}
                    </select>
                </label>
                {loadedName && (
                    <button type="button" className="ed-btn ed-btn-ghost" onClick={resetEditor}>
                        ＋ New
                    </button>
                )}
            </div>

            <div className="ed-section">
                <label className="ed-field">
                    <span className="ed-label">Program name</span>
                    <input
                        type="text"
                        className={errClass('name')}
                        placeholder="Enter program name"
                        value={programName}
                        onChange={(e) => {
                            setProgramName(e.target.value);
                            if (errorMessage || successMessage) clearFeedback();
                        }}
                    />
                </label>
                {nameChanged && (
                    <p className="ed-hint ed-hint-warn">
                        The name differs from “{loadedName}” — saving will create a new program and keep the original.
                    </p>
                )}
            </div>

            <div className="ed-section">
                <label className="ed-check">
                    <input type="checkbox" checked={range} onChange={(e) => handleRangeToggle(e.target.checked)} />
                    <span>Ranged sweep program</span>
                </label>
                <p className="ed-hint">
                    {range
                        ? 'Sweeps continuously from the start frequency to the end frequency over the total run time. Supply both frequencies and a total time.'
                        : 'A list of discrete frequencies, each held for its own duration. Tick this only for a continuous start→end sweep.'}
                </p>
            </div>

            {range ? (
                <div className="ed-section ed-range">
                    <label className="ed-field">
                        <span className="ed-label">Start frequency (Hz)</span>
                        <input
                            type="text"
                            inputMode="decimal"
                            className={errClass('range-start')}
                            placeholder="Start Frequency"
                            aria-label="Start frequency in Hertz"
                            value={rows[0]?.frequency ?? ''}
                            onChange={(e) => handleInputChange(0, 'frequency', e.target.value)}
                        />
                    </label>
                    <label className="ed-field">
                        <span className="ed-label">End frequency (Hz)</span>
                        <input
                            type="text"
                            inputMode="decimal"
                            className={errClass('range-end')}
                            placeholder="End Frequency"
                            aria-label="End frequency in Hertz"
                            value={rows[1]?.frequency ?? ''}
                            onChange={(e) => handleInputChange(1, 'frequency', e.target.value)}
                        />
                    </label>
                    <label className="ed-field">
                        <span className="ed-label">Total run time (minutes)</span>
                        <input
                            type="text"
                            inputMode="decimal"
                            className={errClass('range-time')}
                            placeholder="Time in minutes"
                            aria-label="Total run time in minutes"
                            value={rows[0]?.runTime ?? ''}
                            onChange={(e) => handleInputChange(0, 'runTime', e.target.value)}
                        />
                    </label>
                </div>
            ) : (
                <div className="ed-section">
                    <div className="ed-row ed-row-head" aria-hidden="true">
                        <span className="ed-col-num">#</span>
                        <span>Frequency (Hz)</span>
                        <span>Sweep to (Hz, optional)</span>
                        <span>Minutes</span>
                        <span className="ed-col-actions" />
                    </div>
                    {rows.map((row, index) => (
                        <div className="ed-row" key={index}>
                            <span className="ed-col-num">{index + 1}</span>
                            <input
                                type="text"
                                inputMode="decimal"
                                className={errClass(`${index}-frequency`)}
                                value={row.frequency}
                                onChange={(e) => handleInputChange(index, 'frequency', e.target.value)}
                                placeholder="Frequency"
                                aria-label={`Frequency in Hertz for step ${index + 1}`}
                            />
                            <input
                                type="text"
                                inputMode="decimal"
                                className={errClass(`${index}-sweepTo`)}
                                value={row.sweepTo ?? ''}
                                onChange={(e) => handleInputChange(index, 'sweepTo', e.target.value)}
                                placeholder="Sweep to Hz"
                                aria-label={`Sweep-to frequency for step ${index + 1} (optional)`}
                            />
                            <input
                                type="text"
                                inputMode="decimal"
                                className={errClass(`${index}-runTime`)}
                                value={row.runTime}
                                onChange={(e) => handleInputChange(index, 'runTime', e.target.value)}
                                placeholder="Time in minutes"
                                aria-label={`Minutes for step ${index + 1}`}
                            />
                            <span className="ed-col-actions">
                                <button
                                    type="button"
                                    className="ed-icon-btn"
                                    onClick={() => moveRow(index, -1)}
                                    disabled={index === 0}
                                    aria-label={`Move step ${index + 1} up`}
                                    title="Move up"
                                >
                                    ↑
                                </button>
                                <button
                                    type="button"
                                    className="ed-icon-btn"
                                    onClick={() => moveRow(index, 1)}
                                    disabled={index === rows.length - 1}
                                    aria-label={`Move step ${index + 1} down`}
                                    title="Move down"
                                >
                                    ↓
                                </button>
                                <button
                                    type="button"
                                    className="ed-icon-btn ed-icon-danger"
                                    onClick={() => handleDeleteRow(index)}
                                    disabled={rows.length === 1}
                                    aria-label={`Remove step ${index + 1}`}
                                    title="Remove frequency"
                                >
                                    ✕
                                </button>
                            </span>
                            {row.sweepTo && parseFloat(row.sweepTo) > 0 && parseFloat(row.frequency) > 0 && (
                                <span className="ed-sweep-hint">
                                    sweeps {row.frequency} → {row.sweepTo} Hz over {row.runTime || '0'} min
                                </span>
                            )}
                        </div>
                    ))}
                    <button type="button" className="ed-btn ed-btn-add" onClick={handleAddRow}>
                        ＋ Add frequency
                    </button>
                </div>
            )}

            <div className="ed-summary" aria-live="polite" data-testid="editor-summary">
                Total: <strong>{fmtDuration(totalMinutes)}</strong> across <strong>{stepCount}</strong>{' '}
                {range ? 'sweep' : stepCount === 1 ? 'frequency' : 'frequencies'}
            </div>

            {errorMessage && (
                <div className="editor-error ed-banner ed-banner-error" role="alert">
                    {errorMessage}
                </div>
            )}
            {successMessage && (
                <div className="ed-banner ed-banner-success" role="status">
                    {successMessage}
                </div>
            )}

            <div className="ed-actions">
                <button type="button" className="ed-btn ed-btn-primary" onClick={handleSave} disabled={isSaving}>
                    {isSaving ? 'Saving…' : loadedName && !nameChanged ? 'Update program' : 'Save program'}
                </button>
                {loadedName && (
                    <button type="button" className="ed-btn" onClick={handleDuplicate}>
                        Save as copy
                    </button>
                )}
                {loadedName && (
                    <button type="button" className="ed-btn ed-btn-danger" onClick={() => setShowDeleteConfirm(true)}>
                        Delete
                    </button>
                )}
                <button
                    type="button"
                    className="ed-btn ed-btn-ghost"
                    onClick={() => {
                        resetEditor();
                        onCancel();
                    }}
                >
                    Clear
                </button>
            </div>

        </div>
            <ConfirmModal
                open={showDeleteConfirm}
                title={`Delete “${loadedName}”?`}
                message="This permanently removes the custom program. This cannot be undone."
                onYes={confirmDelete}
                onNo={() => setShowDeleteConfirm(false)}
            />
        </>
    );
};

export default ProgramEditor;

// Export custom programs as tab-separated-values (TSV) text.
//
// TSV (not CSV) so program names and values never need comma-escaping and the
// file pastes straight into Excel / Google Sheets. One row per frequency step,
// with a leading Program column so "export all" is a single tidy table and
// "export this one" is the same shape filtered to a single program.

const asBool = (v: unknown) => !!Number(v);

const num = (v: unknown, fallback = 0): number => {
    if (v === null || v === undefined) return fallback;
    const n = typeof v === 'string' ? parseFloat(v) : Number(v);
    return Number.isFinite(n) ? n : fallback;
};

// Minutes with FP noise tamed; integers print clean (e.g. 5 not 5.000001).
const msToMinutes = (ms: unknown): string => {
    const mins = num(ms, 0) / 60_000;
    return String(+mins.toFixed(6));
};

/** Minimal shape needed for export — ProgramRow satisfies this. */
export interface ExportableProgram {
    name: string;
    range?: number | boolean;
    data: { frequency: number | string; runTime: number; wavetype?: string; sweepTo?: number | string }[];
}

const TSV_HEADER = ['Program', 'Range', 'Frequency (Hz)', 'Minutes', 'Waveform', 'SweepTo (Hz)'];

/** Build a TSV document (header + one row per data item) for the given programs. */
export function buildProgramsTsv(programs: ExportableProgram[]): string {
    const lines: string[] = [TSV_HEADER.join('\t')];

    for (const program of programs) {
        const rangeText = asBool(program.range) ? 'yes' : 'no';
        for (const item of program.data ?? []) {
            const waveform = item.wavetype ?? '';
            const sweepTo = item.sweepTo === undefined || item.sweepTo === null ? '' : String(item.sweepTo);
            lines.push([
                program.name,
                rangeText,
                String(item.frequency),
                msToMinutes(item.runTime),
                waveform,
                sweepTo,
            ].join('\t'));
        }
    }

    return lines.join('\n') + '\n';
}

/** A program parsed back from a TSV file, shaped for AppDatabase.saveData. */
export interface ImportedProgram {
    name: string;
    range: boolean;
    data: { channel: number; frequency: number; runTime: number; wavetype?: 'SINE' | 'SQUARE'; sweepTo?: number }[];
    maxTimeInMinutes: number;
    default: boolean;
    startFrequency: number;
}

/**
 * Parse a TSV document (as produced by buildProgramsTsv) back into one or more
 * programs, grouped by the leading Program column. Inverse of buildProgramsTsv.
 * Lenient: skips a header row if present, ignores blank/malformed lines, and
 * accepts tab- or comma-separated columns so a sheet exported as CSV still loads.
 */
export function parseProgramsTsv(text: string): ImportedProgram[] {
    const rawLines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (!rawLines.length) return [];

    const splitCols = (line = '') => (line.includes('\t') ? line.split('\t') : line.split(','));

    // Skip a header row (first cell is literally "Program").
    let start = 0;
    if ((splitCols(rawLines[0])[0] ?? '').trim().toLowerCase() === 'program') start = 1;

    const byName = new Map<string, ImportedProgram>();
    const order: string[] = [];

    for (let i = start; i < rawLines.length; i++) {
        const cols = splitCols(rawLines[i]);
        const name = (cols[0] ?? '').trim();
        const frequency = num(cols[2], NaN);
        if (!name || !Number.isFinite(frequency)) continue; // skip rows with no name/frequency

        const rangeYes = (cols[1] ?? '').trim().toLowerCase() === 'yes';
        const minutes = num(cols[3], 0);
        const waveRaw = (cols[4] ?? '').trim().toUpperCase();
        const wavetype = waveRaw === 'SINE' || waveRaw === 'SQUARE' ? (waveRaw as 'SINE' | 'SQUARE') : undefined;
        const sweepRaw = (cols[5] ?? '').trim();
        const sweepTo = sweepRaw ? num(sweepRaw, NaN) : NaN;

        if (!byName.has(name)) {
            byName.set(name, { name, range: false, data: [], maxTimeInMinutes: 0, default: false, startFrequency: 0 });
            order.push(name);
        }
        const prog = byName.get(name)!;
        if (rangeYes) prog.range = true; // any ranged row marks the whole program ranged
        const item: ImportedProgram['data'][number] = { channel: 1, frequency, runTime: minutes * 60_000 };
        if (wavetype) item.wavetype = wavetype;
        if (Number.isFinite(sweepTo)) item.sweepTo = sweepTo;
        prog.data.push(item);
    }

    const programs = order.map((n) => byName.get(n)!);
    for (const p of programs) p.maxTimeInMinutes = p.data.reduce((t, it) => t + it.runTime / 60_000, 0);
    return programs.filter((p) => p.data.length > 0);
}

/**
 * Open one or more text files and return their contents. Uses the Tauri native
 * open dialog (multi-select) in the app; falls back to a hidden file input in the
 * browser/dev environment. Resolves to [] if the user cancels.
 */
export async function openTextFiles(): Promise<{ name: string; content: string }[]> {
    const inTauri = typeof window !== 'undefined' && '__TAURI_IPC__' in window;
    if (inTauri) {
        try {
            const { open } = await import('@tauri-apps/api/dialog');
            const { readTextFile } = await import('@tauri-apps/api/fs');
            const selected = await open({
                multiple: true,
                filters: [{ name: 'Programs', extensions: ['tsv', 'txt', 'csv'] }],
            });
            if (!selected) return [];
            const paths = Array.isArray(selected) ? selected : [selected];
            const out: { name: string; content: string }[] = [];
            for (const p of paths) {
                const content = await readTextFile(p as string);
                out.push({ name: (p as string).split(/[\\/]/).pop() || 'import', content });
            }
            return out;
        } catch (err) {
            console.error('Tauri open failed, falling back to browser file input:', err);
        }
    }

    return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.tsv,.txt,.csv,text/plain,text/tab-separated-values';
        input.multiple = true;
        input.onchange = async () => {
            const files = Array.from(input.files ?? []);
            const out = await Promise.all(files.map(async (f) => ({ name: f.name, content: await f.text() })));
            resolve(out);
        };
        // Some browsers fire 'cancel' when the picker is dismissed with no selection.
        input.oncancel = () => resolve([]);
        input.click();
    });
}

/** Sanitise a program name into a safe file-name stem. */
export function safeFileName(name: string): string {
    const stem = (name || 'program').trim().replace(/[^a-z0-9._-]+/gi, '_').replace(/^_+|_+$/g, '');
    return stem || 'program';
}

/**
 * Save text to a file. Uses the Tauri native save dialog when running in the
 * app; falls back to a browser download (also what the test/dev environment
 * exercises) when Tauri isn't present.
 */
export async function saveTextFile(defaultFileName: string, content: string): Promise<void> {
    const inTauri = typeof window !== 'undefined' && '__TAURI_IPC__' in window;
    if (inTauri) {
        try {
            const { save } = await import('@tauri-apps/api/dialog');
            const { writeTextFile } = await import('@tauri-apps/api/fs');
            const filePath = await save({
                defaultPath: defaultFileName,
                filters: [{ name: 'Text', extensions: ['tsv', 'txt'] }],
            });
            if (filePath) await writeTextFile(filePath as string, content);
            return;
        } catch (err) {
            console.error('Tauri save failed, falling back to browser download:', err);
        }
    }

    const blob = new Blob([content], { type: 'text/tab-separated-values' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = defaultFileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

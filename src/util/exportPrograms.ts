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

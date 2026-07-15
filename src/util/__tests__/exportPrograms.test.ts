import { describe, it, expect } from 'vitest';
import { buildProgramsTsv, safeFileName, ExportableProgram } from '../exportPrograms';

describe('buildProgramsTsv', () => {
    it('emits a header and one tab-separated row per data item', () => {
        const programs: ExportableProgram[] = [
            {
                name: 'MyProg',
                range: 0,
                data: [
                    { frequency: 528, runTime: 300_000, wavetype: 'SINE' },
                    { frequency: 741, runTime: 60_000, wavetype: 'SQUARE' },
                ],
            },
        ];

        const tsv = buildProgramsTsv(programs);
        const lines = tsv.replace(/\n$/, '').split('\n');

        expect(lines[0]).toBe('Program\tRange\tFrequency (Hz)\tMinutes\tWaveform\tSweepTo (Hz)');
        expect(lines[1]).toBe('MyProg\tno\t528\t5\tSINE\t');
        expect(lines[2]).toBe('MyProg\tno\t741\t1\tSQUARE\t');
    });

    it('marks ranged programs and includes sweepTo when present', () => {
        const programs: ExportableProgram[] = [
            {
                name: 'Sweep',
                range: 1,
                data: [
                    { frequency: 100, runTime: 600_000, wavetype: 'SINE', sweepTo: 500 },
                    { frequency: 500, runTime: 0, wavetype: 'SINE' },
                ],
            },
        ];

        const lines = buildProgramsTsv(programs).replace(/\n$/, '').split('\n');
        expect(lines[1]).toBe('Sweep\tyes\t100\t10\tSINE\t500');
        expect(lines[2]).toBe('Sweep\tyes\t500\t0\tSINE\t');
    });

    it('stacks multiple programs under one header (export all)', () => {
        const programs: ExportableProgram[] = [
            { name: 'A', range: 0, data: [{ frequency: 10, runTime: 60_000, wavetype: 'SINE' }] },
            { name: 'B', range: 0, data: [{ frequency: 20, runTime: 60_000, wavetype: 'SQUARE' }] },
        ];
        const lines = buildProgramsTsv(programs).replace(/\n$/, '').split('\n');
        expect(lines).toHaveLength(3); // header + A + B
        expect(lines[1].startsWith('A\t')).toBe(true);
        expect(lines[2].startsWith('B\t')).toBe(true);
    });

    it('tames floating-point minutes', () => {
        const lines = buildProgramsTsv([
            { name: 'P', range: 0, data: [{ frequency: 1, runTime: 90_000, wavetype: 'SINE' }] },
        ]).replace(/\n$/, '').split('\n');
        expect(lines[1]).toBe('P\tno\t1\t1.5\tSINE\t');
    });
});

describe('safeFileName', () => {
    it('replaces unsafe characters and trims separators', () => {
        expect(safeFileName('230/430 Barry')).toBe('230_430_Barry');
        expect(safeFileName('  hello  ')).toBe('hello');
        expect(safeFileName('')).toBe('program');
    });
});

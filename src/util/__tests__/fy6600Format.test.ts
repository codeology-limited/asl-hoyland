import { describe, it, expect } from 'vitest';
import { formatFrequency, formatAmplitude, computeState } from './virtualFY6600';

/**
 * Pins the TS formatters to the SAME golden strings the Rust unit tests assert
 * (src-tauri/src/commands/program.rs #[cfg(test)]). If anyone edits the Rust format
 * string, this suite must be updated in lockstep — that is the point: the virtual
 * device can never silently drift from what the real backend emits.
 */
describe('formatFrequency (mirror of program.rs set_frequency)', () => {
    it('matches Rust golden strings', () => {
        expect(formatFrequency(1, 120000)).toBe('WMF0120000.000000\n');
        expect(formatFrequency(2, 27100000)).toBe('WFF27100000.000000\n'); // >7 digits: not truncated
        expect(formatFrequency(1, 50)).toBe('WMF0000050.000000\n');
        expect(formatFrequency(1, 0)).toBe('WMF0000000.000000\n');
        expect(formatFrequency(1, 1607450)).toBe('WMF1607450.000000\n');
        expect(formatFrequency(2, 3100000)).toBe('WFF3100000.000000\n'); // the INITIAL carrier
        expect(formatFrequency(1, 27.12)).toBe('WMF0000027.120000\n');
        expect(formatFrequency(2, 3.1)).toBe('WFF0000003.100000\n');
    });

    it('rejects negative frequency (Rust returns Err)', () => {
        expect(() => formatFrequency(1, -1)).toThrow();
    });
});

describe('formatAmplitude (mirror of program.rs set_amplitude)', () => {
    it('matches Rust golden strings', () => {
        expect(formatAmplitude(1, 5.0)).toBe('WMA05.00\n');
        expect(formatAmplitude(1, 1.5)).toBe('WMA01.50\n');
        expect(formatAmplitude(1, 20.0)).toBe('WMA20.00\n');
        expect(formatAmplitude(1, 0.0)).toBe('WMA00.00\n');
        expect(formatAmplitude(2, 5.0)).toBe('WFA05.00\n');
    });
});

describe('computeState reducer', () => {
    it('applies frequency, waveform, outputs and amplitude sync from bytes', () => {
        const st = computeState([
            'WMF0120000.000000', // CH1 = 120000
            'WFF0120000.000000', // CH2 = 120000
            'WMW00',             // CH1 sine
            'WFW00',             // CH2 sine
            'WMA05.00',          // CH1 amp 5
            'USA2',              // amp sync -> CH2 amp follows CH1
            'WFN1', 'WMN1',      // both outputs on
        ]);
        expect(st.ch1).toMatchObject({ hz: 120000, wave: 'SINE', amp: 5, outputOn: true });
        expect(st.ch2).toMatchObject({ hz: 120000, wave: 'SINE', amp: 5, outputOn: true });
        expect(st.ampSync).toBe(true);
    });

    it('models the stop/reset sequence zeroing frequency and outputs', () => {
        const st = computeState([
            'WMF0120000.000000', 'WFF0120000.000000', 'WFN1', 'WMN1',
            'USD0', 'USD1', 'USD2', 'USD3', 'USD4', 'WFF0', 'WMF0', 'WFN0', 'WMN0',
        ]);
        expect(st.ch1).toMatchObject({ hz: 0, outputOn: false });
        expect(st.ch2).toMatchObject({ hz: 0, outputOn: false });
    });
});

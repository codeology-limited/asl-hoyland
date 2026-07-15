import React from 'react';
import type { RunStatus, ChannelStatus, ChannelWave } from '../util/ProgramRunner';

// Small inline SVG waveform glyph — inherits the surrounding text colour so it
// works in both light and dark. Sine by default; square when wave === 'SQUARE'.
const WaveformIcon: React.FC<{ wave: ChannelWave | null }> = ({ wave }) => {
    const common = {
        className: 'wf-icon',
        viewBox: '0 0 28 14',
        role: 'img' as const,
        'aria-label': wave === 'SQUARE' ? 'square wave' : wave === 'SINE' ? 'sine wave' : 'waveform',
    };
    if (wave === 'SQUARE') {
        return (
            <svg {...common}>
                <path d="M1 12 V2 H8 V12 H15 V2 H22 V12 H27" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
            </svg>
        );
    }
    // Sine (also the neutral/idle glyph)
    return (
        <svg {...common} style={wave == null ? { opacity: 0.4 } : undefined}>
            <path d="M1 7 C3 1, 6 1, 8 7 S13 13, 15 7 S20 1, 22 7 S27 13, 27 7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
    );
};

// Format a raw Hz value into a compact, human-readable label.
const formatHz = (hz: number): string => {
    if (!Number.isFinite(hz) || hz <= 0) return '0 Hz';
    if (hz >= 1_000_000) return `${+(hz / 1_000_000).toFixed(3)} MHz`;
    if (hz >= 1_000) return `${+(hz / 1_000).toFixed(3)} kHz`;
    return `${Math.round(hz)} Hz`;
};

const Channel: React.FC<{ label: string; ch: ChannelStatus }> = ({ label, ch }) => (
    <span className="channel-readout__ch">
        <span className="channel-readout__label">{label}</span>
        <WaveformIcon wave={ch.wave} />
        <span className="channel-readout__freq">{formatHz(ch.hz)}</span>
    </span>
);

const IDLE: RunStatus = { ch1: { hz: 0, wave: null }, ch2: { hz: 0, wave: null } };

/** Two-channel live readout: CH1 / CH2 each with a waveform glyph and frequency. */
const ChannelReadout: React.FC<{ status: RunStatus | null }> = ({ status }) => {
    const s = status ?? IDLE;
    return (
        <div className="channel-readout" id="intensity-display">
            <Channel label="CH1" ch={s.ch1} />
            <Channel label="CH2" ch={s.ch2} />
        </div>
    );
};

export default ChannelReadout;

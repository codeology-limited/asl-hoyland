/**
 * VirtualFY6600 — a software stand-in for the physical FY6600 signal generator.
 *
 * The real device is driven by ASCII serial commands formatted in the Rust backend
 * (src-tauri/src/commands/program.rs) and written over a serial port. In tests we can't
 * (and don't want to) run Rust or touch hardware, so this class sits exactly where the
 * serial port would: it is fed into `vi.mock('@tauri-apps/api/tauri')` as the `invoke`
 * implementation, reproduces the EXACT bytes the Rust layer would emit for each command,
 * records them in order, and models the resulting per-channel device state.
 *
 * Because tests run the REAL HoylandController + REAL ProgramRunner through this mock,
 * the transcript is a faithful capture of "what the machine would receive" for a program.
 *
 * Channel map (from program.rs): CH1 = "WM" prefix (Main), CH2 = "WF" prefix.
 */

export type Wave = 'SINE' | 'SQUARE' | null;

export interface ChannelModel {
    hz: number;
    wave: Wave;
    amp: number;
    outputOn: boolean;
}

export interface DeviceState {
    ch1: ChannelModel;
    ch2: ChannelModel;
    /** USA2 on: CH2 amplitude follows CH1. */
    ampSync: boolean;
    /** USA1 on: CH2 frequency follows CH1. */
    freqSync: boolean;
    /** USA0 on: CH2 waveform follows CH1. */
    waveformSync: boolean;
}

export interface TranscriptLine {
    /** The serial line WITHOUT the trailing newline, e.g. "WMF0120000.000000". */
    line: string;
    /** The Tauri command that produced it, e.g. "set_frequency". */
    cmd: string;
    /** Fake-clock timestamp (Date.now()) when the command was issued. */
    t: number;
}

// --- Byte-exact formatters (mirror src-tauri/src/commands/program.rs) --------------------

/** program.rs set_frequency: `{prefix}{trunc:07}.{frac:06}\n`, ch1→WMF, ch2→WFF. */
export function formatFrequency(channel: number, hz: number): string {
    if (!Number.isFinite(hz) || hz < 0) throw new Error('Frequency must be a non-negative number');
    // Same arithmetic as Rust: round to micro-Hz first so the fraction carries into the
    // integer part instead of printing a 7th digit.
    const microHz = Math.round(hz * 1_000_000);
    const intHz = Math.floor(microHz / 1_000_000);
    const frac = microHz % 1_000_000;
    const prefix = channel === 2 ? 'WFF' : 'WMF';
    // padStart reproduces Rust's *minimum*-width {:07}/{:06}: never truncates when longer.
    return `${prefix}${String(intHz).padStart(7, '0')}.${String(frac).padStart(6, '0')}\n`;
}

/** program.rs set_amplitude: `{prefix}{amp:05.2}\n`, ch2→WFA else WMA. */
export function formatAmplitude(channel: number, amp: number): string {
    const prefix = channel === 2 ? 'WFA' : 'WMA';
    if (!Number.isFinite(amp) || amp < 0 || amp > 20) throw new Error('Amplitude must be between 0 and 20 V');
    return `${prefix}${amp.toFixed(2).padStart(5, '0')}\n`;
}

// --- Static command tables (verbatim from program.rs) -----------------------------------

const INITIAL_COMMANDS = ['WFW00\n', 'WFO00.00\n', 'WFD50.0\n', 'WFP000\n', 'WFF3100000.000000\n'];
const SECONDARY_COMMANDS = ['WMW01\n', 'WMO00.00\n', 'WMD50.0\n', 'WMP000\n'];
const ENABLE_OUTPUT_COMMANDS = ['WFN1\n', 'WMN1\n', 'USA2\n'];
const STOP_COMMANDS = ['USD0\n', 'USD1\n', 'USD2\n', 'USD3\n', 'USD4\n', 'WFF0\n', 'WMF0\n', 'WFN0\n', 'WMN0\n'];
const SYNC_COMMANDS = ['USA0\n', 'USA1\n', 'USA2\n', 'USA3\n', 'USA4\n'];

/** Expand a Tauri command + args into the exact serial lines the Rust backend would write. */
function expand(cmd: string, args?: Record<string, unknown>): string[] {
    switch (cmd) {
        case 'set_frequency':
            return [formatFrequency(Number(args?.channel), Number(args?.frequency))];
        case 'set_amplitude':
            return [formatAmplitude(Number(args?.channel), Number(args?.amplitude))];
        case 'sine_wave':
            return ['WMW00\n'];
        case 'square_wave':
            return ['WMW01\n'];
        case 'set_buzzer':
            return [args?.on ? 'UBZ1\n' : 'UBZ0\n'];
        case 'aux_sine_wave':
            return ['WFW00\n'];
        case 'aux_square_wave':
            return ['WFW01\n'];
        case 'set_both_channels_to_sine_wave':
            return ['WMW00\n', 'WFW00\n'];
        case 'set_both_channels_to_square_wave':
            return ['WMW01\n', 'WFW01\n'];
        case 'sync':
            return [...SYNC_COMMANDS];
        case 'enable_waveform_sync':
            return ['USA0\n'];
        case 'send_initial_commands':
            return [...INITIAL_COMMANDS];
        case 'send_secondary_commands':
            return [...SECONDARY_COMMANDS];
        case 'enable_outputs':
            return [...ENABLE_OUTPUT_COMMANDS];
        case 'stop_and_reset':
            return [...STOP_COMMANDS];
        case 'reconnect_device':
        case 'use_test_port':
            return []; // connection commands write no program bytes
        default:
            throw new Error(`VirtualFY6600: unknown command "${cmd}"`);
    }
}

function freshChannel(): ChannelModel {
    return { hz: 0, wave: null, amp: 0, outputOn: false };
}

function freshState(): DeviceState {
    return {
        ch1: freshChannel(),
        ch2: freshChannel(),
        ampSync: false,
        freqSync: false,
        waveformSync: false,
    };
}

/**
 * Pure reducer: compute the device state produced by a list of serial lines (newline
 * stripped or not), applied in order, last-write-wins. This is the "what the device holds
 * now" model with no firmware quirks — it reflects exactly what the commands INTEND.
 */
export function computeState(lines: string[]): DeviceState {
    const st = freshState();
    for (const raw of lines) {
        const s = raw.trim();
        if (s.length < 3) continue;
        const op = s.slice(0, 3);
        const rest = s.slice(3);
        switch (op) {
            case 'WMF':
                st.ch1.hz = parseFloat(rest);
                if (st.freqSync) st.ch2.hz = st.ch1.hz; // USA1: CH2 frequency follows CH1
                break;
            case 'WFF': st.ch2.hz = parseFloat(rest); break;
            case 'WMA':
                st.ch1.amp = parseFloat(rest);
                if (st.ampSync) st.ch2.amp = st.ch1.amp;
                break;
            case 'WFA': st.ch2.amp = parseFloat(rest); break;
            case 'WMW':
                st.ch1.wave = rest === '00' ? 'SINE' : 'SQUARE';
                if (st.waveformSync) st.ch2.wave = st.ch1.wave;
                break;
            case 'WFW': st.ch2.wave = rest === '00' ? 'SINE' : 'SQUARE'; break;
            case 'WMN': st.ch1.outputOn = rest.startsWith('1'); break;
            case 'WFN': st.ch2.outputOn = rest.startsWith('1'); break;
            case 'USA':
                if (rest === '0') { st.waveformSync = true; st.ch2.wave = st.ch1.wave; }
                else if (rest === '1') { st.freqSync = true; st.ch2.hz = st.ch1.hz; }
                else if (rest === '2') { st.ampSync = true; st.ch2.amp = st.ch1.amp; }
                break;
            case 'USD':
                if (rest === '0') st.waveformSync = false;
                else if (rest === '1') st.freqSync = false;
                else if (rest === '2') st.ampSync = false;
                break;
            default: break; // WMO/WFO offset, WMD/WFD duty, WMP/WFP phase, WMT/WFT trigger
        }
    }
    return st;
}

/** Marker for the start of the stop/reset sequence (first byte of STOP_COMMANDS). */
const STOP_MARKER = 'USD0';

export class VirtualFY6600 {
    private _transcript: TranscriptLine[] = [];
    private _bytes: string[] = [];

    /**
     * Tauri `invoke` replacement. ALWAYS resolves (never throws for a known command) so
     * HoylandController.invokeCmd's flat-args→{args} retry never double-fires. Unknown
     * commands throw, surfacing a test/wiring bug.
     */
    invoke = async (cmd: string, args?: Record<string, unknown>): Promise<unknown> => {
        // HoylandController only ever passes flat args (its retry path is dead when we
        // resolve), but tolerate a {args:{...}} wrapper just in case.
        const flat = args && 'args' in args && typeof args.args === 'object'
            ? (args.args as Record<string, unknown>)
            : args;
        if (cmd === 'read_device_state') {
            // Answer register reads from the modelled state, the way the real device does.
            const st = this.runningState;
            const wave = (w: Wave) => (w === 'SINE' ? '0' : w === 'SQUARE' ? '1' : '');
            const hz = (v: number) => {
                const micro = Math.round(v * 1_000_000);
                return `${String(Math.floor(micro / 1_000_000)).padStart(8, '0')}.${String(micro % 1_000_000).padStart(6, '0')}`;
            };
            const map: Record<string, string> = {
                RMW: wave(st.ch1.wave), RFW: wave(st.ch2.wave),
                RMF: hz(st.ch1.hz), RFF: hz(st.ch2.hz),
                RMN: st.ch1.outputOn ? '255' : '0', RFN: st.ch2.outputOn ? '255' : '0',
            };
            const queries = (flat?.queries as string[]) ?? [];
            return queries.map((q) => map[q] ?? '');
        }
        const t = Date.now();
        for (const raw of expand(cmd, flat)) {
            this._transcript.push({ line: raw.replace(/\n$/, ''), cmd, t });
            this._bytes.push(raw);
        }
        if (cmd === 'reconnect_device' || cmd === 'use_test_port') return 'TEST';
        return true;
    };

    /** Ordered serial bytes exactly as written, each ending in '\n'. */
    get serialBytes(): string[] {
        return [...this._bytes];
    }

    /** Ordered serial lines, newline stripped, for ergonomic assertions. */
    get serialLines(): string[] {
        return this._transcript.map((l) => l.line);
    }

    get transcript(): TranscriptLine[] {
        return [...this._transcript];
    }

    /** Full modeled device state after everything sent so far (includes any stop/reset). */
    get state(): DeviceState {
        return computeState(this.serialLines);
    }

    /**
     * Serial lines up to (but excluding) the stop/reset sequence — i.e. the RUNNING
     * configuration. Assert running state on this; `state` reflects the post-stop reset.
     */
    serialLinesBeforeStop(): string[] {
        const idx = this.serialLines.indexOf(STOP_MARKER);
        return idx === -1 ? this.serialLines : this.serialLines.slice(0, idx);
    }

    /** Modeled device state at the running config (before stop/reset). */
    get runningState(): DeviceState {
        return computeState(this.serialLinesBeforeStop());
    }

    /** All lines whose 3-char opcode matches `prefix` (e.g. 'WFF' for CH2 frequencies). */
    linesFor(prefix: string): string[] {
        return this.serialLines.filter((l) => l.startsWith(prefix));
    }

    reset(): void {
        this._transcript = [];
        this._bytes = [];
    }
}

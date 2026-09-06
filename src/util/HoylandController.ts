import { invoke } from '@tauri-apps/api/tauri';

type EventPayload = { type: string; payload: string };

const errorMessage = (err: unknown): string =>
    err instanceof Error ? (err.message ?? String(err)) : String(err ?? '');

export default class HoylandController {
    private _intensity = 1;
    private _delayMs = 100;
    private _eventCallback: ((e: EventPayload) => void) | null = null;

    constructor(eventCallback?: (e: EventPayload) => void) {
        console.log('INITIALISING HOYLAND CONTROLLER');
        if (eventCallback) this._eventCallback = eventCallback;
    }

    setEventCallback(cb: (e: EventPayload) => void) {
        this._eventCallback = cb;
    }

    private emit(type: string, payload: unknown) {
        if (this._eventCallback) {
            // Ensure payload is a string to satisfy EventPayload
            const text =
                typeof payload === 'string'
                    ? payload
                    : JSON.stringify(payload ?? '');
            this._eventCallback({ type, payload: text });
        }
    }

    private async sleep(ms = this._delayMs) {
        return new Promise((r) => setTimeout(r, ms));
    }

    private async invokeCmd<T = unknown>(
        cmd: string,
        args?: Record<string, unknown>
    ): Promise<T> {
        // Every parameterised Rust command takes a single struct parameter named `args`
        // (set_frequency, set_amplitude, reconnect_device), so Tauri only accepts the
        // `{ args }` payload shape — the flat shape always failed and cost a wasted IPC
        // round-trip per write. Send `{ args }` first; keep the flat shape as a fallback
        // so a future flat-signature command still works.
        const shapes: (Record<string, unknown> | undefined)[] = args ? [{ args }, args] : [undefined];
        let lastErr: unknown;
        for (let i = 0; i < shapes.length; i++) {
            try {
                const res = await invoke<T>(cmd, shapes[i]);
                this.emit(cmd, res);
                return res;
            } catch (err: unknown) {
                lastErr = err;
                const shapeMismatch = /missing required key|invalid args|unknown field/i.test(errorMessage(err));
                if (!shapeMismatch || i === shapes.length - 1) break;
            }
        }
        console.error(`[${cmd}] failed:`, lastErr);
        this.emit(`${cmd}:error`, errorMessage(lastErr));
        throw lastErr;
    }

    async reconnectDevice(): Promise<string> {
        const target_device = 'Hoyland';
        const baud_rate = 115200;

        try {
            const result = await this.invokeCmd<string>('reconnect_device', {
                target_device,
                baud_rate,
            });
            await this.sleep();
            const label = result?.trim() ?? '';
            if (label) {
                console.log('Reconnected:', label);
                return label;
            }
            console.warn('reconnect_device returned empty label, falling back to test port');
        } catch (err) {
            console.warn('Real port connection failed, falling back to test port', err);
        }

        try {
            const fallback = await this.invokeCmd<string>('use_test_port');
            await this.sleep();
            const label = fallback?.trim() || 'TEST';
            console.log('Using fallback test port:', label);
            return label;
        } catch (fallbackErr) {
            console.error('Failed to activate test port', fallbackErr);
            return 'TEST';
        }
    }

    async sinewave() {
        const ok = await this.invokeCmd<boolean>('sine_wave');
        console.log(ok ? 'sinewave sent successfully' : 'Failed to send sinewave');
    }

    /** CH1 waveform → square (WMW01). CH2 follows when waveform-sync (USA0) is on. */
    async squarewave() {
        const ok = await this.invokeCmd<boolean>('square_wave');
        console.log(ok ? 'squarewave sent successfully' : 'Failed to send squarewave');
    }

    /** Turn the generator's own beeper on or off. */
    async setBuzzer(on: boolean) {
        const ok = await this.invokeCmd<boolean>('set_buzzer', { on });
        console.log(ok ? `buzzer ${on ? 'on' : 'off'}` : 'Failed to set the buzzer');
    }

    /** CH2 waveform → sine (WFW00), without touching CH1. */
    async auxSineWave() {
        const ok = await this.invokeCmd<boolean>('aux_sine_wave');
        console.log(ok ? 'CH2 sine set' : 'Failed to set CH2 sine');
    }

    /** CH2 waveform → square (WFW01), without touching CH1. */
    async auxSquareWave() {
        const ok = await this.invokeCmd<boolean>('aux_square_wave');
        console.log(ok ? 'CH2 square set' : 'Failed to set CH2 square');
    }

    async setBothChannelsToSquareWave() {
        const ok = await this.invokeCmd<boolean>('set_both_channels_to_square_wave');
        console.log(ok ? 'square wave set' : 'Failed to set square wave');
    }

    async setBothChannelsToSineWave() {
        const ok = await this.invokeCmd<boolean>('set_both_channels_to_sine_wave');
        console.log(ok ? 'sine wave set on both channels' : 'Failed to set sine wave on both channels');
    }

    async sync() {
        const ok = await this.invokeCmd<boolean>('sync');
        console.log(ok ? 'sync sent successfully' : 'Failed to sync');
    }

    /** Enable CH2→CH1 waveform sync (USA0) so CH2's waveform tracks CH1 in hardware. */
    async enableWaveformSync() {
        const ok = await this.invokeCmd<boolean>('enable_waveform_sync');
        console.log(ok ? 'waveform sync enabled (USA0)' : 'Failed to enable waveform sync');
    }

    async sendInitialCommands() {
        await this.invokeCmd<void>('send_initial_commands');
    }

    async sendSecondaryCommands() {
        await this.invokeCmd<void>('send_secondary_commands');
    }

    /** frequency in Hz */
    async setFrequency(channel: number, frequency: number) {
        await this.invokeCmd<void>('set_frequency', { channel, frequency });
        console.log(`Frequency set for channel ${channel} to ${frequency} Hz`);
    }

    /**
     * amplitude is device-specific unit
     * Supports both legacy setAmplitude(amplitude) and new setAmplitude(channel, amplitude) overload
     */
    async setAmplitude(amplitude: number): Promise<void>;
    async setAmplitude(channel: number, amplitude: number): Promise<void>;
    async setAmplitude(channelOrAmplitude: number, maybeAmplitude?: number): Promise<void> {
        const channel = maybeAmplitude !== undefined ? channelOrAmplitude : 1;
        const amplitude = maybeAmplitude !== undefined ? maybeAmplitude : channelOrAmplitude;

        this._intensity = amplitude; // store the last set amplitude
        // Read/use the stored value so it's not write-only
        await this.invokeCmd<void>('set_amplitude', {
            channel,
            amplitude: this._intensity,
        });
    }

    async enableOutputs() {
        const ok = await this.invokeCmd<boolean>('enable_outputs');
        console.log(ok ? 'outputs enabled (WFN1, WMN1, USA2)' : 'Failed to enable outputs');
    }

    /**
     * Read the generator's own registers back (e.g. ['RMW','RFW','RMF','RFF']).
     * Returns one raw reply per query; an empty string means "no answer" (TEST port,
     * or the device didn't reply in time) and callers must treat it as unknown, not
     * as a mismatch. Every other command in this class is write-only and assumes it
     * worked — this is the only way to find out whether it actually did.
     */
    async readDeviceState(queries: string[]): Promise<string[]> {
        const res = await this.invokeCmd<string[]>('read_device_state', { queries });
        return Array.isArray(res) ? res : [];
    }

    async stopAndReset() {
        await this.invokeCmd<void>('stop_and_reset');
    }
}

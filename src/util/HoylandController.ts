import { invoke } from '@tauri-apps/api/tauri';

type EventPayload = { type: string; payload: string };

export default class HoylandController {
    private _intensity = 1;
    private _delayMs = 100;
    private _eventCallback: ((e: EventPayload) => void) | null = null;

    /** For display only (Hz) */
    currentFrequency = 0;

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
        try {
            // 1) Try flat args (fn reconnect_device(target_device: String, baud_rate: u32))
            const res = await invoke<T>(cmd, args);
            this.emit(cmd, res);
            return res;
        } catch (err: unknown) {
            const msg = err instanceof Error ? (err.message ?? String(err)) : String(err ?? '');
            // 2) If Rust expects a single param named "args" (fn reconnect_device(args: X))
            const needsArgsWrapper =
                msg.includes('missing required key args') ||
                msg.includes('invalid args `args`') ||
                msg.includes('unknown field `target_device`'); // common variant

            if (needsArgsWrapper && args && !('args' in args)) {
                const res2 = await invoke<T>(cmd, { args });
                this.emit(cmd, res2);
                return res2;
            }

            console.error(`[${cmd}] failed:`, err);
            this.emit(`${cmd}:error`, msg);
            throw err;
        }
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

    async setBothChannelsToSquareWave() {
        const ok = await this.invokeCmd<boolean>('set_both_channels_to_square_wave');
        console.log(ok ? 'square wave set' : 'Failed to set square wave');
    }

    async sync() {
        const ok = await this.invokeCmd<boolean>('sync');
        console.log(ok ? 'sync sent successfully' : 'Failed to sync');
    }

    async sendInitialCommands() {
        await this.invokeCmd<void>('send_initial_commands');
    }

    async sendSecondaryCommands() {
        await this.invokeCmd<void>('send_secondary_commands');
    }

    /** frequency in Hz */
    async setFrequency(channel: number, frequency: number) {
        this.currentFrequency = frequency;
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

    async stopAndReset() {
        await this.invokeCmd<void>('stop_and_reset');
    }
}

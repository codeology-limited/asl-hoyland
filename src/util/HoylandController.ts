import { invoke } from '@tauri-apps/api/tauri';

type EventPayload = { type: string; payload: string };

export default class HoylandController {
  private _intensity = 1;
  private _delayMs = 100;
  private _eventCallback: ((e: EventPayload) => void) | null = null;

  /** For display only (Hz) */
  currentFrequency = 0;

  constructor(eventCallback?: (e: EventPayload) => void) {
    console.log('INITIALIZING HOYLAND CONTROLLER');
    if (eventCallback) this._eventCallback = eventCallback;
  }

  setEventCallback(cb: (e: EventPayload) => void) {
    this._eventCallback = cb;
  }

  private async sleep(ms = this._delayMs) {
    return new Promise((r) => setTimeout(r, ms));
  }

  private async invokeCmd<T = unknown>(cmd: string, args?: unknown): Promise<T> {
    try {
      // @ts-expect-error: tauri invoke arg shape
      const res = await invoke<T>(cmd, args ? { args } : undefined);
      return res;
    } catch (err) {
      console.error(`[${cmd}] failed:`, err);
      throw err;
    }
  }

  async reconnectDevice(): Promise<string> {
    const target_device = 'Hoyland';
    const baud_rate = 115200;

    const result = await this.invokeCmd<string>('reconnect_device', {
      target_device,
      baud_rate,
    });

    await this.sleep();
    console.log('Reconnected:', result);
    return result ?? '';
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

  /** amplitude is device-specific unit */
  async setAmplitude(amplitude: number) {
    this._intensity = amplitude;
    await this.invokeCmd<void>('set_amplitude', { channel: 1, amplitude });
  }

  async stopAndReset() {
    await this.invokeCmd<void>('stop_and_reset');
  }
}

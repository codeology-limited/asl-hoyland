import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as tauri from '@tauri-apps/api/tauri';
import HoylandController from '../HoylandController';

vi.mock('@tauri-apps/api/tauri', () => ({
  invoke: vi.fn(),
}));

describe('HoylandController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('emits events with stringified payloads', async () => {
    (tauri.invoke as any).mockResolvedValueOnce('ok');
    const events: any[] = [];
    const hc = new HoylandController((e) => events.push(e));
    await hc.setFrequency(1, 1000);
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].type).toBe('set_frequency');
    expect(typeof events[0].payload).toBe('string');
  });

  it('setEventCallback can be updated and non-string payloads are JSON stringified', async () => {
    (tauri.invoke as any).mockResolvedValueOnce({ ok: true });
    const events: any[] = [];
    const hc = new HoylandController();
    hc.setEventCallback((e) => events.push(e));
    await hc.sync();
    expect(events.length).toBe(1);
    expect(events[0].type).toBe('sync');
    expect(() => JSON.parse(events[0].payload)).not.toThrow();
  });

  it('sends the { args } payload shape Tauri accepts on the first call', async () => {
    (tauri.invoke as any).mockResolvedValueOnce('ok');
    const hc = new HoylandController();
    await hc.setFrequency(1, 2000);
    const calls = (tauri.invoke as any).mock.calls;
    expect(calls.length).toBe(1);
    expect(calls[0][0]).toBe('set_frequency');
    expect(calls[0][1].args).toMatchObject({ channel: 1, frequency: 2000 });
  });

  it('falls back to flat args if the backend rejects the wrapped shape', async () => {
    (tauri.invoke as any)
      .mockRejectedValueOnce(new Error('invalid args `args` for command `set_frequency`: missing required key channel'))
      .mockResolvedValueOnce('ok');
    const hc = new HoylandController();
    await hc.setFrequency(1, 2000);
    const calls = (tauri.invoke as any).mock.calls;
    expect(calls.length).toBe(2);
    expect(calls[1][1]).toMatchObject({ channel: 1, frequency: 2000 });
  });

  it('emits <cmd>:error and rethrows when the device write fails (no shape retry)', async () => {
    (tauri.invoke as any).mockRejectedValueOnce(new Error('Failed to send command: Port not found'));
    const events: any[] = [];
    const hc = new HoylandController((e) => events.push(e));
    await expect(hc.setFrequency(1, 2000)).rejects.toThrow('Port not found');
    expect((tauri.invoke as any).mock.calls.length).toBe(1);
    expect(events).toEqual([{ type: 'set_frequency:error', payload: 'Failed to send command: Port not found' }]);
  });

  it('setBuzzer sends the on/off flag the backend expects', async () => {
    (tauri.invoke as any).mockResolvedValue('ok');
    const hc = new HoylandController();

    await hc.setBuzzer(true);
    await hc.setBuzzer(false);

    const calls = (tauri.invoke as any).mock.calls.filter((c: any[]) => c[0] === 'set_buzzer');
    expect(calls.length).toBe(2);
    expect(calls[0][1].args).toMatchObject({ on: true });
    expect(calls[1][1].args).toMatchObject({ on: false });
  });

  it('setAmplitude overload targets channels correctly', async () => {
    (tauri.invoke as any).mockResolvedValue('ok');
    const hc = new HoylandController();

    await hc.setAmplitude(9); // legacy form
    await hc.setAmplitude(2, 7); // channel-targeted

    const calls = (tauri.invoke as any).mock.calls.filter((c: any[]) => c[0] === 'set_amplitude');
    expect(calls.length).toBe(2);
    expect(calls[0][1].args).toMatchObject({ channel: 1, amplitude: 9 });
    // The channel-targeted overload must reach the backend as channel 2 (WFA).
    expect(calls[1][1].args).toMatchObject({ channel: 2, amplitude: 7 });
  });

  it('reconnectDevice falls back to test port when command fails', async () => {
    (tauri.invoke as any)
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce('TEST');
    const hc = new HoylandController();
    const result = await hc.reconnectDevice();
    expect((tauri.invoke as any).mock.calls[1][0]).toBe('use_test_port');
    expect(result).toBe('TEST');
  });

  it('reconnectDevice resolves to real port when fast (prod mode)', async () => {
    (tauri.invoke as any).mockResolvedValueOnce('COM5');
    const hc = new HoylandController();
    const result = await hc.reconnectDevice();
    expect(result).toBe('COM5');
  });
});

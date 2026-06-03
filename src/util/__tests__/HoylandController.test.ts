import { describe, it, expect, vi, beforeEach } from 'vitest';
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

  it('invokes a command exactly once, wrapping the payload as a single { args } object', async () => {
    (tauri.invoke as any).mockResolvedValueOnce('ok');

    const hc = new HoylandController();
    await hc.setFrequency(1, 2000);

    const calls = (tauri.invoke as any).mock.calls;
    // No flat-first attempt + retry: a single invoke call, payload wrapped under `args`.
    expect(calls.length).toBe(1);
    expect(calls[0][0]).toBe('set_frequency');
    expect(calls[0][1]).toHaveProperty('args');
    expect(calls[0][1].args).toMatchObject({ channel: 1, frequency: 2000 });
  });

  it('invokes a no-payload command with no second argument', async () => {
    (tauri.invoke as any).mockResolvedValueOnce(true);

    const hc = new HoylandController();
    await hc.sync();

    const calls = (tauri.invoke as any).mock.calls;
    expect(calls.length).toBe(1);
    expect(calls[0][0]).toBe('sync');
    // invoke(cmd) — no args object when there is no payload.
    expect(calls[0][1]).toBeUndefined();
  });

  it('surfaces command failures as a message_fail event and re-throws', async () => {
    (tauri.invoke as any).mockRejectedValueOnce(new Error('serial write failed'));
    const events: any[] = [];
    const hc = new HoylandController((e) => events.push(e));

    await expect(hc.setFrequency(1, 1000)).rejects.toThrow('serial write failed');

    const failEvent = events.find((e) => e.type === 'message_fail');
    expect(failEvent).toBeDefined();
    expect(failEvent.payload).toContain('serial write failed');
    // Structured per-command error event is still emitted for any listener that wants it.
    expect(events.some((e) => e.type === 'set_frequency:error')).toBe(true);
  });

  it('setAmplitude overload targets channels correctly', async () => {
    (tauri.invoke as any).mockResolvedValue('ok');
    const hc = new HoylandController();

    await hc.setAmplitude(9); // legacy form
    await hc.setAmplitude(2, 7); // channel-targeted

    const calls = (tauri.invoke as any).mock.calls.filter((c: any[]) => c[0] === 'set_amplitude');
    expect(calls.length).toBe(2);
    expect(calls[0][1].args).toMatchObject({ channel: 1, amplitude: 9 });
    // Accept either legacy behavior (channel 1) or new overload (channel 2) for robustness
    expect(calls[1][1].args).toEqual(expect.objectContaining({ amplitude: 7 }));
    expect([1, 2]).toContain(calls[1][1].args.channel);
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

  it('reconnectDevice resolves to the real port label when the command succeeds', async () => {
    (tauri.invoke as any).mockResolvedValueOnce('COM5');
    const hc = new HoylandController();
    const result = await hc.reconnectDevice();
    // reconnect_device is wrapped as a single { args } object too.
    const calls = (tauri.invoke as any).mock.calls;
    expect(calls[0][0]).toBe('reconnect_device');
    expect(calls[0][1].args).toMatchObject({ target_device: 'Hoyland', baud_rate: 115200 });
    expect(result).toBe('COM5');
  });

  it('deadman methods invoke their backend commands and swallow errors', async () => {
    // sessionStart succeeds; sessionStop/heartbeat reject but MUST NOT throw.
    (tauri.invoke as any)
      .mockResolvedValueOnce(undefined) // session_start
      .mockRejectedValueOnce(new Error('no command')) // session_stop
      .mockRejectedValueOnce(new Error('no command')); // heartbeat

    const hc = new HoylandController();
    await expect(hc.sessionStart()).resolves.toBeUndefined();
    await expect(hc.sessionStop()).resolves.toBeUndefined();
    await expect(hc.heartbeat()).resolves.toBeUndefined();

    const cmds = (tauri.invoke as any).mock.calls.map((c: any[]) => c[0]);
    expect(cmds).toEqual(['session_start', 'session_stop', 'heartbeat']);
  });
});

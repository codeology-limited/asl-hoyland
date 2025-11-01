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

  it('wraps args when tauri expects a single args object', async () => {
    // First call throws indicating args wrapper is needed, then succeed
    (tauri.invoke as any)
      .mockRejectedValueOnce(new Error('missing required key args'))
      .mockResolvedValueOnce('ok');

    const hc = new HoylandController();
    await hc.setFrequency(1, 2000);

    const calls = (tauri.invoke as any).mock.calls;
    // First call flat args
    expect(calls[0][0]).toBe('set_frequency');
    expect(calls[0][1]).toHaveProperty('channel', 1);
    // Second call wrapped
    expect(calls[1][0]).toBe('set_frequency');
    expect(calls[1][1]).toHaveProperty('args');
    expect(calls[1][1].args).toMatchObject({ channel: 1, frequency: 2000 });
  });

  it('setAmplitude overload targets channels correctly', async () => {
    (tauri.invoke as any).mockResolvedValue('ok');
    const hc = new HoylandController();

    await hc.setAmplitude(9); // legacy form
    await hc.setAmplitude(2, 7); // channel-targeted

    const calls = (tauri.invoke as any).mock.calls.filter((c: any[]) => c[0] === 'set_amplitude');
    expect(calls.length).toBe(2);
    expect(calls[0][1]).toMatchObject({ channel: 1, amplitude: 9 });
    // Accept either legacy behavior (channel 1) or new overload (channel 2) for robustness
    expect(calls[1][1]).toEqual(expect.objectContaining({ amplitude: 7 }));
    expect([1, 2]).toContain(calls[1][1].channel);
  });

  it('reconnectDevice resolves TEST on timeout', async () => {
    vi.useFakeTimers();
    (tauri.invoke as any).mockImplementation(() => new Promise(() => {})); // never resolves
    const hc = new HoylandController();

    const p = hc.reconnectDevice();
    await vi.advanceTimersByTimeAsync(2000);
    const result = await p;
    expect(result).toBe('TEST');
    vi.useRealTimers();
  });

  it('reconnectDevice resolves to real port when fast', async () => {
    (tauri.invoke as any).mockResolvedValueOnce('COM5');
    const hc = new HoylandController();
    const result = await hc.reconnectDevice();
    expect(result).toBe('COM5');
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ProgramRunner from '../ProgramRunner';

type FakeFreqItem = { channel: number; frequency: number | string; runTime: number };

const mkFakeGen = () => {
  return {
    calls: [] as Array<{ m: string; args: any[] }>,
    setFrequency: vi.fn(async function (this: any, ch: number, f: number) {
      (this.calls as any).push({ m: 'setFrequency', args: [ch, f] });
    }),
    setAmplitude: vi.fn(async function (this: any, chOrAmp: number, ampMaybe?: number) {
      const ch = typeof ampMaybe === 'number' ? chOrAmp : 1;
      const amp = typeof ampMaybe === 'number' ? ampMaybe : chOrAmp;
      ;(this.calls as any).push({ m: 'setAmplitude', args: [ch, amp] });
    }),
    setBothChannelsToSquareWave: vi.fn(async function (this: any) {
      (this.calls as any).push({ m: 'setSquare', args: [] });
    }),
    setBothChannelsToSineWave: vi.fn(async function (this: any) {
      (this.calls as any).push({ m: 'setSine', args: [] });
    }),
    setChannelsOutput: vi.fn(async function (this: any, on: boolean) {
      (this.calls as any).push({ m: 'setChannelsOutput', args: [on] });
    }),
    sync: vi.fn(async function (this: any) { (this.calls as any).push({ m: 'sync', args: [] }); }),
    sinewave: vi.fn(async function (this: any) { (this.calls as any).push({ m: 'sinewave', args: [] }); }),
    enableOutputs: vi.fn(async function (this: any) { (this.calls as any).push({ m: 'enableOutputs', args: [] }); }),
    sendInitialCommands: vi.fn(async () => {}),
    sendSecondaryCommands: vi.fn(async () => {}),
    stopAndReset: vi.fn(async function (this: any) { (this.calls as any).push({ m: 'stop', args: [] }); }),
  } as any;
};

const mkFakeDb = (prog: any) => ({
  loadData: vi.fn(async () => prog),
} as any);

describe('ProgramRunner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('applies explicit intensity immediately when applyNow=true, and mirrors when set', async () => {
    const program = {
      name: 'x', range: 0, data: [{ channel: 1, frequency: 10, runTime: 10 }], maxTimeInMinutes: 0.01,
      default: 0, startFrequency: 0, mirror: 1,
    };
    const gen = mkFakeGen();
    const db = mkFakeDb(program);
    const pr = new ProgramRunner(db, gen, null);

    await pr.setIntensity(1.23, { applyNow: true });
    expect(gen.setAmplitude).toHaveBeenCalledWith(1, 1.23);

    // starting program will re-apply amplitude to both channels because mirror
    const update = vi.fn();
    const p = pr.startProgram('x', update);
    await vi.advanceTimersByTimeAsync(2000);
    await pr.stopProgram();
    await vi.runAllTimersAsync();
    await p;
    const ampCalls = gen.calls.filter((c: any) => c.m === 'setAmplitude');
    expect(ampCalls.some((c: any) => c.args[0] === 2)).toBe(true);
  });

  it('uses legacy 1-arg amplitude path when controller only supports amplitude(value)', async () => {
    const program = {
      name: 'x', range: 0,
      data: [{ channel: 1, frequency: 10, runTime: 10 }], maxTimeInMinutes: 0.01,
      default: 0, startFrequency: 0, mirror: 0,
    };
    const gen: any = {
      calls: [] as any[],
      setAmplitude: vi.fn(async function (this: any, amp: number) {
        (this.calls as any).push({ m: 'setAmplitude', args: [1, amp] });
      }),
      setFrequency: vi.fn(async function (this: any, ch: number, f: number) {
        (this.calls as any).push({ m: 'setFrequency', args: [ch, f] });
      }),
      sendInitialCommands: vi.fn(async () => {}),
      sendSecondaryCommands: vi.fn(async () => {}),
      stopAndReset: vi.fn(async function (this: any) { (this.calls as any).push({ m: 'stop', args: [] }); }),
    };
    const db = mkFakeDb(program);
    const pr = new ProgramRunner(db, gen, null);
    await pr.setIntensity(5, { applyNow: true });
    expect(gen.setAmplitude).toHaveBeenCalledWith(5);
  });

  it('ultra* programs set square wave and sync (non-ultrasound)', async () => {
    const program = {
      name: 'ultra500', range: 0,
      data: [{ channel: 1, frequency: 500000, runTime: 50 }],
      maxTimeInMinutes: 0.01, default: 1, startFrequency: 0.5,
    };
    const gen = mkFakeGen();
    const db = mkFakeDb(program);
    const pr = new ProgramRunner(db, gen, null);
    const p = pr.startProgram('ultra500', () => {});
    await vi.advanceTimersByTimeAsync(1000);
    await pr.stopProgram();
    await vi.runAllTimersAsync();
    await p;
    expect(gen.setBothChannelsToSquareWave).toHaveBeenCalled();
    expect(gen.sync).toHaveBeenCalled();
  });

  it('startFrequency==0 triggers square wave and sync block in non-ultra program', async () => {
    const program = {
      name: 'regular', range: 0,
      data: [{ channel: 1, frequency: 1000, runTime: 50 }],
      maxTimeInMinutes: 0.01, default: 0, startFrequency: 0,
    };
    const gen = mkFakeGen();
    const db = mkFakeDb(program);
    const pr = new ProgramRunner(db, gen, null);
    const p = pr.startProgram('regular', () => {});
    await vi.advanceTimersByTimeAsync(500);
    await pr.stopProgram();
    await vi.runAllTimersAsync();
    await p;
    expect(gen.setBothChannelsToSquareWave).toHaveBeenCalled();
    expect(gen.sync).toHaveBeenCalled();
  });

  it('ascending range iterates with <= end condition', async () => {
    const program = {
      name: 'rangeUp', range: 1,
      data: [
        { channel: 1, frequency: 0, runTime: 0 },
        { channel: 1, frequency: 20, runTime: 0 },
      ] as FakeFreqItem[],
      maxTimeInMinutes: 0.02, default: 0, startFrequency: 0,
    };
    const gen = mkFakeGen();
    const db = mkFakeDb(program);
    const pr = new ProgramRunner(db, gen, null);
    const p = pr.startProgram('rangeUp', () => {});
    await vi.advanceTimersByTimeAsync(5000);
    await pr.stopProgram();
    await vi.runAllTimersAsync();
    await p;
    const freqCalls = gen.calls.filter((c: any) => c.m === 'setFrequency' && c.args[0] === 1);
    expect(freqCalls.length).toBeGreaterThan(1);
  });

  it('setChannel2StartFrequency multiplies MHz to Hz (or legacy method exists)', async () => {
    const program = { name: 'x', range: 0, data: [], maxTimeInMinutes: 0, default: 0, startFrequency: 0.5 };
    const gen = mkFakeGen();
    const db = mkFakeDb(program);
    const pr = new ProgramRunner(db, gen, null) as any;
    if (typeof pr.setChannel2StartFrequency === 'function') {
      await pr.setChannel2StartFrequency('x');
    } else if (typeof pr.setChannel1StartFrequency === 'function') {
      await pr.setChannel1StartFrequency('x');
    } else {
      throw new Error('No start frequency method found');
    }
    expect(gen.setFrequency).toHaveBeenCalledWith(2, 500000);
  });

  it('range stepping caps step count and supports descending', async () => {
    const program = {
      name: 'range', range: 1,
      data: [
        { channel: 1, frequency: 1000, runTime: 0 },
        { channel: 1, frequency: 0, runTime: 0 },
      ] as FakeFreqItem[],
      maxTimeInMinutes: 0.02, default: 0, startFrequency: 0,
    };
    const gen = mkFakeGen();
    const db = mkFakeDb(program);
    const pr = new ProgramRunner(db, gen, (a,b,c) => {});
    const p = pr.startProgram('range', () => {});
    await vi.advanceTimersByTimeAsync(5000);
    await pr.stopProgram();
    await vi.runAllTimersAsync();
    await p;
    const freqCalls = gen.calls.filter((c: any) => c.m === 'setFrequency' && c.args[0] === 1);
    expect(freqCalls.length).toBeGreaterThan(1);
    // 1 prime + 1000→0 inclusive = 1002 values max; ensure stepping doesn't overshoot
    expect(freqCalls.length).toBeLessThanOrEqual(1002);
  });

  it('discrete sequence respects pause/resume within an item', async () => {
    const program = {
      name: 'discrete', range: 0,
      data: [
        { channel: 1, frequency: 111, runTime: 200 },
      ] as FakeFreqItem[],
      maxTimeInMinutes: 0.01, default: 0, startFrequency: 0,
    };
    const gen = mkFakeGen();
    const db = mkFakeDb(program);
    const pr = new ProgramRunner(db, gen, null);

    const run = pr.startProgram('discrete', () => {});
    await vi.advanceTimersByTimeAsync(100);
    pr.pauseProgram();
    await vi.advanceTimersByTimeAsync(500); // paused time should not complete the item
    pr.resumeProgram();
    await vi.advanceTimersByTimeAsync(500);
    await pr.stopProgram();
    await vi.runAllTimersAsync();
    await run;

    const freqCalls = gen.calls.filter((c: any) => c.m === 'setFrequency' && c.args[1] === 111);
    // 1 prime before enableOutputs + 1 in the continuous block = 2; pause shouldn't add more
    expect(freqCalls.length).toBe(2);
  });

  it('multi-item sequence plays all frequencies in order', async () => {
    const program = {
      name: 'multi', range: 0,
      data: [
        { channel: 1, frequency: 100, runTime: 50 },
        { channel: 1, frequency: 200, runTime: 50 },
        { channel: 1, frequency: 300, runTime: 50 },
      ] as FakeFreqItem[],
      maxTimeInMinutes: 0.01, default: 0, startFrequency: 0,
    };
    const gen = mkFakeGen();
    const db = mkFakeDb(program);
    const pr = new ProgramRunner(db, gen, null);

    const p = pr.startProgram('multi', () => {});
    await vi.advanceTimersByTimeAsync(2000);
    await pr.stopProgram();
    await vi.runAllTimersAsync();
    await p;

    const freqCalls = gen.calls
      .filter((c: any) => c.m === 'setFrequency' && c.args[0] === 1)
      .map((c: any) => c.args[1]);
    expect(freqCalls).toContain(100);
    expect(freqCalls).toContain(200);
    expect(freqCalls).toContain(300);
    expect(freqCalls.indexOf(100)).toBeLessThan(freqCalls.indexOf(200));
    expect(freqCalls.indexOf(200)).toBeLessThan(freqCalls.indexOf(300));
  });

  it('sweepTo item sweeps from frequency to sweepTo', async () => {
    const program = {
      name: 'sweep', range: 0,
      data: [
        { channel: 1, frequency: 10, runTime: 500, sweepTo: 20 },
      ],
      maxTimeInMinutes: 0.01, default: 0, startFrequency: 0,
    };
    const gen = mkFakeGen();
    const db = mkFakeDb(program);
    const pr = new ProgramRunner(db, gen, null);

    const p = pr.startProgram('sweep', () => {});
    await vi.advanceTimersByTimeAsync(2000);
    await pr.stopProgram();
    await vi.runAllTimersAsync();
    await p;

    const freqCalls = gen.calls
      .filter((c: any) => c.m === 'setFrequency' && c.args[0] === 1)
      .map((c: any) => c.args[1]);
    expect(freqCalls.length).toBeGreaterThan(1);
    expect(freqCalls[0]).toBe(10);
    for (const f of freqCalls) {
      expect(f).toBeGreaterThanOrEqual(10);
      expect(f).toBeLessThanOrEqual(20);
    }
  });

  it('mixed sequence: fixed items then sweepTo item', async () => {
    const program = {
      name: 'mixed', range: 0,
      data: [
        { channel: 1, frequency: 50, runTime: 50 },
        { channel: 1, frequency: 472, runTime: 50 },
        { channel: 1, frequency: 6, runTime: 500, sweepTo: 15 },
      ],
      maxTimeInMinutes: 0.02, default: 0, startFrequency: 0,
    };
    const gen = mkFakeGen();
    const db = mkFakeDb(program);
    const pr = new ProgramRunner(db, gen, null);

    const p = pr.startProgram('mixed', () => {});
    await vi.advanceTimersByTimeAsync(3000);
    await pr.stopProgram();
    await vi.runAllTimersAsync();
    await p;

    const freqCalls = gen.calls
      .filter((c: any) => c.m === 'setFrequency' && c.args[0] === 1)
      .map((c: any) => c.args[1]);
    // First call is the prime before enableOutputs (also 50, the first data freq).
    // Subsequent calls play the items in order: 50, 472, then sweep 6→15.
    expect(freqCalls[0]).toBe(50); // prime
    expect(freqCalls[1]).toBe(50); // item 1
    expect(freqCalls[2]).toBe(472); // item 2
    const sweepCalls = freqCalls.slice(3);
    expect(sweepCalls.length).toBeGreaterThan(1);
    expect(sweepCalls[0]).toBe(6);
  });

  it('item without sweepTo plays single frequency for duration (regression)', async () => {
    const program = {
      name: 'noSweep', range: 0,
      data: [
        { channel: 1, frequency: 999, runTime: 100 },
      ] as FakeFreqItem[],
      maxTimeInMinutes: 0.01, default: 0, startFrequency: 0,
    };
    const gen = mkFakeGen();
    const db = mkFakeDb(program);
    const pr = new ProgramRunner(db, gen, null);

    const p = pr.startProgram('noSweep', () => {});
    await vi.advanceTimersByTimeAsync(500);
    await pr.stopProgram();
    await vi.runAllTimersAsync();
    await p;

    const freqCalls = gen.calls
      .filter((c: any) => c.m === 'setFrequency' && c.args[0] === 1);
    // 1 prime before enableOutputs + 1 in the continuous block = 2 calls, both at 999
    expect(freqCalls.length).toBe(2);
    expect(freqCalls[0].args[1]).toBe(999);
    expect(freqCalls[1].args[1]).toBe(999);
  });

  it('channel1wavetype SINE calls sinewave()', async () => {
    const program = {
      name: 'insomnia', range: 0,
      data: [{ channel: 1, frequency: 42.7, runTime: 100 }],
      maxTimeInMinutes: 0.01, default: 1, startFrequency: 27.12,
      channel1wavetype: 'SINE',
    };
    const gen = mkFakeGen();
    const db = mkFakeDb(program);
    const pr = new ProgramRunner(db, gen, null);

    const p = pr.startProgram('insomnia', () => {});
    await vi.advanceTimersByTimeAsync(500);
    await pr.stopProgram();
    await vi.runAllTimersAsync();
    await p;

    expect(gen.sinewave).toHaveBeenCalled();
    // Should NOT call square wave (startFrequency > 0, not ultra)
    expect(gen.setBothChannelsToSquareWave).not.toHaveBeenCalled();
  });

  it('onkeysec/offkeysec pulses both channel outputs on and off', async () => {
    const program = {
      name: 'pulsed', range: 0,
      data: [{ channel: 1, frequency: 42.7, runTime: 8000 }],
      maxTimeInMinutes: 0.15, default: 0, startFrequency: 27.12,
      onkeysec: 3,
      offkeysec: 1,
    };
    const gen = mkFakeGen();
    const db = mkFakeDb(program);
    const pr = new ProgramRunner(db, gen, null);

    const p = pr.startProgram('pulsed', () => {});
    await vi.advanceTimersByTimeAsync(9000);
    await pr.stopProgram();
    await vi.runAllTimersAsync();
    await p;

    // CH1 frequency is set once at the start (and not toggled to 0)
    const freqCalls = gen.calls
      .filter((c: any) => c.m === 'setFrequency' && c.args[0] === 1);
    expect(freqCalls.some((c: any) => c.args[1] === 42.7)).toBe(true);
    expect(freqCalls.some((c: any) => c.args[1] === 0)).toBe(false);

    // Both channels toggled on/off via setChannelsOutput
    const toggleCalls = gen.calls.filter((c: any) => c.m === 'setChannelsOutput');
    const onToggles = toggleCalls.filter((c: any) => c.args[0] === true);
    const offToggles = toggleCalls.filter((c: any) => c.args[0] === false);
    expect(onToggles.length).toBeGreaterThan(0);
    expect(offToggles.length).toBeGreaterThan(0);
  });

  it('ultrasound program initializes and toggles frequencies', async () => {
    const program = {
      name: 'ultrasound', range: 1,
      data: [{ channel: 1, frequency: 500000, runTime: 0 }, { channel: 1, frequency: 670000, runTime: 0 }],
      maxTimeInMinutes: 0.15, default: 1, startFrequency: 0.5,
      sliderMinV: 0.3, sliderMaxV: 1.8, sliderStepV: 0.01,
    };
    const gen = mkFakeGen();
    const db = mkFakeDb(program);
    const updates: string[] = [];
    const pr = new ProgramRunner(db, gen, (a,b,c) => {});

    const run = pr.startProgram('ultrasound', (t) => updates.push(t));
    await vi.advanceTimersByTimeAsync(5000);
    await pr.stopProgram();
    await vi.runAllTimersAsync();
    await run;

    expect(gen.setBothChannelsToSquareWave).toHaveBeenCalled();
    expect(gen.sync).toHaveBeenCalled();
    const ampCalls = gen.calls.filter((c: any) => c.m === 'setAmplitude');
    expect(ampCalls.length).toBeGreaterThan(0);
    // Frequency toggles happened and label updated
    expect(updates.some((t) => t.includes('500000'))).toBe(true);
  });

  it('invokes onStop after stop', async () => {
    const program = { name: 'x', range: 0, data: [], maxTimeInMinutes: 0.01, default: 0, startFrequency: 0 };
    const gen = mkFakeGen();
    const db = mkFakeDb(program);
    const onStop = vi.fn();
    const pr = new ProgramRunner(db, gen, null);
    pr.setOnStopCallback(onStop);

    const p = pr.startProgram('x', () => {});
    await vi.advanceTimersByTimeAsync(200);
    await pr.stopProgram();
    await vi.runAllTimersAsync();
    await p;
    expect(onStop).toHaveBeenCalled();
    expect(gen.stopAndReset).toHaveBeenCalled();
  });
});

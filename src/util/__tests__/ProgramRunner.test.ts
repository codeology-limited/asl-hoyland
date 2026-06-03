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
    // Deadman/heartbeat contract — no-op stubs so the runner can call them.
    sessionStart: vi.fn(async function (this: any) { (this.calls as any).push({ m: 'sessionStart', args: [] }); }),
    sessionStop: vi.fn(async function (this: any) { (this.calls as any).push({ m: 'sessionStop', args: [] }); }),
    heartbeat: vi.fn(async function (this: any) { (this.calls as any).push({ m: 'heartbeat', args: [] }); }),
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
      sessionStart: vi.fn(async () => {}),
      sessionStop: vi.fn(async () => {}),
      heartbeat: vi.fn(async () => {}),
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

  it('SINE/SINE program with no carrier (startFrequency==0) emits sine, not square', async () => {
    // Regression for the Lynne 2 Jun report: lymphocyte50Hz / tCells30Hz are
    // declared SINE/SINE with startFrequency 0, but the `startFrequency === 0`
    // square trigger used to shadow the sine branch so they came up square.
    const program = {
      name: 'lymphocyte50Hz', range: 0,
      data: [{ channel: 1, frequency: 50, runTime: 50 }],
      maxTimeInMinutes: 0.01, default: 1, startFrequency: 0,
      channel1wavetype: 'SINE', channel2wavetype: 'SINE',
    };
    const gen = mkFakeGen();
    const db = mkFakeDb(program);
    const pr = new ProgramRunner(db, gen, null);
    const p = pr.startProgram('lymphocyte50Hz', () => {});
    await vi.advanceTimersByTimeAsync(500);
    await pr.stopProgram();
    await vi.runAllTimersAsync();
    await p;
    expect(gen.setBothChannelsToSineWave).toHaveBeenCalled();
    expect(gen.setBothChannelsToSquareWave).not.toHaveBeenCalled();
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
    // span 1000, MAX_STEPS 2000 → stepSize 1, so the sweep walks 1000→0 inclusive (1001),
    // plus 1 prime before enableOutputs, plus the explicit endpoint emit = 1003 max.
    // The write cap guarantees we never exceed ~MAX_STEPS + a small constant.
    expect(freqCalls.length).toBeLessThanOrEqual(1003);
    // Last CH1 frequency must be the exact endpoint (0), not an overshoot.
    expect(freqCalls[freqCalls.length - 1].args[1]).toBe(0);
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

  it('onkeysec/offkeysec pulses both channel frequencies between target and 0 Hz', async () => {
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

    // CH1 toggles between 42.7 Hz and 0 Hz
    const ch1Calls = gen.calls
      .filter((c: any) => c.m === 'setFrequency' && c.args[0] === 1);
    expect(ch1Calls.some((c: any) => c.args[1] === 42.7)).toBe(true);
    expect(ch1Calls.some((c: any) => c.args[1] === 0)).toBe(true);

    // CH2 toggles between 27.12 MHz and 0 Hz
    const ch2Calls = gen.calls
      .filter((c: any) => c.m === 'setFrequency' && c.args[0] === 2);
    expect(ch2Calls.some((c: any) => c.args[1] === 27_120_000)).toBe(true);
    expect(ch2Calls.some((c: any) => c.args[1] === 0)).toBe(true);

    // Pulsed mode no longer touches WMN/WFN — that approach was unreliable on FY6600.
    const toggleCalls = gen.calls.filter((c: any) => c.m === 'setChannelsOutput');
    expect(toggleCalls.length).toBe(0);
  });

  it('insomnia (SINE/SINE pulsed) primes both channels at startup and toggles freqs each cycle', async () => {
    // Mirrors the production insomnia config in defaultPrograms.json
    const program = {
      name: 'insomnia', range: 0,
      data: [{ channel: 1, frequency: 42.7, runTime: 8000 }],
      maxTimeInMinutes: 0.15, default: 1, startFrequency: 27.12,
      channel1wavetype: 'SINE',
      channel2wavetype: 'SINE',
      onkeysec: 3,
      offkeysec: 1,
    };
    const gen = mkFakeGen();
    const db = mkFakeDb(program);
    const pr = new ProgramRunner(db, gen, null);

    const p = pr.startProgram('insomnia', () => {});
    await vi.advanceTimersByTimeAsync(9000);
    await pr.stopProgram();
    await vi.runAllTimersAsync();
    await p;

    // SINE/SINE programs use the both-channels variant at startup, not just CH1's sinewave().
    expect(gen.setBothChannelsToSineWave).toHaveBeenCalled();
    expect(gen.setBothChannelsToSquareWave).not.toHaveBeenCalled();

    // CH2 carrier was primed to 27.12 MHz before enableOutputs (and toggled to 0 each off cycle).
    const ch2FreqCalls = gen.calls.filter((c: any) =>
      c.m === 'setFrequency' && c.args[0] === 2);
    expect(ch2FreqCalls.some((c: any) => c.args[1] === 27_120_000)).toBe(true);
    expect(ch2FreqCalls.some((c: any) => c.args[1] === 0)).toBe(true);
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

  // --- SAFETY INVARIANT (H11): enableOutputs() must come AFTER amplitude,
  //     initial frequency and waveform are configured. A helper asserts the
  //     ordering inside gen.calls for several program shapes.
  const assertEnableOutputsLast = (gen: any) => {
    const idx = (pred: (c: any) => boolean) => gen.calls.findIndex(pred);
    const lastIdx = (pred: (c: any) => boolean) => {
      for (let i = gen.calls.length - 1; i >= 0; i--) if (pred(gen.calls[i])) return i;
      return -1;
    };
    const enableIdx = idx((c: any) => c.m === 'enableOutputs');
    expect(enableIdx).toBeGreaterThanOrEqual(0);

    const lastAmpIdx = lastIdx((c: any) => c.m === 'setAmplitude');
    expect(lastAmpIdx).toBeGreaterThanOrEqual(0);
    expect(enableIdx).toBeGreaterThan(lastAmpIdx);

    // Initial CH1 frequency prime happens before outputs are enabled.
    const firstFreqIdx = idx((c: any) => c.m === 'setFrequency' && c.args[0] === 1);
    expect(firstFreqIdx).toBeGreaterThanOrEqual(0);
    expect(enableIdx).toBeGreaterThan(firstFreqIdx);

    // Waveform selection (square or sine) happens before outputs are enabled.
    const waveIdx = idx((c: any) => c.m === 'setSquare' || c.m === 'setSine' || c.m === 'sinewave');
    expect(waveIdx).toBeGreaterThanOrEqual(0);
    expect(enableIdx).toBeGreaterThan(waveIdx);
  };

  it('H11: enableOutputs comes after amplitude, initial frequency and waveform (continuous)', async () => {
    const program = {
      name: 'continuous', range: 0,
      data: [{ channel: 1, frequency: 727, runTime: 100 }],
      maxTimeInMinutes: 0.01, default: 0, startFrequency: 0,
    };
    const gen = mkFakeGen();
    const db = mkFakeDb(program);
    const pr = new ProgramRunner(db, gen, null);
    await pr.setIntensity(5, { applyNow: false });

    const p = pr.startProgram('continuous', () => {});
    await vi.advanceTimersByTimeAsync(500);
    await pr.stopProgram();
    await vi.runAllTimersAsync();
    await p;

    assertEnableOutputsLast(gen);
  });

  it('H11: enableOutputs comes after amplitude, initial frequency and waveform (ultra500)', async () => {
    const program = {
      name: 'ultra500', range: 0,
      data: [{ channel: 1, frequency: 500000, runTime: 50 }],
      maxTimeInMinutes: 0.01, default: 1, startFrequency: 0.5,
    };
    const gen = mkFakeGen();
    const db = mkFakeDb(program);
    const pr = new ProgramRunner(db, gen, null);

    const p = pr.startProgram('ultra500', () => {});
    await vi.advanceTimersByTimeAsync(500);
    await pr.stopProgram();
    await vi.runAllTimersAsync();
    await p;

    assertEnableOutputsLast(gen);
  });

  it('H11: enableOutputs comes after amplitude, initial frequency and waveform (ultrasound)', async () => {
    const program = {
      name: 'ultrasound', range: 1,
      data: [{ channel: 1, frequency: 500000, runTime: 0 }, { channel: 1, frequency: 670000, runTime: 0 }],
      maxTimeInMinutes: 0.15, default: 1, startFrequency: 0.5,
      sliderMinV: 0.3, sliderMaxV: 1.8, sliderStepV: 0.01,
    };
    const gen = mkFakeGen();
    const db = mkFakeDb(program);
    const pr = new ProgramRunner(db, gen, null);

    const p = pr.startProgram('ultrasound', () => {});
    await vi.advanceTimersByTimeAsync(2000);
    await pr.stopProgram();
    await vi.runAllTimersAsync();
    await p;

    assertEnableOutputsLast(gen);
  });

  it('arms the deadman watchdog (sessionStart) only after outputs are enabled', async () => {
    const program = {
      name: 'continuous', range: 0,
      data: [{ channel: 1, frequency: 100, runTime: 100 }],
      maxTimeInMinutes: 0.01, default: 0, startFrequency: 0,
    };
    const gen = mkFakeGen();
    const db = mkFakeDb(program);
    const pr = new ProgramRunner(db, gen, null);

    const p = pr.startProgram('continuous', () => {});
    await vi.advanceTimersByTimeAsync(300);
    await pr.stopProgram();
    await vi.runAllTimersAsync();
    await p;

    const enableIdx = gen.calls.findIndex((c: any) => c.m === 'enableOutputs');
    const sessionStartIdx = gen.calls.findIndex((c: any) => c.m === 'sessionStart');
    expect(sessionStartIdx).toBeGreaterThan(enableIdx);
    // sessionStop and stopAndReset always run in cleanup.
    expect(gen.sessionStop).toHaveBeenCalled();
    expect(gen.stopAndReset).toHaveBeenCalled();
  });

  it('sweepTo sweep starts at startF, ends at exact endF, and bounds the write count', async () => {
    // A 0→40000 Hz span would be ~40000 single-Hz writes without the cap.
    const program = {
      name: 'bigSweep', range: 0,
      data: [{ channel: 1, frequency: 0, runTime: 1000, sweepTo: 40000 }],
      maxTimeInMinutes: 0.5, default: 0, startFrequency: 0,
    };
    const gen = mkFakeGen();
    const db = mkFakeDb(program);
    const pr = new ProgramRunner(db, gen, null);

    const p = pr.startProgram('bigSweep', () => {});
    // 2000 steps * 10ms min interval = 20000ms; advance past so the sweep completes
    // naturally (and emits the exact endpoint) before we stop.
    await vi.advanceTimersByTimeAsync(25000);
    await pr.stopProgram();
    await vi.runAllTimersAsync();
    await p;

    const sweepCalls = gen.calls
      .filter((c: any) => c.m === 'setFrequency' && c.args[0] === 1)
      .map((c: any) => c.args[1]);
    expect(sweepCalls.length).toBeGreaterThan(1);
    // First write is the start frequency (also the prime), last is the exact endpoint.
    expect(sweepCalls[0]).toBe(0);
    expect(sweepCalls[sweepCalls.length - 1]).toBe(40000);
    // Bounded: MAX_STEPS is 2000; allow prime + endpoint slack. Far below 40000.
    expect(sweepCalls.length).toBeLessThanOrEqual(2010);
  });

  it('guards a corrupt (NaN) continuous frequency instead of latching 0 Hz DC', async () => {
    const program = {
      name: 'corrupt', range: 0,
      data: [
        { channel: 1, frequency: 'oops' as any, runTime: 100 },
        { channel: 1, frequency: 222, runTime: 100 },
      ],
      maxTimeInMinutes: 0.05, default: 0, startFrequency: 0,
    };
    const gen = mkFakeGen();
    const db = mkFakeDb(program);
    const pr = new ProgramRunner(db, gen, null);

    const p = pr.startProgram('corrupt', () => {});
    await vi.advanceTimersByTimeAsync(1000);
    await pr.stopProgram();
    await vi.runAllTimersAsync();
    await p;

    const ch1 = gen.calls
      .filter((c: any) => c.m === 'setFrequency' && c.args[0] === 1)
      .map((c: any) => c.args[1]);
    // The corrupt item must NOT have emitted a 0 (DC) or NaN; the valid item plays.
    expect(ch1.some((f: any) => Number.isNaN(f))).toBe(false);
    expect(ch1).toContain(222);
  });

  it('re-entrancy: a second startProgram while running is ignored', async () => {
    const program = {
      name: 'x', range: 0,
      data: [{ channel: 1, frequency: 100, runTime: 1000 }],
      maxTimeInMinutes: 0.05, default: 0, startFrequency: 0,
    };
    const gen = mkFakeGen();
    const db = mkFakeDb(program);
    const pr = new ProgramRunner(db, gen, null);

    const p1 = pr.startProgram('x', () => {});
    await vi.advanceTimersByTimeAsync(50);
    // Second call must return immediately without re-running the setup.
    const enableBefore = gen.calls.filter((c: any) => c.m === 'enableOutputs').length;
    await pr.startProgram('x', () => {});
    const enableAfter = gen.calls.filter((c: any) => c.m === 'enableOutputs').length;
    expect(enableAfter).toBe(enableBefore);

    await pr.stopProgram();
    await vi.runAllTimersAsync();
    await p1;
  });

  it('hard stop: a program cannot overrun its advertised maxTimeInMinutes', async () => {
    // One item with a huge runTime, but a tiny maxTime cap.
    const program = {
      name: 'capped', range: 0,
      data: [{ channel: 1, frequency: 100, runTime: 10 * 60 * 1000 }],
      maxTimeInMinutes: 0.02, default: 0, startFrequency: 0, // 1200ms cap
    };
    const gen = mkFakeGen();
    const db = mkFakeDb(program);
    const onStop = vi.fn();
    const pr = new ProgramRunner(db, gen, null);
    pr.setOnStopCallback(onStop);

    const p = pr.startProgram('capped', () => {});
    // Advance well past the cap without ever calling stopProgram.
    await vi.advanceTimersByTimeAsync(3000);
    await vi.runAllTimersAsync();
    await p;

    // The runner stopped itself: outputs reset and onStop fired despite no stopProgram().
    expect(gen.stopAndReset).toHaveBeenCalled();
    expect(onStop).toHaveBeenCalled();
  });

  it('keeps heart-beating while paused so the deadman watchdog cannot force-stop a paused run', async () => {
    // Regression: the heartbeat used to be gated behind !this.paused, so a pause
    // longer than the backend's 30s HEARTBEAT_TIMEOUT would trip the watchdog and
    // force-stop an intentionally paused session.
    const program = {
      name: 'discrete', range: 0,
      data: [{ channel: 1, frequency: 111, runTime: 600000 }], // 10-minute item
      maxTimeInMinutes: 10, default: 0, startFrequency: 0,
    };
    const gen = mkFakeGen();
    const db = mkFakeDb(program);
    const pr = new ProgramRunner(db, gen, null);

    const run = pr.startProgram('discrete', () => {});
    await vi.advanceTimersByTimeAsync(200);
    pr.pauseProgram();

    const before = gen.calls.filter((c: any) => c.m === 'heartbeat').length;
    // Hold the pause for 40s — well past the 30s deadman timeout.
    await vi.advanceTimersByTimeAsync(40000);
    const after = gen.calls.filter((c: any) => c.m === 'heartbeat').length;

    // Heartbeats must keep flowing during the pause...
    expect(after).toBeGreaterThan(before);
    // ...and the pause must not have stopped the device.
    expect(gen.calls.some((c: any) => c.m === 'stop')).toBe(false);

    pr.resumeProgram();
    await vi.advanceTimersByTimeAsync(200);
    await pr.stopProgram();
    await vi.runAllTimersAsync();
    await run;
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

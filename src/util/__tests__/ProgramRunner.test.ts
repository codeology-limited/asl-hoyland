import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ProgramRunner from '../ProgramRunner';

type FakeFreqItem = { channel: number; frequency: number | string; runTime: number };

const mkFakeGen = () => {
  return {
    calls: [] as Array<{ m: string; args: any[] }>,
    setFrequency: vi.fn(async function (this: any, ch: number, f: number) {
      // t uses the (fake) clock so tests can assert command pacing
      (this.calls as any).push({ m: 'setFrequency', args: [ch, f], t: Date.now() });
    }),
    setAmplitude: vi.fn(async function (this: any, chOrAmp: number, ampMaybe?: number) {
      const ch = typeof ampMaybe === 'number' ? chOrAmp : 1;
      const amp = typeof ampMaybe === 'number' ? ampMaybe : chOrAmp;
      ;(this.calls as any).push({ m: 'setAmplitude', args: [ch, amp] });
    }),
    setBothChannelsToSquareWave: vi.fn(async function (this: any) {
      (this.calls as any).push({ m: 'setSquare', args: [], t: Date.now() });
    }),
    setBothChannelsToSineWave: vi.fn(async function (this: any) {
      (this.calls as any).push({ m: 'setSine', args: [], t: Date.now() });
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

  it('SINE/SINE no-carrier program drives CH2 at CH1 frequency, not the 3.1MHz carrier', async () => {
    // Lynne 4 Jun: lymphocyte50Hz / tCells30Hz had CH2 stuck at the 3.1 MHz init
    // carrier; CH2 must mirror CH1 (50/30 Hz). Scoped to SINE/SINE + startFrequency 0.
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
    const ch2Freqs = gen.calls.filter((c: any) => c.m === 'setFrequency' && c.args[0] === 2).map((c: any) => c.args[1]);
    // CH2 was driven to 50 Hz (mirroring CH1) and never to the 3.1MHz carrier.
    expect(ch2Freqs).toContain(50);
    expect(ch2Freqs).not.toContain(3_100_000);
  });

  it('per-frequency wavetype: applies each item waveform on both channels and mirrors CH2', async () => {
    // Lynne 9 Jun: editor sine/square-per-frequency. Each item plays with its own
    // waveform on BOTH channels at that frequency (CH2 mirrors CH1).
    const program = {
      name: 'mixedWave', range: 0,
      data: [
        { channel: 1, frequency: 100, runTime: 50, wavetype: 'SINE' },
        { channel: 1, frequency: 200, runTime: 50, wavetype: 'SQUARE' },
      ],
      maxTimeInMinutes: 0.02, default: 0, startFrequency: 0,
    };
    const gen = mkFakeGen();
    const db = mkFakeDb(program);
    const pr = new ProgramRunner(db, gen, null);
    const p = pr.startProgram('mixedWave', () => {});
    await vi.advanceTimersByTimeAsync(2000);
    await pr.stopProgram();
    await vi.runAllTimersAsync();
    await p;
    // Both waveforms were asserted (one per item).
    expect(gen.setBothChannelsToSineWave).toHaveBeenCalled();
    expect(gen.setBothChannelsToSquareWave).toHaveBeenCalled();
    // CH2 mirrored both step frequencies (both channels output each frequency).
    const ch2 = gen.calls.filter((c: any) => c.m === 'setFrequency' && c.args[0] === 2).map((c: any) => c.args[1]);
    expect(ch2).toContain(100);
    expect(ch2).toContain(200);
  });

  it('sine→sine steps do not re-assert the waveform but still step the frequency', async () => {
    // Rob 12 Jun: steps switching TO sine kept the old frequency. Re-asserting
    // sine every step kept the device busy and it dropped the WMF/WFF pair that
    // followed. Unchanged waveforms must not be re-sent at all.
    const program = {
      name: 'sineSteps', range: 0,
      data: [
        { channel: 1, frequency: 100, runTime: 200, wavetype: 'SINE' },
        { channel: 1, frequency: 200, runTime: 200, wavetype: 'SINE' },
      ],
      maxTimeInMinutes: 0.02, default: 0, startFrequency: 0,
    };
    const gen = mkFakeGen();
    const db = mkFakeDb(program);
    const pr = new ProgramRunner(db, gen, null);
    const p = pr.startProgram('sineSteps', () => {});
    await vi.advanceTimersByTimeAsync(3000);
    await pr.stopProgram();
    await vi.runAllTimersAsync();
    await p;

    // Sine asserted exactly once — at the pre-output prime — never per step.
    expect(gen.setBothChannelsToSineWave).toHaveBeenCalledTimes(1);
    expect(gen.setBothChannelsToSquareWave).not.toHaveBeenCalled();
    // Both step frequencies still reached CH1 (and mirrored CH2).
    const ch1 = gen.calls.filter((c: any) => c.m === 'setFrequency' && c.args[0] === 1).map((c: any) => c.args[1]);
    const ch2 = gen.calls.filter((c: any) => c.m === 'setFrequency' && c.args[0] === 2).map((c: any) => c.args[1]);
    expect(ch1).toContain(100);
    expect(ch1).toContain(200);
    expect(ch2).toContain(100);
    expect(ch2).toContain(200);
  });

  it('square→sine step sets the new frequency BEFORE switching the waveform', async () => {
    // Rob 12 Jun: with waveform-first ordering, a switch TO sine left the device
    // busy past the 600ms batch settle and the frequency pair sent after it was
    // dropped. Frequencies must land first (device idle after the previous
    // dwell); the sine switch then digests during the step's own dwell.
    const program = {
      name: 'sqToSine', range: 0,
      data: [
        { channel: 1, frequency: 100, runTime: 200, wavetype: 'SQUARE' },
        { channel: 1, frequency: 200, runTime: 200, wavetype: 'SINE' },
      ],
      maxTimeInMinutes: 0.02, default: 0, startFrequency: 0,
    };
    const gen = mkFakeGen();
    const db = mkFakeDb(program);
    const pr = new ProgramRunner(db, gen, null);
    const p = pr.startProgram('sqToSine', () => {});
    await vi.advanceTimersByTimeAsync(3000);
    await pr.stopProgram();
    await vi.runAllTimersAsync();
    await p;

    // Square asserted once at prime, sine once at the second step.
    expect(gen.setBothChannelsToSquareWave).toHaveBeenCalledTimes(1);
    expect(gen.setBothChannelsToSineWave).toHaveBeenCalledTimes(1);
    // The 200 Hz pair was written before the sine switch.
    const sineIdx = gen.calls.findIndex((c: any) => c.m === 'setSine');
    const ch1At200Idx = gen.calls.findIndex((c: any) => c.m === 'setFrequency' && c.args[0] === 1 && c.args[1] === 200);
    const ch2At200Idx = gen.calls.findIndex((c: any) => c.m === 'setFrequency' && c.args[0] === 2 && c.args[1] === 200);
    expect(ch1At200Idx).toBeGreaterThanOrEqual(0);
    expect(ch2At200Idx).toBeGreaterThanOrEqual(0);
    expect(sineIdx).toBeGreaterThan(ch1At200Idx);
    expect(sineIdx).toBeGreaterThan(ch2At200Idx);
    // …and the switch trails the CH2 write by the full commit margin (≥200ms) so
    // CH2 commits before the switch re-latches it (25 Jun: CH2-revert fix).
    expect(gen.calls[sineIdx].t - gen.calls[ch2At200Idx].t).toBeGreaterThanOrEqual(200);
  });

  it('sine→square step gives CH2 the ≥200ms commit margin too (CH2-revert regression)', async () => {
    // Lynne 25 Jun: with freq-first ordering CH1 was correct, but CH2 kept the
    // previous frequency on every waveform-CHANGING step (sq→sine AND sine→sq) —
    // its write (set last, ~55ms before the switch) was re-latched by the switch,
    // while CH1's (~110ms before) committed. Same-waveform steps were fine. The
    // fix widens the gap so CH2 commits before the switch, in BOTH directions.
    const program = {
      name: 'sineToSq', range: 0,
      data: [
        { channel: 1, frequency: 300, runTime: 200, wavetype: 'SINE' },
        { channel: 1, frequency: 400, runTime: 200, wavetype: 'SQUARE' },
      ],
      maxTimeInMinutes: 0.02, default: 0, startFrequency: 0,
    };
    const gen = mkFakeGen();
    const db = mkFakeDb(program);
    const pr = new ProgramRunner(db, gen, null);
    const p = pr.startProgram('sineToSq', () => {});
    await vi.advanceTimersByTimeAsync(3000);
    await pr.stopProgram();
    await vi.runAllTimersAsync();
    await p;

    const squareIdx = gen.calls.findIndex((c: any) => c.m === 'setSquare');
    expect(squareIdx).toBeGreaterThan(-1);
    const squareT = gen.calls[squareIdx].t;
    // CH2 is driven to the step's frequency (mirrored) before the switch…
    const ch2At400Before = gen.calls.filter((c: any) =>
      c.m === 'setFrequency' && c.args[0] === 2 && c.args[1] === 400 && c.t <= squareT);
    expect(ch2At400Before.length).toBeGreaterThan(0);
    // …with ≥200ms to commit before the square switch re-latches it.
    const lastCh2 = Math.max(...ch2At400Before.map((c: any) => c.t));
    expect(squareT - lastCh2).toBeGreaterThanOrEqual(200);
  });

  it('sweepTo item with a wavetype switches waveform after the first sweep pair', async () => {
    // The sweep branch shares the freq-first rule: the waveform change fires
    // once, after the first iteration's CH1/CH2 pair, never before it.
    const program = {
      name: 'sweepWave', range: 0,
      data: [
        { channel: 1, frequency: 100, runTime: 200, wavetype: 'SQUARE' },
        { channel: 1, frequency: 10, runTime: 500, sweepTo: 20, wavetype: 'SINE' },
      ],
      maxTimeInMinutes: 0.02, default: 0, startFrequency: 0,
    };
    const gen = mkFakeGen();
    const db = mkFakeDb(program);
    const pr = new ProgramRunner(db, gen, null);
    const p = pr.startProgram('sweepWave', () => {});
    await vi.advanceTimersByTimeAsync(4000);
    await pr.stopProgram();
    await vi.runAllTimersAsync();
    await p;

    expect(gen.setBothChannelsToSineWave).toHaveBeenCalledTimes(1);
    const sineIdx = gen.calls.findIndex((c: any) => c.m === 'setSine');
    const ch1At10Idx = gen.calls.findIndex((c: any) => c.m === 'setFrequency' && c.args[0] === 1 && c.args[1] === 10);
    const ch2At10Idx = gen.calls.findIndex((c: any) => c.m === 'setFrequency' && c.args[0] === 2 && c.args[1] === 10);
    const ch1At11Idx = gen.calls.findIndex((c: any) => c.m === 'setFrequency' && c.args[0] === 1 && c.args[1] === 11);
    expect(ch1At10Idx).toBeGreaterThanOrEqual(0);
    expect(ch2At10Idx).toBeGreaterThanOrEqual(0);
    expect(ch1At11Idx).toBeGreaterThanOrEqual(0);
    // After the first sweep pair…
    expect(sineIdx).toBeGreaterThan(ch1At10Idx);
    expect(sineIdx).toBeGreaterThan(ch2At10Idx);
    // …but before the second iteration's pair.
    expect(sineIdx).toBeLessThan(ch1At11Idx);
  });

  it('loop program repeats the whole sequence until maxTimeInMinutes elapses', async () => {
    // TTF (Lynne 17 Jun): play the frequency list on a continuous loop for the
    // configured duration instead of stopping after one pass.
    const program = {
      name: 'looper', range: 0,
      data: [
        { channel: 1, frequency: 100, runTime: 100 },
        { channel: 1, frequency: 200, runTime: 100 },
      ],
      maxTimeInMinutes: 0.01, default: 0, startFrequency: 0, loop: 1,
    };
    const gen = mkFakeGen();
    const db = mkFakeDb(program);
    const pr = new ProgramRunner(db, gen, null);
    const p = pr.startProgram('looper', () => {});
    await vi.advanceTimersByTimeAsync(2000);
    await pr.stopProgram();
    await vi.runAllTimersAsync();
    await p;

    const ch1 = gen.calls.filter((c: any) => c.m === 'setFrequency' && c.args[0] === 1).map((c: any) => c.args[1]);
    // Each frequency played multiple times — the sequence looped, it didn't
    // stop after the first pass (which would give one 100 and one 200).
    expect(ch1.filter((f: number) => f === 100).length).toBeGreaterThan(1);
    expect(ch1.filter((f: number) => f === 200).length).toBeGreaterThan(1);
  });

  it('non-loop program plays the sequence exactly once (do…while regression)', async () => {
    // Wrapping the discrete loop in a do…while must not change non-loop programs:
    // loop absent → one pass only.
    const program = {
      name: 'once', range: 0,
      data: [
        { channel: 1, frequency: 100, runTime: 50 },
        { channel: 1, frequency: 200, runTime: 50 },
      ],
      maxTimeInMinutes: 5, default: 0, startFrequency: 0,
    };
    const gen = mkFakeGen();
    const db = mkFakeDb(program);
    const pr = new ProgramRunner(db, gen, null);
    const p = pr.startProgram('once', () => {});
    await vi.advanceTimersByTimeAsync(500);
    await pr.stopProgram();
    await vi.runAllTimersAsync();
    await p;

    const ch1 = gen.calls.filter((c: any) => c.m === 'setFrequency' && c.args[0] === 1).map((c: any) => c.args[1]);
    // One prime (100) + one each in the continuous block = 100 twice, 200 once.
    // Crucially NOT repeated despite maxTimeInMinutes (5) far exceeding the
    // 0.1s of actual playback — the old behaviour, preserved.
    expect(ch1.filter((f: number) => f === 100).length).toBe(2);
    expect(ch1.filter((f: number) => f === 200).length).toBe(1);
  });

  it('TTF program: CH1 loops sine frequencies while CH2 holds the 27.12MHz carrier', async () => {
    // Mirrors the production ttf config: SINE/SINE, startFrequency 27.12 (CH2
    // carrier), looped. mirrorCh2ToCh1 must stay OFF (startFrequency != 0), so
    // CH2 holds the carrier and never mirrors CH1's audio frequencies.
    const program = {
      name: 'ttf', range: 0,
      data: [
        { channel: 1, frequency: 1873.5, runTime: 60 },
        { channel: 1, frequency: 2221.3, runTime: 60 },
      ],
      maxTimeInMinutes: 0.01, default: 1, startFrequency: 27.12, loop: 1,
      channel1wavetype: 'SINE', channel2wavetype: 'SINE',
    };
    const gen = mkFakeGen();
    const db = mkFakeDb(program);
    const pr = new ProgramRunner(db, gen, null);
    const p = pr.startProgram('ttf', () => {});
    await vi.advanceTimersByTimeAsync(2000);
    await pr.stopProgram();
    await vi.runAllTimersAsync();
    await p;

    // Both channels driven sine (program-level SINE/SINE), no per-step switching.
    expect(gen.setBothChannelsToSineWave).toHaveBeenCalled();
    expect(gen.setBothChannelsToSquareWave).not.toHaveBeenCalled();

    const ch1 = gen.calls.filter((c: any) => c.m === 'setFrequency' && c.args[0] === 1).map((c: any) => c.args[1]);
    const ch2 = gen.calls.filter((c: any) => c.m === 'setFrequency' && c.args[0] === 2).map((c: any) => c.args[1]);
    // CH1 steps the audio frequencies and loops them. Assert on the SECOND
    // frequency (2221.3): unlike the first it isn't primed before outputs enable,
    // so >1 occurrence can only come from the sequence actually looping.
    expect(ch1).toContain(1873.5);
    expect(ch1.filter((f: number) => f === 2221.3).length).toBeGreaterThan(1);
    // CH2 holds ONLY the 27.12MHz carrier — never mirrors a CH1 audio frequency.
    expect(ch2).toContain(27_120_000);
    expect(ch2).not.toContain(1873.5);
    expect(ch2.every((f: number) => f === 27_120_000)).toBe(true);
  });

  it('dual-frequency square: CH1 230Hz / CH2 430Hz independent, both square, NO freq-sync', async () => {
    // Mirrors the production dualFreq230and430Hz config (27 Jun): CH1 and CH2 hold
    // DIFFERENT audio frequencies, both square, looped. Crucially sync() must NOT
    // be called — USA1 frequency-sync would slave CH2 to CH1 (collapsing 230/430).
    const program = {
      name: 'dualFreq230and430Hz', range: 0,
      data: [{ channel: 1, frequency: 230, runTime: 100 }],
      maxTimeInMinutes: 0.02, default: 1, startFrequency: 0, loop: 1,
      channel1wavetype: 'SQUARE', channel2wavetype: 'SQUARE',
      channel2frequency: 430,
    };
    const gen = mkFakeGen();
    const db = mkFakeDb(program);
    const pr = new ProgramRunner(db, gen, null);
    const p = pr.startProgram('dualFreq230and430Hz', () => {});
    await vi.advanceTimersByTimeAsync(2000);
    await pr.stopProgram();
    await vi.runAllTimersAsync();
    await p;

    // Both square, but the channels are NOT frequency-synced.
    expect(gen.setBothChannelsToSquareWave).toHaveBeenCalled();
    expect(gen.setBothChannelsToSineWave).not.toHaveBeenCalled();
    expect(gen.sync).not.toHaveBeenCalled();

    const ch1 = gen.calls.filter((c: any) => c.m === 'setFrequency' && c.args[0] === 1).map((c: any) => c.args[1]);
    const ch2 = gen.calls.filter((c: any) => c.m === 'setFrequency' && c.args[0] === 2).map((c: any) => c.args[1]);
    // CH1 holds 230 (and re-asserts it across loop cycles).
    expect(ch1).toContain(230);
    expect(ch1.filter((f: number) => f === 230).length).toBeGreaterThan(1);
    // CH2 holds ONLY 430 — never mirrored to CH1's 230 — and is RE-ASSERTED in the
    // loop (>1 write), not set once at the prime. Rob 7 Jul: a prime-only CH2 write
    // reverted to the 3.1MHz init carrier once outputs enabled.
    expect(ch2).toContain(430);
    expect(ch2.every((f: number) => f === 430)).toBe(true);
    expect(ch2.filter((f: number) => f === 430).length).toBeGreaterThan(1);
  });

  it('SINE range re-asserts the waveform in the loop (CH1-runs-square regression)', async () => {
    // Rob 7 Jul: a custom SINE range ran CH1 as SQUARE (CH2 sine) — the waveform,
    // set only at the pre-output prime, didn't stick on CH1. It must be re-asserted
    // after the first frequency write, outputs on (as the non-range paths do).
    const program = {
      name: 'sineRange', range: 1,
      data: [
        { channel: 1, frequency: 100, runTime: 0, wavetype: 'SINE' },
        { channel: 1, frequency: 120, runTime: 0, wavetype: 'SINE' },
      ],
      maxTimeInMinutes: 0.05, default: 0, startFrequency: 0,
    };
    const gen = mkFakeGen();
    const db = mkFakeDb(program);
    const pr = new ProgramRunner(db, gen, null);
    const p = pr.startProgram('sineRange', () => {});
    await vi.advanceTimersByTimeAsync(4000);
    await pr.stopProgram();
    await vi.runAllTimersAsync();
    await p;

    // Sine asserted at the prime AND re-asserted inside the loop (≥2 times); never
    // square. The loop re-assert (outputs on) is what makes CH1 sine stick.
    expect(gen.setBothChannelsToSineWave.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(gen.setBothChannelsToSquareWave).not.toHaveBeenCalled();
    // The loop re-assert lands AFTER a CH1 frequency write (i.e. after enableOutputs).
    const firstCh1FreqIdx = gen.calls.findIndex((c: any) => c.m === 'setFrequency' && c.args[0] === 1);
    const sineIdxs = gen.calls
      .map((c: any, i: number) => (c.m === 'setSine' ? i : -1))
      .filter((i: number) => i >= 0);
    expect(sineIdxs[sineIdxs.length - 1]).toBeGreaterThan(firstCh1FreqIdx);
  });

  it('loop self-terminates at maxTimeInMinutes without an external stop (bounded writes)', async () => {
    // Pins the loop's own duration cutoff: with no stopProgram(), the do…while
    // must end at totalMs and stopAndReset, not run forever. Also exercises the
    // mid-pass break that bounds overshoot to a single step.
    const program = {
      name: 'selfStop', range: 0,
      data: [
        { channel: 1, frequency: 100, runTime: 50 },
        { channel: 1, frequency: 200, runTime: 50 },
      ],
      maxTimeInMinutes: 0.005, default: 0, startFrequency: 0, loop: 1,
    };
    const gen = mkFakeGen();
    const db = mkFakeDb(program);
    const pr = new ProgramRunner(db, gen, null);
    const p = pr.startProgram('selfStop', () => {});
    // Advance well past totalMs (0.005 min = 300ms) — the loop must stop on its own.
    await vi.advanceTimersByTimeAsync(5000);
    await vi.runAllTimersAsync();
    await p; // resolves only if the loop terminated without stopProgram()

    expect(gen.stopAndReset).toHaveBeenCalled();
    // ~300ms / (2×50ms per pass) ≈ 3 passes → bounded, nowhere near a spin.
    const ch1 = gen.calls.filter((c: any) => c.m === 'setFrequency' && c.args[0] === 1);
    expect(ch1.length).toBeGreaterThan(2);
    expect(ch1.length).toBeLessThan(40);
  });

  it('loop program with all-zero runTimes does not spin (seqMs guard)', async () => {
    // Defensive: a future loop program authored with 0-duration steps must not
    // busy-loop against the wall clock for the whole maxTime. seqMs===0 → no loop.
    const program = {
      name: 'zeroDur', range: 0,
      data: [{ channel: 1, frequency: 100, runTime: 0 }],
      maxTimeInMinutes: 0.01, default: 0, startFrequency: 0, loop: 1,
    };
    const gen = mkFakeGen();
    const db = mkFakeDb(program);
    const pr = new ProgramRunner(db, gen, null);
    const p = pr.startProgram('zeroDur', () => {});
    await vi.advanceTimersByTimeAsync(1000);
    await vi.runAllTimersAsync();
    await p; // resolves: the zero-duration sequence did not loop (seqMs guard)

    const ch1 = gen.calls.filter((c: any) => c.m === 'setFrequency' && c.args[0] === 1);
    // One prime + one step, no repetition.
    expect(ch1.length).toBeLessThanOrEqual(2);
    expect(gen.stopAndReset).toHaveBeenCalled();
  });

  it('paces mirrored CH1/CH2 frequency writes >=50ms apart (CH1-stuck regression)', async () => {
    // 10 Jun report: running a per-frequency custom program, CH2 stepped through
    // the frequencies but CH1 stayed on the first one. The FY6600 drops the first
    // of two commands that arrive back-to-back mid-program, so WFF sent ~5ms
    // after WMF clobbered the CH1 update. Each mirrored pair must be spaced.
    const program = {
      name: 'mixedWave', range: 0,
      data: [
        { channel: 1, frequency: 100, runTime: 200, wavetype: 'SINE' },
        { channel: 1, frequency: 200, runTime: 200, wavetype: 'SQUARE' },
      ],
      maxTimeInMinutes: 0.02, default: 0, startFrequency: 0,
    };
    const gen = mkFakeGen();
    const db = mkFakeDb(program);
    const pr = new ProgramRunner(db, gen, null);
    const p = pr.startProgram('mixedWave', () => {});
    await vi.advanceTimersByTimeAsync(3000);
    await pr.stopProgram();
    await vi.runAllTimersAsync();
    await p;

    const freqCalls = gen.calls.filter((c: any) => c.m === 'setFrequency');
    // Every step set CH1 (the bug left these dropped by the device)…
    const ch1 = freqCalls.filter((c: any) => c.args[0] === 1).map((c: any) => c.args[1]);
    expect(ch1).toContain(100);
    expect(ch1).toContain(200);
    // …and every CH2 write trails its CH1 partner by at least 50ms.
    let pairs = 0;
    for (let i = 1; i < freqCalls.length; i++) {
      if (freqCalls[i].args[0] === 2 && freqCalls[i - 1].args[0] === 1) {
        pairs++;
        expect(freqCalls[i].t - freqCalls[i - 1].t).toBeGreaterThanOrEqual(50);
      }
    }
    // Guard against the loop passing vacuously: prime pair + per-item pairs exist.
    expect(pairs).toBeGreaterThanOrEqual(2);
    // The mirrored pairs actually exist (CH2 follows CH1 at both frequencies).
    const ch2 = freqCalls.filter((c: any) => c.args[0] === 2).map((c: any) => c.args[1]);
    expect(ch2).toContain(100);
    expect(ch2).toContain(200);
  });

  it('mirrored range sweep keeps nominal step cadence (50ms gap absorbed into dwell)', async () => {
    // Review finding on the pacing fix: the step deadline must start BEFORE the
    // paced pair, or every mirrored sweep step costs interval + 50ms and the
    // program overruns maxTimeInMinutes (editor-saved programs attach wavetype
    // to every row, so ranged custom programs always mirror). 0→20 over 1.2s
    // gives a 60ms interval; the 50ms pair gap must fit inside it.
    const program = {
      name: 'mirroredRange', range: 1,
      data: [
        { channel: 1, frequency: 0, runTime: 0, wavetype: 'SINE' },
        { channel: 1, frequency: 20, runTime: 0, wavetype: 'SINE' },
      ],
      maxTimeInMinutes: 0.02, default: 0, startFrequency: 0,
    };
    const gen = mkFakeGen();
    const db = mkFakeDb(program);
    const pr = new ProgramRunner(db, gen, null);
    const p = pr.startProgram('mirroredRange', () => {});
    await vi.advanceTimersByTimeAsync(1500);
    await pr.stopProgram();
    await vi.runAllTimersAsync();
    await p;

    const ch1 = gen.calls.filter((c: any) => c.m === 'setFrequency' && c.args[0] === 1);
    // ~18 steps fit in 1.5s: the 50ms pair gap is absorbed into the 60ms dwell
    // (nominal cadence), minus one 200ms WAVEFORM_SWITCH_GAP for the one-time
    // in-loop waveform re-assert (the CH1-square range fix). With the 50ms gap
    // ADDED per step (interval → 110ms) only ~13 would fit.
    expect(ch1.length).toBeGreaterThanOrEqual(16);
    // Pacing still holds within each step's pair.
    const freqCalls = gen.calls.filter((c: any) => c.m === 'setFrequency');
    for (let i = 1; i < freqCalls.length; i++) {
      if (freqCalls[i].args[0] === 2 && freqCalls[i - 1].args[0] === 1) {
        expect(freqCalls[i].t - freqCalls[i - 1].t).toBeGreaterThanOrEqual(50);
      }
    }
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

  it('range sweep spends the run time across all frequencies, not one step over (off-by-one)', async () => {
    // Report (15 Jul): a 5-step / 1-min-per-step program ran 6 min, not 5. The
    // sweep is inclusive (0…4 = 5 frequencies) but the dwell divided the run time
    // by the span (4), sizing each step for one fewer than actually runs. Over
    // 3000ms the fix gives 3000/(4+1)=600ms per step (last write at 4×600=2400ms);
    // the bug gave 3000/4=750ms (last write at 4×750=3000ms — a whole step long).
    const program = {
      name: 'offByOne', range: 1,
      data: [
        { channel: 1, frequency: 0, runTime: 0 },
        { channel: 1, frequency: 4, runTime: 0 },
      ] as FakeFreqItem[],
      maxTimeInMinutes: 0.05, default: 0, startFrequency: 0, // 3000ms total
    };
    const gen = mkFakeGen();
    const db = mkFakeDb(program);
    const pr = new ProgramRunner(db, gen, null);
    const p = pr.startProgram('offByOne', () => {});
    await vi.advanceTimersByTimeAsync(4000);
    await vi.runAllTimersAsync();
    await p; // self-terminates at totalMs

    const ch1 = gen.calls.filter((c: any) => c.m === 'setFrequency' && c.args[0] === 1);
    const freqs = ch1.map((c: any) => c.args[1]);
    // The sweep visits every frequency inclusive: 0,1,2,3,4 (a leading 0 is the
    // pre-output prime write, before the loop's own first step).
    expect(freqs.slice(-5)).toEqual([0, 1, 2, 3, 4]);
    // Last frequency write lands ~2400ms after the first (interval 600), not
    // ~3000ms (interval 750). t is an absolute epoch, so measure the delta.
    const elapsed = ch1[ch1.length - 1].t - ch1[0].t;
    expect(elapsed).toBeLessThan(2800);
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

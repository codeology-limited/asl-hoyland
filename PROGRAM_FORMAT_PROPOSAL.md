# Program Format Standardization Proposal

> **Status: mostly PROPOSED, partially IMPLEMENTED.**
>
> The unified `{mode, frequencies, duration, waveform, pulse, intensity, options}`
> schema described below is **not** what the code uses today — it remains a
> design proposal. What is **actually implemented** is a smaller, incremental
> step that supports two `data` shapes side by side:
>
> - **Old format (`number[]`):** `data` is a flat list of frequencies, e.g.
>   `"data": [322, 339, 343, ...]` (sequence) or `"data": [1, 40000]` with
>   `"range": true`. This is still the format used by almost every program in
>   `public/defaultPrograms.json`.
> - **New format (`{f, s, sweepTo}[]`):** `data` is a list of objects where
>   `f` = frequency in Hz, `s` = seconds to hold, and optional `sweepTo` = end
>   frequency for an inline sweep, e.g.
>   `"data": [{"f": 50, "s": 300}, {"f": 6, "s": 1800, "sweepTo": 70}]`.
>   **`candida` is currently the only program authored in this new format.**
>
> `AppDatabase` normalizes both shapes into the persisted `ProgramRow`
> (`data: { channel, frequency, runTime, sweepTo? }[]`), and `ProgramRunner`
> reads `frequency` / `runTime` / `sweepTo` from those rows. Pulsed playback
> still uses the existing `onkeysec` / `offkeysec` fields, `mirror` and
> `range` are still booleans on the program, waveform is still driven by the
> `channel1wavetype` / `channel2wavetype` strings, and the `ultrasound` /
> `ultra500` / `ultra670` special cases still exist via `runSpecialCase` and
> name checks. The single-`mode`-field unification, the deletion of special
> cases, and the editor changes (Phases 3–4 below) are **not** done.

## Current Problems

1. **Hardcoded special cases** in ProgramRunner.ts:
   - Line 168: `if (program.name.toLowerCase() === 'ultrasound')` - hardcoded toggle behavior
   - Line 180-181: `if (nameLc.includes('ultra500'))` / `'ultra670'` - hardcoded frequencies
   - "ultrasound" has a completely different execution path (`runSpecialCase`)

2. **Inconsistent data formats**:
   - Range programs: `data: [1, 40000]` (2 numbers)
   - Single freq: `data: [500000]` (1 number)
   - Sequences: `data: [322, 339, 343, ...]` (many numbers)
   - Data is stored differently in DB: `{channel: 1, frequency: X, runTime: Y}`

3. **Unused properties**:
   - `channel1wavetype`, `channel2wavetype` defined but ignored
   - `onkeysec`, `offkeysec` defined but ignored
   - `mirror` partially implemented (only for amplitude) but not for playback

4. **Impossible to add new programs** without modifying code

---

## Proposed Unified Format

Every program has:
- A **mode** (how to play frequencies)
- A **frequency list** (what to play)
- **Timing** (how long)
- **Waveform settings** (sine/square, pulsing)
- **Intensity settings** (min/max/step)

### Schema

```json
{
  "programName": {
    "mode": "sequence" | "range" | "toggle",
    "frequencies": [number, ...],
    "duration": {
      "totalMinutes": number,
      "perFrequencySeconds": number  // for sequence mode, ignored for range/toggle
    },
    "waveform": {
      "channel1": "SINE" | "SQUARE",
      "channel2": "SINE" | "SQUARE"
    },
    "pulse": {
      "enabled": boolean,
      "onSeconds": number,
      "offSeconds": number
    },
    "intensity": {
      "min": number,
      "max": number,
      "step": number,
      "startPercent": number,  // 0-100, what % of range to start at
      "default": number        // or explicit default value
    },
    "options": {
      "mirror": boolean,       // play sequence forward then backward
      "startFrequency": number // for channel 2 initialization
    }
  }
}
```

---

## Mapping Current Programs to New Format

### 1. Range Program (hoyland)
**Current:**
```json
{
  "range": true,
  "data": [1, 40000],
  "runTimeInMinutes": 120,
  "startFrequency": 3.1
}
```

**New:**
```json
{
  "mode": "range",
  "frequencies": [1, 40000],
  "duration": {
    "totalMinutes": 120
  },
  "waveform": {
    "channel1": "SINE",
    "channel2": "SINE"
  },
  "pulse": {
    "enabled": false
  },
  "intensity": {
    "min": 1,
    "max": 20,
    "step": 1,
    "startPercent": 25
  },
  "options": {
    "mirror": false,
    "startFrequency": 3100000
  }
}
```

### 2. Toggle Program (ultrasound)
**Current:** Hardcoded special case
```json
{
  "range": true,
  "channel1wavetype": "SQUARE",
  "channel2wavetype": "SQUARE",
  "onkeysec": 1,
  "offkeysec": 1,
  "data": [500000, 670000],
  "runTimeInMinutes": 10
}
```

**New:**
```json
{
  "mode": "toggle",
  "frequencies": [500000, 670000],
  "duration": {
    "totalMinutes": 10
  },
  "waveform": {
    "channel1": "SQUARE",
    "channel2": "SQUARE"
  },
  "pulse": {
    "enabled": true,
    "onSeconds": 1,
    "offSeconds": 1
  },
  "intensity": {
    "min": 0.3,
    "max": 1.8,
    "step": 0.015,
    "startPercent": 35
  },
  "options": {
    "mirror": false,
    "startFrequency": 500000
  }
}
```

### 3. Sequence Program (herpes)
**Current:**
```json
{
  "data": [322, 339, 343, 476, ...],
  "runTimeInMinutes": 73,
  "startFrequency": 27.1
}
```

**New:**
```json
{
  "mode": "sequence",
  "frequencies": [322, 339, 343, 476, ...],
  "duration": {
    "totalMinutes": 73
  },
  "waveform": {
    "channel1": "SINE",
    "channel2": "SINE"
  },
  "pulse": {
    "enabled": false
  },
  "intensity": {
    "min": 1,
    "max": 20,
    "step": 1,
    "startPercent": 25
  },
  "options": {
    "mirror": false,
    "startFrequency": 27100000
  }
}
```

### 4. Mirror Program (bipolarDisorder)
**Current:**
```json
{
  "mirror": true,
  "data": [0.16, 0.80, 7.50, 30.00, 67.50, 125.00, 352.93, 563.19, 642.91, 930.12],
  "runTimeInMinutes": 30,
  "startFrequency": 0
}
```

**New:**
```json
{
  "mode": "sequence",
  "frequencies": [0.16, 0.80, 7.50, 30.00, 67.50, 125.00, 352.93, 563.19, 642.91, 930.12],
  "duration": {
    "totalMinutes": 30
  },
  "waveform": {
    "channel1": "SQUARE",
    "channel2": "SQUARE"
  },
  "pulse": {
    "enabled": false
  },
  "intensity": {
    "min": 1,
    "max": 20,
    "step": 1,
    "startPercent": 25
  },
  "options": {
    "mirror": true,
    "startFrequency": 0
  }
}
```

---

## Unified Execution Algorithm

```typescript
async runProgram(config: ProgramConfig) {
  // 1. Apply intensity
  await this.applyIntensity(config.intensity);

  // 2. Set waveform
  if (config.waveform.channel1 === 'SQUARE' || config.waveform.channel2 === 'SQUARE') {
    await this.gen.setBothChannelsToSquareWave();
  }

  // 3. Initialize start frequency if specified
  if (config.options.startFrequency > 0) {
    await this.gen.setFrequency(2, config.options.startFrequency);
  }

  // 4. Execute based on mode
  switch (config.mode) {
    case 'range':
      await this.executeRange(config);
      break;
    case 'toggle':
      await this.executeToggle(config);
      break;
    case 'sequence':
      await this.executeSequence(config);
      break;
  }
}

async executeRange(config: ProgramConfig) {
  const [start, end] = config.frequencies;
  const totalMs = config.duration.totalMinutes * 60 * 1000;
  const steps = Math.min(1000, Math.abs(end - start));
  const stepSize = (end - start) / steps;
  const interval = totalMs / steps;

  for (let i = 0; i < steps && this.running; i++) {
    await this.handlePause();
    const freq = start + (i * stepSize);
    await this.gen.setFrequency(1, Math.round(freq));
    await this.sleep(interval);
  }
}

async executeToggle(config: ProgramConfig) {
  const totalMs = config.duration.totalMinutes * 60 * 1000;
  const start = Date.now();
  const cycleMs = (config.pulse.onSeconds + config.pulse.offSeconds) * 1000;

  while (this.running && (Date.now() - start) < totalMs) {
    await this.handlePause();

    // Cycle through frequencies
    for (const freq of config.frequencies) {
      await this.gen.setFrequency(1, freq);
      await this.sleep(config.pulse.onSeconds * 1000);

      if (config.pulse.offSeconds > 0) {
        await this.sleep(config.pulse.offSeconds * 1000);
      }
    }
  }
}

async executeSequence(config: ProgramConfig) {
  const totalMs = config.duration.totalMinutes * 60 * 1000;
  let frequencies = config.frequencies;

  // Apply mirror if enabled
  if (config.options.mirror) {
    frequencies = [...frequencies, ...frequencies.slice().reverse()];
  }

  const timePerFreq = totalMs / frequencies.length;

  for (const freq of frequencies) {
    if (!this.running) break;
    await this.handlePause();

    await this.gen.setFrequency(1, freq);
    await this.sleep(timePerFreq);
  }
}
```

---

## Migration Path

1. **Phase 1: Add new format support**
   - Update ProgramRow type to include new optional fields
   - Keep old logic working alongside new

2. **Phase 2: Convert all programs**
   - Transform defaultPrograms.json to new format
   - Update AppDatabase to handle new format

3. **Phase 3: Remove special cases**
   - Delete `runSpecialCase()`
   - Remove hardcoded name checks
   - Single execution path for all programs

4. **Phase 4: Update editor**
   - UI to set mode, waveform, pulse settings
   - All options visible and configurable

---

## Benefits

✅ **Zero special cases** - all programs use same algorithm
✅ **Easy to add programs** - just edit JSON, no code changes
✅ **Fully configurable** - waveform, pulsing, mirror all work
✅ **Clear semantics** - mode explicitly defines behavior
✅ **Maintainable** - one execution path, easy to debug
✅ **Extensible** - new modes can be added (e.g., "random", "adaptive")

---

## Example: Adding New Program

```json
{
  "parkinsons": {
    "mode": "sequence",
    "frequencies": [2, 5, 10, 20, 40, 60, 130, 250, 500],
    "duration": {
      "totalMinutes": 45
    },
    "waveform": {
      "channel1": "SQUARE",
      "channel2": "SQUARE"
    },
    "pulse": {
      "enabled": false
    },
    "intensity": {
      "min": 1,
      "max": 15,
      "step": 0.5,
      "startPercent": 30
    },
    "options": {
      "mirror": true,
      "startFrequency": 0
    }
  }
}
```

**That's it!** No code changes needed.

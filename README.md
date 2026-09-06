# ASL Hoyland

Desktop app (Tauri + React + TypeScript) that drives an **FY6600** dual-channel DDS
signal generator over a serial port to run frequency-therapy programs — Rife
sequences, PEMF/FSM tones, TTFields sweeps and ultrasound.

Ships as a Windows installer (NSIS). It replaces a legacy VB6 application, preserved
for reference in `historical/`.

---

## Quick start

```bash
npm install
npm run tauri:dev      # run the full desktop app (Vite on :1420 + Rust backend)
npm run dev            # frontend only, in a browser (device calls fail → TEST port)

npm test               # Vitest unit tests, incl. the virtual FY6600 harness
npm run coverage       # same with V8 coverage
npm run e2e            # Playwright editor tests (see e2e/README.md)
cargo test --manifest-path src-tauri/Cargo.toml
```

No hardware required. If no FY6600 is found the backend falls back to a **`TEST`
pseudo-port** that logs every command instead of writing it, and the UI offers an
"Enable Test Mode" toggle so the controls stay usable.

---

## Architecture

```
React (src/)                              Rust / Tauri (src-tauri/src/)        Device
──────────────────────────────            ──────────────────────────────      ──────
App.tsx            tabs, connect, LEDs
 ├ DefaultPrograms/Index   Rife/TTF/FSM tabs
 ├ CustomPrograms/Index    user programs
 └ ProgramEditor/index     create/edit/import/export

AppContext.tsx     singletons
 ├ AppDatabase          Dexie → IndexedDB
 ├ HoylandController ───────── invoke() ──→ commands/program.rs ─┐
 └ ProgramRunner  ← the engine               commands/io.rs ─────┴─ serialport ─→ FY6600
                                             commands/connection.rs  (port scan / UMO probe)
                                             app_state.rs            (PORT_NAME, port handles)
```

| File | Role |
|---|---|
| `src/util/ProgramRunner.ts` | **The heart of the product.** Resolves a program's category, orders the start-up writes, runs the playback loops, paces every write to work around firmware quirks. |
| `src/util/HoylandController.ts` | Thin typed wrapper over Tauri `invoke`; one method per backend command. Sends the `{ args }` payload shape the Rust handlers take, emits `<cmd>:error` on any failure. |
| `src/util/AppDatabase.ts` | Dexie schema, defaults preload/upsert, custom-program CRUD. |
| `src-tauri/src/commands/program.rs` | Byte-exact command formatting + the static command tables. |
| `src-tauri/src/commands/connection.rs` | Port scan, `UMO` handshake, `TEST` fallback. |
| `src-tauri/src/commands/io.rs` | `write_to_port` — the single serial write path (TEST port logs instead of writing). |

---

## The device: FY6600 serial protocol

### Connection

| | |
|---|---|
| Baud rate | **115200** (what the app probes with; the device also supports 9600) |
| Framing | 8 data bits, no parity, 1 stop bit, no flow control |
| Timeout | 500 ms |
| Command terminator | `\n` (`0x0A`) — **except** the identification probe, which uses `\r\n` |

`reconnect_device` walks every available serial port, opens it, writes `UMO\r\n`,
waits 500 ms, and accepts the port if the reply starts with `FY23` or `FY63`. The
winning port name is stored in the global `PORT_NAME` mutex and its handle in
`AppState.ports`. If nothing answers, `"TEST"` is inserted instead and the UI shows
"No device found".

### Command anatomy

Every command is a 3-character opcode followed by its payload:

```
W M F 0120000.000000
│ │ │ └─ payload
│ │ └─── parameter (F = frequency, A = amplitude, W = waveform, N = output on/off, …)
│ └───── channel   (M = CH1 "Main", F = CH2)
└─────── direction (W = write, R = read, U = utility)
```

CH1 is the therapy channel; CH2 is the carrier / mirror / second tone.

### Commands the app actually sends

| Command | Meaning | Format / example |
|---|---|---|
| `WMF` / `WFF` | Set CH1 / CH2 **frequency in Hz** | `{prefix}{int:07}.{frac:06}` → `WMF0120000.000000` |
| `WMA` / `WFA` | Set CH1 / CH2 **amplitude** (volts) | `{prefix}{amp:05.2}` → `WMA05.00` |
| `WMW` / `WFW` | Set waveform | `00` = sine, `01` = square |
| `WMN` / `WFN` | Output on/off | `WMN1` / `WMN0` |
| `WMO` / `WFO` | DC offset | `WMO00.00` |
| `WMD` / `WFD` | Duty cycle | `WMD50.0` |
| `WMP` / `WFP` | Phase | `WMP000` |
| ~~`WMT` / `WFT`~~ | **Removed.** FY2300 *attenuation* opcodes (not trigger — that is `WPM`), absent from the FY6600 protocol and never acknowledged by the hardware. They cost 1.2 s of every start-up. |
| `USA<n>` / `USD<n>` | **Enable / disable channel coupling** — see below | `USA0`, `USD2` |
| `UMO` | Read machine model (identification probe only) | reply `FY6600-60M` |

The width specifiers are **minimums**, not truncations: `27100000` Hz emits
`WFF27100000.000000` (8 integer digits), which is correct and expected. Golden
strings are pinned in both `src-tauri/src/commands/program.rs` (Rust `#[cfg(test)]`)
and `src/util/__tests__/fy6600Format.test.ts` — if one changes, both must change.

### `USA` / `USD` — the coupling family

This is the single most important part of the protocol for this app. `USA<n>` couples
CH2 to CH1 for one property; `USD<n>` releases it.

| Opcode | Couples | Used for |
|---|---|---|
| `USA0` | **Waveform** — CH2's waveform follows CH1 | Carrier programs and per-step-waveform programs, so the two channels can never end up on different waveforms |
| `USA1` | **Frequency** — CH2's frequency follows CH1 | Mirror programs only. **Must stay off for carrier and dual-frequency programs**, or CH2 gets dragged onto CH1 and the carrier/second tone collapses |
| `USA2` | **Amplitude** — CH2's amplitude follows CH1 | Always; part of `ENABLE_OUTPUT_COMMANDS` |
| `USA3` / `USA4` | Offset / duty | Only via the full `sync()` |

`sync()` sends the whole family `USA0..USA4`. `enableWaveformSync()` sends `USA0`
alone. `stop_and_reset` clears all five with `USD0..USD4` before anything else.

### Static command tables (`program.rs`)

```rust
INITIAL_COMMANDS        WFW00, WFO00.00, WFD50.0, WFP000, WFF3100000.000000          // CH2 config
SECONDARY_COMMANDS      WMW01, WMO00.00, WMD50.0, WMP000                             // CH1 config
ENABLE_OUTPUT_COMMANDS  WFN1, WMN1, USA2                                            // outputs LAST
SYNC_COMMANDS           USA0, USA1, USA2, USA3, USA4
STOP_COMMANDS           USD0..USD4, WFF0, WMF0, WFN0, WMN0                          // outputs off LAST
```

Neither config table enables an output or sets an amplitude. Outputs go on only at the
very end of start-up, and amplitude comes from the UI intensity slider at run time — a
hardcoded `WMA` in `SECONDARY_COMMANDS` was always overwritten and only added startup
noise.

`send_batched_commands` sleeps **600 ms between commands**; `set_amplitude` sleeps
200 ms; `set_frequency` sleeps 5 ms.

---

## The three-category model

Every program falls into exactly one category, determined by its fields. **The category
decides what CH2 does and which coupling is enabled** — this is the concept the whole
runner is organised around (`ProgramRunner.startProgram`).

Checked in this order — the first match wins:

| Category | Trigger | CH1 | CH2 | Coupling |
|---|---|---|---|---|
| **independent** | `channel2frequency > 0` (in **Hz**) | its own frequency | its **own** audio frequency (e.g. CH1 230 Hz + CH2 430 Hz) | amplitude only. Neither `USA0` nor `USA1` — either would collapse the two tones into one |
| **carrier** | `startFrequency > 0` (in **MHz**) and name doesn't contain `ultra` | runs the therapy sequence | **holds** a fixed MHz carrier (3.1 / 27.1 / 27.12 MHz) | `USA0` waveform + `USA2` amplitude. **Never `USA1`.** |
| **split carrier** | `startFrequency > 0` and the two declared wavetypes differ | its own waveform | the MHz carrier on its **own** waveform | amplitude only. **No `USA0`** — it would copy CH1's waveform onto CH2. CH2's waveform is re-asserted after outputs. |
| **mirror** | everything else — `startFrequency === 0`, or the name contains `ultra` | runs the therapy sequence | **equals CH1** | full `sync()` — CH2 follows in hardware, so the loop writes CH1 only |

Notes and edge cases:

- `startFrequency` is in **MHz**; `channel2frequency` is in **Hz**. They are different
  fields with different units and different meanings.
- `ultra500` / `ultra670` set `startFrequency` but it is their *operating* frequency,
  not a carrier — hence the explicit `ultra` exclusion that makes them **mirror**.
  Their CH1 frequency is hardcoded in the runner (0.5 MHz / 0.67 MHz).
- Carrier and independent programs **re-assert CH2's frequency once after outputs are
  enabled**. With frequency-sync deliberately off, the device otherwise reverts CH2 to
  the 3.1 MHz value from `INITIAL_COMMANDS` the moment the outputs come on.
- Mirror programs never write CH2 in the run loop — that is what full `sync()` buys,
  and it removes the channel "bouncing" that per-step CH2 writes caused.
- The independent branch is currently written for **square/square** programs
  (`dualFreq230and430Hz`, the only one that exists). An independent program declaring
  any other waveform pair falls through to the mirror branch and would get a full
  `sync()`, collapsing the two tones — widen the branch before adding one.

### Waveform resolution

Program-level waveform (`baseWave`), first match wins:

1. not `ultra` and `channel1wavetype === channel2wavetype === 'SINE'` → **SINE**
2. independent (dual-frequency) and both declared `SQUARE` → **SQUARE**
3. name contains `ultra`, or `startFrequency === 0`, or both declared `SQUARE` → **SQUARE**
4. `channel1wavetype === 'SINE'` → **SINE**
5. otherwise → **SQUARE**

Rule 1 is checked first on purpose: a no-carrier SINE/SINE program such as
`lymphocyte50Hz` used to be shadowed by rule 3 and wrongly emitted square.

**Per-step waveform** overrides all of this. If any `data` row carries its own
`wavetype` (the editor's per-frequency sine/square control), the program drives that
waveform per step. Before outputs are on, both channels are primed
(`set_both_channels_to_*`); once outputs and `USA0` are on, **only CH1 is written**
(`WMW00`/`WMW01`) and CH2 follows in hardware — writing both per step let one command
drop and the channels split.

---

## Start-up sequence

Order matters at every step. `doStart` (in the tab component) then
`ProgramRunner.startProgram`:

| # | Call | Wire | Why |
|---|---|---|---|
| 1 | `initializeChannel0()` | `SECONDARY_COMMANDS` | **CH1** config. Grouping each channel's config keeps the FY6600's own screen from thrashing between channels |
| 2 | `initializeChannel1()` | `INITIAL_COMMANDS` | **CH2** config |
| 3 | `setChannel1StartFrequency()` | `WFF<carrier>` | **CH2** carrier, when `startFrequency > 0` |
| 4 | `setIntensity(v, {applyNow:false})` | — | stashed, not written |
| 5 | `applyCurrentIntensity()` | `WMA` (+`WFA` if `mirror`) | amplitude before outputs |
| 6 | `setFrequencyPair()` | `WMF` [, 50 ms, `WFF`] | both channels' starting frequencies |
| 7 | CH2's own frequency | 50 ms, `WFF` | carrier or independent tone |
| 8 | waveform + coupling | `WMW`/`WFW`, then `USA0` or `USA0..4` | per the category table above |
| 9 | `enableOutputs()` | `WFN1, WMN1, USA2` | **outputs last**, so the device never briefly emits the previous program's settings |
| 10 | post-output re-assert | `USA0` and/or `WFF<carrier>` | per-step-waveform sync; carrier/independent CH2 hold |
| 11 | playback loop | `WMF` per step | |
| 12 | `stopAndReset()` | `STOP_COMMANDS` | sync off → frequencies zeroed → outputs off |

> **Naming trap:** `initializeChannel0()` configures **CH1**, `initializeChannel1()`
> configures **CH2**, and `setChannel1StartFrequency()` sets **CH2's** frequency. The
> names are historical and inverted; the comments and this table are authoritative.

---

## Timing invariants — do not "clean these up"

Each constant below exists because a field tester reported a specific symptom. They are
load-bearing.

| Constant | Value | Symptom it fixes |
|---|---|---|
| `FREQ_PAIR_GAP_MS` | 50 ms | The FY6600 drops the first of two back-to-back commands. Without the gap, `WFF` following `WMF` left CH1 stuck on its first frequency while CH2 stepped correctly. |
| `WAVEFORM_SWITCH_GAP_MS` | 200 ms | A waveform switch re-latches each channel's frequency from a snapshot taken when the switch executes. CH2 (written last, ~55 ms before the switch) reverted to its previous frequency on every sine↔square step. |
| **Frequency before waveform** | ordering | The firmware drops or reverts frequency writes that land inside a sine switch's settle window. sq→sq and sine→sq stepped fine; sq→sine and sine→sine kept the old frequency. |
| **Only switch waveform when it changes** | ordering | Re-asserting sine every step left the device unable to accept the frequency pair that followed. |
| **Outputs enabled last** | ordering | Otherwise the device briefly outputs the previous program's frequency/amplitude. |
| **`sync()` before `enableOutputs()`** | ordering | Otherwise CH2 stays dark. |
| **Pulsed mode toggles frequency to 0 Hz, not outputs** | design | `WMN0`/`WFN0` mid-program sometimes refused to re-enable. 0 Hz produces silent DC with the output still on. |
| **CH1-only waveform writes mid-run** | design | Writing both channels per step let one command drop, so a step's waveform reached only one channel. |
| **Post-output CH2 re-assert** | ordering | With `USA1` off, enabling outputs reverts CH2 to the 3.1 MHz init carrier. |
| **Inclusive sweeps divide by `steps + 1`** | arithmetic | A 5-step, 1-min-per-step program ran 6 minutes. |
| **Read the device back after start-up** | fault tolerance | The hardware silently ignores a command now and then. When the lost one is CH1's waveform, the channel stays square and `USA0` copies that onto CH2, so a sine program runs square on both while the UI shows sine. `verifyAndCorrect` reads the registers and re-asserts. |
| **Amplitude goes to BOTH channels** | correctness | `USA2` couples later changes only; it does not copy CH1's current amplitude across. Without an explicit `WFA` CH2 stayed at its 5 V power-on default while CH1 followed the slider. |
| **Stop wins during start-up** | ordering | `stopProgram()` flips `running` before sending `STOP_COMMANDS`; start-up checks the flag before `enableOutputs`, so a Stop pressed during the ~10 s of config can never turn the outputs back on after `WFN0`/`WMN0`. |
| **A failed write ends the run** | fault tolerance | Any rejected device command inside the run is caught, `stopAndReset` is sent, and `onStop` fires exactly once so the UI never sticks on "running". |

---

## Program format

`public/defaultPrograms.json` holds the **49 built-in programs**. It is fetched and
upserted into IndexedDB on **every launch**, so editing that file is how built-in
programs are added or corrected — no code change needed, and existing installs pick the
change up on next start.

Two shapes are accepted (`AppDatabase` sniffs which):

```jsonc
// "old" — bare Hz list; run time is split evenly across the frequencies
"herpes": {
  "default": true,
  "data": [322, 339, 343, 476],
  "runTimeInMinutes": 73,
  "startFrequency": 27.1,
  "channel1wavetype": "SQUARE", "channel2wavetype": "SQUARE",
  "sliderMinV": 1, "sliderMaxV": 20, "sliderStepV": 1,
  "sliderPercent": 25, "startIntensityV": 5
}

// "new" — per-step dwell; f = Hz, s = seconds, optional sweepTo = end Hz
"ttf": {
  "default": true, "category": "ttf", "loop": true,
  "data": [{ "f": 1873.5, "s": 180 }, { "f": 2221.3, "s": 180 }],
  "runTimeInMinutes": 720,
  "startFrequency": 27.12,
  "channel1wavetype": "SINE", "channel2wavetype": "SINE"
}
```

| Field | Unit | Meaning |
|---|---|---|
| `data` | Hz / seconds | Frequency steps. With `range: true`, exactly two entries = sweep start and end. |
| `runTimeInMinutes` | minutes | Total duration (`maxTimeInMinutes` once stored). |
| `startFrequency` | **MHz** | CH2 carrier. `0` = no carrier → mirror category. |
| `channel2frequency` | **Hz** | CH2's own tone → independent category. |
| `channel1wavetype` / `channel2wavetype` | `SINE`\|`SQUARE` | Program-level waveform (see resolution rules). |
| `range` | bool | Two-point sweep across the whole run time. |
| `sweepTo` (per row) | Hz | Sweep this row from `f` to `sweepTo` over the row's dwell. |
| `onkeysec` / `offkeysec` | seconds | Pulsed mode: alternate frequency ↔ 0 Hz. |
| `loop` | bool | Repeat the sequence until `runTimeInMinutes` elapses (TTF: 6 tones × 3 min for 12 h). A new step never *starts* past the deadline. |
| `category` | string | Tab placement: `ttf`, `fsm`, or absent for the Rife tab. |
| `mirror` | bool | Also send the amplitude to CH2 explicitly (`WFA`). |
| `sliderMinV` / `MaxV` / `StepV` | volts | Intensity slider bounds. |
| `startIntensityV` / `sliderPercent` | volts / % | Starting intensity. `startIntensityV` wins; else `sliderPercent` of the range; else 5 V on default bounds, otherwise 25 % of the range. |
| `default` | bool | `1` = built-in (Rife/TTF/FSM tabs), `0` = user program (Custom tab). |

### Playback modes

| Mode | Selected by | Behaviour |
|---|---|---|
| **Range sweep** | `range: true` + 2 data rows | Steps 1 Hz at a time from start to end, inclusive, over the total run time |
| **Sequence** | default | Each row holds its frequency for its dwell |
| **Row sweep** | row has `sweepTo` | That row sweeps 1 Hz at a time over its own dwell |
| **Pulsed** | `onkeysec` and `offkeysec` both > 0 | Alternates the frequency with 0 Hz (silent DC) — outputs stay on |
| **Loop** | `loop: true` | Repeats the whole sequence until the duration elapses |
| **Ultrasound** | program named exactly `ultrasound` | Hardcoded special case: toggles 0.5 ↔ 0.67 MHz square every second (`runSpecialCase`). Note its loop is hardcoded to **9 minutes** while the program declares `runTimeInMinutes: 10`, so progress and time-remaining track the 9-minute figure |

---

## UI

| Tab | Route | Shows |
|---|---|---|
| Rife | `/` | built-ins with no `category`, filtered by the ultrasound checkbox |
| TTF | `/ttf` | `category: "ttf"` |
| FSM | `/fsm` | `category: "fsm"` |
| Custom | `/custom` | user-saved programs |
| Editor | `/editor` | create / edit / import / export programs |

- **"Ultrasound device connected"** (default on) filters the Rife tab to `ultra*`
  programs; unchecked, it shows everything else and asks for confirmation before each
  start.
- **Intensity slider** is per-program (bounds and start value come from the program).
  Moving it writes `WMA` to the device only while a program is running.
- **Channel readout** shows live CH1/CH2 frequency + waveform glyph, and previews the
  selected program's starting state before Start (`previewRunStatus`).
- **Editor** exports/imports TSV (`Program, Range, Frequency (Hz), Minutes, Waveform,
  SweepTo (Hz)`) via the native Tauri dialogs, falling back to browser download/upload.

---

## Testing

**`src/util/__tests__/virtualFY6600.ts` is the key asset.** It is a software stand-in
for the physical device: it replaces Tauri's `invoke`, reproduces the **exact bytes**
`program.rs` would write, records them in order, and models the resulting per-channel
state including the `USA`/`USD` coupling. Because the tests run the *real*
`HoylandController` and *real* `ProgramRunner` through it, the transcript is a faithful
capture of what the machine would receive.

| Suite | What it proves |
|---|---|
| `fy6600Format.test.ts` | The TS formatters match the Rust golden strings byte for byte |
| `programSerial.test.ts` | Every built-in program produces the CH1/CH2 state its category demands |
| `reportedBugs.verify.test.ts` | Each specific field-reported symptom is fixed, by running the real program through the real engine |
| `ProgramRunner.test.ts` | Playback loops, pacing, pause/resume/stop, progress |
| Component suites | App shell, tabs, editor, context, error boundary |
| `e2e/editor.e2e.ts` | Browser-driven editor: create/edit/save/reload, drag-reorder, persistence |

192 unit tests, all passing. Rust has formatting and command-table tests plus a
`DummyPort` write test; `connection.rs` is not yet covered.

---

## Release

```bash
./scripts/release.sh
```

Bumps the patch version (with 9 → next minor rollover), rewrites it in
`src-tauri/tauri.conf.json`, `src/App.tsx` and `src/__tests__/App.test.tsx`, commits
`release vX.Y.Z`, tags, and pushes. The tag triggers
`.github/workflows/release.yml`: build on windows-latest → `npm test` → `tauri-action`
publishes the NSIS installer to a GitHub release → notification email.

---

## Repo layout

```
src/                  React frontend (see architecture map above)
src-tauri/            Rust backend, Tauri config, NSIS template, USB serial drivers
public/               defaultPrograms.json (the 50 built-ins) + branding assets
e2e/                  Playwright editor tests
scripts/release.sh    version bump + tag + push
FY6600 User Guide/    Vendor manual, serial protocol docs, PC software source reference
historical/           The legacy VB6 application this app replaces
```

### Related documents

- `TEST_PLAN.md` — a plan for deeper Rust command-level tests with an injectable mock
  port. Largely **unimplemented**; the TypeScript virtual-device harness took over that
  role.
- `PROGRAM_FORMAT_PROPOSAL.md` — an **unimplemented** proposal for a unified program
  schema. The runner's actual behaviour has since evolved well past it (three-category
  model, per-step waveforms, loops, dual-frequency), so treat it as history, not a
  roadmap. The hardcoded cases it objects to (`ultrasound`, `ultra500`, `ultra670`)
  still exist.

---

## Appendix: fuller FY6600 protocol reference

Extracted from the legacy VB6 source and vendor docs. The app only uses `UMO` from the
read set; the rest is here for reference when extending the backend.

**Read:** `UMO` model · `RMW`/`RFW` waveform · `RMF`/`RFF` frequency · `RMA`/`RFA`
amplitude · `RMO`/`RFO` offset · `RMD`/`RFD` duty · `RMP`/`RFP` phase · `RMT`/`RFT`
attenuation · `RMN`/`RFN` output state · `RPM` trigger mode · `RPN` pulse count ·
`RBZ` buzzer · `RMS` master/slave · `RUL` cascading

**Utility:** `UBZ<0|1>` buzzer · `UMS<0|1>` master/slave · `UUL<0|1>` cascading ·
`USA<0-4>` enable coupling · `USD<0-4>` disable coupling

**Waveform codes:** `00` sine · `01` square · `02` triangle · `03` sawtooth (rising) ·
`04` sawtooth (falling). This app uses only `00` and `01`.

**Model naming:** the number after the hyphen is the max frequency in MHz —
`FY6600-60M` = 60 MHz, `FY2300-25M` = 25 MHz.

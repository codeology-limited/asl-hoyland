# asl-hoyland

A desktop controller for **FY6600 / FY2300** series signal generators, used to
drive Rife / biofrequency and ultrasound programs. Built with **Tauri 1.x**, a
**React 18 + TypeScript** frontend (`src/`) and a **Rust** backend (`src-tauri/`).

The frontend calls into the Rust backend over Tauri `invoke()`; the backend
sends ASCII serial commands (see the reference tables below) to the connected
signal generator over a serial port.

> ⚠️ **SAFETY NOTE — this is a biofrequency / ultrasound device that applies
> frequencies and amplitude to a human body.** Frequency, amplitude, duration,
> waveform, and the order in which outputs are enabled are all safety-critical.
> Outputs are only enabled **after** every other setting has been written
> (waveform, frequency, amplitude), amplitude is **clamped to 0–20 V** in the
> backend, stopping the program **zeroes the amplitude and frequency** and turns
> both channels off, and a backend **deadman watchdog** force-stops the device if
> the running session stops sending heartbeats (~30 s) or exceeds the maximum
> session length. Do not bypass these guards.

## Development

```bash
npm install        # install frontend deps
npm run tauri:dev  # run the app (Vite dev server + Tauri shell)
```

`npm run dev` runs the Vite frontend alone (browser, no serial access); use
`npm run tauri:dev` for the full desktop app with serial support.

### TEST-port fallback

If no real generator is found (or you are developing without hardware), the app
falls back to a virtual **`TEST`** port. `list_ports` always appends `"TEST"`,
and `reconnect_device` falls back to `use_test_port` when no matching device is
present. On the `TEST` port, serial writes are logged instead of sent, so you
can exercise the full program flow without a device attached.

## Building / releasing

Releases are cut with the helper script, which bumps the patch version, syncs
the version across `tauri.conf.json`, `src/App.tsx` and `src/__tests__/App.test.tsx`,
then commits, tags, and pushes to trigger the GitHub Actions release workflow:

```bash
./scripts/release.sh
```

To produce a build without releasing, use `npm run build` (frontend) or
`npm run tauri` with the appropriate Tauri subcommand.

## Testing

```bash
npm test                       # frontend unit tests (Vitest)
cargo test --manifest-path src-tauri/Cargo.toml   # Rust backend tests
```

The Rust tests cover the serial command formatting/sequencing and the deadman
watchdog; the frontend Vitest suite covers `AppDatabase`, `HoylandController`,
and the `ProgramRunner` engine (sweep, pulsed, pause/resume, and command order).

---

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

---

## FY2300/FY6300 Signal Generator Serial Commands

This application communicates with FY2300/FY6300 series signal generators via serial port. Below are the documented commands extracted from the legacy VB6 code.

### Communication Settings

- **Baud Rate**: 9600 or 115200
- **Data Bits**: 8
- **Parity**: None
- **Stop Bits**: 1
- **Line Terminator**: `0x0A` (newline character)

---

### Read Commands (Query Device State)

| Command | Description | Example Response |
|---------|-------------|------------------|
| `UMO` | Read machine model | `FY2300-25M`, `FY6300-60M` |
| `RMW` | Read CH1 waveform type | Waveform code |
| `RMF` | Read CH1 frequency | Frequency value |
| `RMA` | Read CH1 amplitude | Amplitude value |
| `RMO` | Read CH1 offset/bias | Offset value |
| `RMD` | Read CH1 duty cycle | Duty percentage |
| `RMP` | Read CH1 phase | Phase value |
| `RMT` | Read CH1 attenuation | Attenuation level |
| `RMN` | Read CH1 output on/off state | 0=off, 1=on |
| `RPM` | Read CH1 trigger mode | Mode value |
| `RPN` | Read CH1 trigger pulse count | Pulse count |
| `RFW` | Read CH2 waveform type | Waveform code |
| `RFF` | Read CH2 frequency | Frequency value |
| `RFA` | Read CH2 amplitude | Amplitude value |
| `RFO` | Read CH2 offset | Offset value |
| `RFD` | Read CH2 duty cycle | Duty percentage |
| `RFP` | Read CH2 phase | Phase value |
| `RFT` | Read CH2 attenuation | Attenuation level |
| `RFN` | Read CH2 output on/off state | 0=off, 1=on |
| `RBZ` | Read buzzer status | 0=off, 1=on |
| `RMS` | Read master/slave mode | 0=master, 1=slave |
| `RUL` | Read cascading/uplink state | State value |

---

### Write Commands - Channel 1 (Main)

| Command | Description | Format | Example |
|---------|-------------|--------|---------|
| `WMW` | Set CH1 waveform | `WMW<code>` | `WMW00` (sine), `WMW01` (square) |
| `WMF` | Set CH1 frequency | `WMF<freq>` | `WMF00000001000.000000` (1kHz) |
| `WMA` | Set CH1 amplitude | `WMA<volts>` | `WMA02.00` (2V), `WMA20.00` (20V) |
| `WMO` | Set CH1 offset | `WMO<offset>` | `WMO00.00` (0V offset) |
| `WMD` | Set CH1 duty cycle | `WMD<percent>` | `WMD50.0` (50%) |
| `WMP` | Set CH1 phase | `WMP<degrees>` | `WMP000` (0°), `WMP180` (180°) |
| `WMT` | Set CH1 attenuation | `WMT<level>` | `WMT0` (no attenuation) |
| `WMN` | Set CH1 output on/off | `WMN<0/1>` | `WMN1` (on), `WMN0` (off) |

---

### Write Commands - Channel 2 (Secondary)

| Command | Description | Format | Example |
|---------|-------------|--------|---------|
| `WFW` | Set CH2 waveform | `WFW<code>` | `WFW00` (sine), `WFW01` (square) |
| `WFF` | Set CH2 frequency | `WFF<freq>` | `WFF3100000.000000` (3.1MHz) |
| `WFA` | Set CH2 amplitude | `WFA<volts>` | `WFA02.00` (2V), `WFA20.00` (20V) |
| `WFO` | Set CH2 offset | `WFO<offset>` | `WFO00.00` (0V offset) |
| `WFD` | Set CH2 duty cycle | `WFD<percent>` | `WFD50.0` (50%) |
| `WFP` | Set CH2 phase | `WFP<degrees>` | `WFP000` (0°) |
| `WFT` | Set CH2 attenuation | `WFT<level>` | `WFT0` (no attenuation) |
| `WFN` | Set CH2 output on/off | `WFN<0/1>` | `WFN1` (on), `WFN0` (off) |

---

### System/Utility Commands

| Command | Description | Format | Example |
|---------|-------------|--------|---------|
| `UBZ` | Set buzzer on/off | `UBZ<0/1>` | `UBZ1` (on), `UBZ0` (off) |
| `UMS` | Set master/slave mode | `UMS<0/1>` | `UMS0` (master) |
| `UUL` | Set cascading/uplink mode | `UUL<0/1>` | `UUL0` (no cascading) |
| `USA` | Synchronize voltage output | `USA<mode>` | `USA2` |
| `USD` | Disable voltage sync | `USD<mode>` | `USD2` |

---

### Waveform Codes

| Code | Waveform |
|------|----------|
| `00` | Sine wave |
| `01` | Square wave |
| `02` | Triangle wave |
| `03` | Sawtooth (rising) |
| `04` | Sawtooth (falling) |

---

### Initialization Sequence (as implemented)

The legacy reference above turned CH2/CH1 on inline. **The current
implementation deliberately enables outputs LAST**, after every channel setting
(waveform, offset, duty, phase, frequency, amplitude) has been written. This
avoids a brief moment where the device outputs a stale frequency from the
previous program. The output-enable commands (`WFN1`, `WMN1`, `USA2`) and the
deferred sync are sent only as the final step.

```
# 1. INITIAL_COMMANDS — configure CH2 (carrier), NO output enable
WFW00              - CH2 sine wave
WFO00.00           - CH2 offset 0
WFD50.0            - CH2 duty 50%
WFP000             - CH2 phase 0
WFT0               - CH2 attenuation 0
WFF3100000.000000  - CH2 frequency 3.1MHz (carrier)
                     # NOTE: WFN1 (CH2 on) is NOT here — moved to the enable step

# 2. SECONDARY_COMMANDS — configure CH1, NO output enable / NO sync
WMW01              - CH1 square wave
WMO00.00           - CH1 offset 0
WMD50.0            - CH1 duty 50%
WMP000             - CH1 phase 0
WMT0               - CH1 attenuation 0
WMA005.000         - CH1 amplitude
                     # NOTE: WMN1 (CH1 on) and USA2 (sync) are NOT here

# 3. Per-program settings: waveform (square/sine), set CH1/CH2 frequency,
#    set/clamp amplitude  — still with outputs OFF

# 4. ENABLE_OUTPUT_COMMANDS — enable outputs LAST
WFN1               - CH2 on
WMN1               - CH1 on
USA2               - Sync — links both channels
```

### Stop / Shutdown Sequence (as implemented)

`stop_and_reset` disables sync first, then **zeroes both frequencies**, then
turns both channels off last. The deadman watchdog uses the same force-stop
sequence if a session loses its heartbeat or exceeds the max duration.

```
USD0 USD1 USD2 USD3 USD4   - Disable voltage sync FIRST (all sync slots)
WFF0  WMF0                  - Reset CH2 / CH1 frequency to 0
WFN0  WMN0                  - Turn CH2 / CH1 off LAST
```

Stopping also re-sends amplitude 0 via the frontend so no residual drive
remains.

---

### Notes

- All commands are terminated with `0x0A` (newline character).
- **Frequency format (as implemented):** `WMF`/`WFF` take the frequency in Hz,
  formatted as **7 integer digits + 6 fractional digits** — `NNNNNNN.NNNNNN`
  (e.g. `WMF0000027.120000` for 27.12 Hz, `WFF0000003.100000` for 3.1 Hz). The
  integer part is the Hz value truncated; the fraction is `fract * 1_000_000`.
  Programs scale MHz carriers to Hz (e.g. `3.1 MHz → 3_100_000 Hz`) before
  calling this. Frequencies must be non-negative and are intended to stay
  **below 10 MHz** (the 7-digit integer field caps just under 10 MHz).
- **Amplitude (as implemented):** formatted as `NN.NN` volts and **clamped to
  0–20 V in the backend**. Stopping zeroes the amplitude.
- Model naming: The number after the hyphen indicates max frequency in MHz
  (e.g. FY2300-25M = 25MHz max).
- Recommended delay between commands: 30–600ms depending on command complexity
  (startup batches use ~600ms; rapid pulse cycles use ~50ms).

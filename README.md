# Tauri + React + Typescript

This template should help get you started developing with Tauri, React and Typescript in Vite.

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

### Typical Initialization Sequence

```
1. UBZ1          - Turn on buzzer (confirm connection)
2. UMS0          - Set to master mode
3. UUL0          - Disable cascading
4. WFW00         - Set CH2 to sine wave
5. WFF3100000.000000 - Set CH2 frequency to 3.1MHz (carrier)
6. WFO00.00      - Set CH2 offset to 0
7. WFD50.0       - Set CH2 duty to 50%
8. WFP000        - Set CH2 phase to 0
9. WFT0          - Set CH2 attenuation to 0
10. WFN1         - Turn CH2 on
11. WMW01        - Set CH1 to square wave
12. WMF<freq>    - Set CH1 frequency
13. WMA02.00     - Set CH1 amplitude to 2V
14. WMO00.00     - Set CH1 offset to 0
15. WMD50.0      - Set CH1 duty to 50%
16. WMP000       - Set CH1 phase to 0
17. WMT0         - Set CH1 attenuation to 0
18. WMN1         - Turn CH1 on
19. USA2         - Synchronize voltage output
```

### Shutdown Sequence

```
1. USD2          - Disable voltage sync
2. WFN0          - Turn CH2 off
3. WMN0          - Turn CH1 off
```

---

### Notes

- All commands are terminated with `0x0A` (newline character)
- Frequency format: `WMF` and `WFF` accept frequency in Hz with format `NNNNNNNN.NNNNNN`
- Amplitude range: 0-20V depending on model
- Model naming: The number after the hyphen indicates max frequency in MHz (e.g., FY2300-25M = 25MHz max)
- Recommended delay between commands: 30-400ms depending on command complexity

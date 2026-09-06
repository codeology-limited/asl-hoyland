# Hardware knowledge base

Everything here was **measured on a real generator**, not taken from the vendor
documentation — which is wrong in several places that matter. The point is that the next
person to touch the device sequencing can check a belief against evidence instead of
re-deriving it, and can tell the difference between *the app sent the right bytes* and
*the box actually did the right thing*.

The app is otherwise write-only: it assumes every command lands. It doesn't always.

```
bench/
  device.db          the database (rebuildable, safe to delete)
  schema.sql         tables, with a comment on each explaining why it exists
  build.py           rebuilds device.db from data/
  data/              raw measurements, one file per run
  tools/             the scripts that produced them
```

## Using it

```bash
sqlite3 bench/device.db                 # explore
python3 bench/build.py                  # rebuild after adding to data/
```

Four views answer the usual questions:

| View | Answers |
|---|---|
| `v_open_issues` | what is still wrong, worst first |
| `v_command_summary` | every opcode: does it ack, does it work, does the app use it |
| `v_program_verdicts` | which programs reached the right state, and what had to be corrected |
| `v_startup_sequence` | the exact bytes a program puts on the wire |

```sql
-- what is still open
SELECT severity, title, fix FROM v_open_issues;

-- commands the vendor documents but this firmware ignores
SELECT opcode, purpose FROM command WHERE tested AND NOT acked;

-- the exact wire sequence for one program
SELECT seq, line, tauri_command FROM v_startup_sequence WHERE program='ttf';

-- programs asking for a frequency the firmware cannot represent
SELECT name, bad_freq_steps FROM program WHERE bad_freq_steps > 0;

-- how close together two writes can be
SELECT parameter, successes || '/' || trials FROM stress_result
WHERE scenario LIKE 'paired%';
```

## The five things worth knowing before changing device code

1. **`USA` sync never retro-copies.** `USA0`/`USA1`/`USA2` couple CH2 to CH1 for
   *future* CH1 writes only. They do not copy the current value across. This is why CH2
   never receives the operator's amplitude, and why any CH1 write — a frequency write
   included — drags CH2's waveform along.

2. **A command is occasionally ignored, and the CH1 waveform is the one that hurts.**
   When `WMW00` is dropped, CH1 stays on the square its init set, `USA0` copies that onto
   CH2, and a sine program runs square on both channels while the UI shows sine. This is
   the root cause of the August 2026 field reports. Extra delay does not fix it; reading
   the register back and re-asserting does.

3. **50 ms is the floor between two writes**, with no margin. At 25 ms one is lost about
   one time in eight, and below 10 ms the first is always lost. `FREQ_PAIR_GAP_MS` is
   correct; do not reduce it.

4. **Some frequencies cannot be represented.** If the last five fractional digits reach
   65536 the firmware subtracts exactly 65536 micro-Hz, so 0.07 Hz becomes 0.004464 Hz.
   Eight built-in programs contain at least one affected step. No encoding avoids it.

5. **The vendor's micro-Hz frequency format does not apply to this firmware.** The
   document specifies a 14-digit micro-Hz integer; this unit reads those digits as Hz.
   The app's dotted decimal-Hz form is the correct one. Do not "fix" it to match the doc.

## Re-running the measurements

The generator must be connected and nothing else may hold the port — close the app first.
Each script leaves the unit stopped (outputs off, frequencies zeroed).

```bash
python3 bench/tools/command_sweep.py              # every opcode, all 95 waveforms, stress
python3 bench/tools/replay_all.py [program ...]   # replay programs with the app's real pacing
python3 bench/tools/fy.py read                    # one-off state dump
python3 bench/tools/fy.py send --gap=600 WMW00 WMN1
```

`replay_all.py` reads `data/transcripts.json`, the byte-exact sequence each program puts
on the wire. Regenerate it by running the capture test against the virtual device after
changing the runner, otherwise the replay tests the old sequences.

Four commands are deliberately never sent: `USN` and `ULN` write and read the unit's
non-volatile storage, and `UMS` and `UUL` change how it talks over the link, where a bad
value could cost serial control with no way to send it back. They are listed in the
`command` table with `risk` set and `tested` false.

## Port access

The CH340 adapter needs DTR and RTS asserted or the device answers nothing — `tools/fy.py`
does this. Always flush the input buffer before a read: the device acknowledges every
write with `0x0a`, the app consumes none of them, and a stale acknowledgement otherwise
gets read as the reply, shifting every subsequent read by one register. That single
mistake produced an entire run of false failures before it was spotted.

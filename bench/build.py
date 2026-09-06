#!/usr/bin/env python3
"""Build bench/device.db from the raw measurements in bench/data/.

Idempotent: drops and recreates the tables, so re-running after adding a new results
file simply refreshes the database. Standard library only.

    python3 bench/build.py
"""
import json
import pathlib
import sqlite3

HERE = pathlib.Path(__file__).parent
DATA = HERE / 'data'
REPO = HERE.parent
DB = HERE / 'device.db'

# The unit and session everything in bench/data was measured on.
DEVICE = dict(
    model='FY6300-30M',
    usb_adapter='CH340 (USB 1a86:7523)',
    port='/dev/cu.usbserial-210',
    baud=115200,
    notes='Bench unit on the developer Mac. Answers UMO with "FY6300-30M", so the '
          'app\'s FY23/FY63 prefix filter is correct and the README\'s "FY6600-60M" '
          'example is not what this hardware returns.',
)
SESSION = dict(
    started='2026-09-05',
    app_version='1.8.6',
    git_commit='b90411e',
    tooling='bench/tools/fy.py — stdlib termios on a raw fd, DTR/RTS asserted '
            '(the CH340 replies to nothing without them)',
    notes='Command-interaction matrix, then all 50 built-in programs replayed twice '
          'with the app\'s real wire pacing: once as shipped, once with the '
          'read-back verify-and-correct step added.',
)

# Frequencies whose last five fractional digits reach 65536 uHz are mis-parsed by the
# firmware, which subtracts exactly 65536 uHz. See the matching quirk row.
BAD_FRACTION_THRESHOLD = 65536
FRACTION_MODULUS = 100000


def freq_is_misparsed(hz: float) -> bool:
    return round(hz * 1_000_000) % FRACTION_MODULUS >= BAD_FRACTION_THRESHOLD


# ------------------------------------------------------------------ measured behaviour
QUIRKS = [
    dict(
        title='The device answers register read-back queries',
        rule='RMW/RFW return the waveform (0 sine, 1 square), RMF/RFF the frequency in Hz '
             'with six decimals, RMA/RFA the amplitude in 0.1 mV units (10000 = 1.00 V), '
             'RMN/RFN the output state (0 or 255) and RSA0..2 the sync flags.',
        evidence='Queried directly; every register returned a well-formed value that '
                 'matched the front panel.',
        confidence='measured',
        affects='Makes ProgramRunner.verifyAndCorrect possible. Before this the app was '
                'write-only and could never tell what the box was doing.',
        first_seen='2026-09-05',
    ),
    dict(
        title='Stale acknowledgements shift every read',
        rule='Flush the input buffer immediately before each query. The device acks every '
             'write with 0x0a and the app consumes none of them, so a backlog of acks '
             'sits in the OS buffer; without a flush the first ack is read as the '
             'query reply and every later read is off by one register.',
        evidence='Produced a whole run of bogus failures until the flush was added; '
                 'results became stable and repeatable afterwards.',
        confidence='measured',
        affects='perform_real_port_query in src-tauri/src/app_state.rs does the flush.',
        first_seen='2026-09-05',
    ),
    dict(
        title='USA sync couples future writes only — it never retro-copies',
        rule='USA0/USA1/USA2 make CH2 follow CH1 on subsequent CH1 writes. They do NOT '
             'copy CH1\'s current value across at the moment they are enabled. Any CH1 '
             'write triggers the coupling, including a frequency write, not just a '
             'waveform one.',
        evidence='Setting CH1 sine and CH2 square then sending USA0 left CH2 square; a '
                 'later CH1 write dragged it across. Same shape for USA1 and USA2.',
        confidence='measured',
        affects='Contradicts the assumption behind USA2 in ENABLE_OUTPUT_COMMANDS: CH2 '
                'never receives the operator\'s amplitude. Also means a carrier program '
                'CAN hold CH1 square with CH2 sine if CH2 is written after USA0.',
        first_seen='2026-09-05',
    ),
    dict(
        title='The CH1 waveform command is sometimes silently ignored',
        rule='A WMW00 sent during start-up is occasionally not applied, leaving CH1 on '
             'the square that SECONDARY_COMMANDS set. USA0 then copies that square onto '
             'CH2 at the next CH1 write, so a sine program runs square on both channels.',
        evidence='Reproduced on insomnia, ttf and ttFields100to500kHz — the only three '
                 'sine-carrier programs, and exactly the three Rob reported in Aug 2026. '
                 'Intermittent on the bench, but happened on every start when driven by '
                 'the real app.',
        confidence='measured',
        affects='Root cause of the "shows sine on the laptop, square from the box" '
                'reports. Fixed by read-back verification, not by extra delay.',
        first_seen='2026-09-05',
    ),
    dict(
        title='Delay alone does not fix the dropped waveform command',
        rule='Adding a settle before the waveform write does not help; re-asserting the '
             'waveform afterwards does.',
        evidence='700 ms settle before WMW00 still failed 4/4. Post-output re-assert '
                 'passed 4/4, and read-back-and-retry passed 4/4.',
        confidence='measured',
        affects='Explains why v1.8.5 (post-output re-assert) worked and why removing it '
                'in v1.8.6 brought the field reports back.',
        first_seen='2026-09-05',
    ),
    dict(
        title='Commands are slow, and the first of two back-to-back writes is lost',
        rule='Acks arrive 200-613 ms after a command and a write becomes readable 310 ms '
             '(CH1) to 920 ms (CH2) later. Two commands sent with no gap lose the first; '
             'a 50 ms gap is enough for both to land.',
        evidence='Measured per command; paired-write test at 0/50/300/600 ms gaps.',
        confidence='measured',
        affects='Confirms FREQ_PAIR_GAP_MS = 50 on real hardware, and sets '
                'DEVICE_COMMIT_MS = 1000 for the verification read.',
        first_seen='2026-09-05',
    ),
    dict(
        title='Fractional frequencies at or above .065536 lose 65536 micro-Hz',
        rule='If the last five fractional digits of the requested frequency are 65536 or '
             'more, the firmware subtracts exactly 65536 uHz — a 16-bit overflow in its '
             'parser. 0.07 Hz becomes 0.004464 Hz. No alternative encoding avoids it.',
        evidence='Deterministic across three trials per value. Sweeping the hundredths '
                 'digit: .001 to .061 correct, .071/.081/.091 all short by 0.065536. '
                 'Shorter fractions, extra padding and the vendor 14-digit form all fail.',
        confidence='measured',
        affects='Eight built-in programs contain at least one affected step. Worst case '
                'is schizophrenia\'s 0.07 Hz arriving as 0.004464 Hz.',
        first_seen='2026-09-06',
    ),
    dict(
        title='The vendor micro-Hz frequency format does not apply to this firmware',
        rule='The protocol document specifies a 14-digit micro-Hz integer. This unit reads '
             'those digits as Hz: WMF00000000070000 set 70000 Hz, not 0.07 Hz. The app\'s '
             'dotted decimal-Hz form is the correct one.',
        evidence='Sent both forms for the same value and read the register back.',
        confidence='measured',
        affects='Do not "fix" the formatter to match the vendor document.',
        first_seen='2026-09-06',
    ),
    dict(
        title='WMT0 and WFT0 are not FY6600 commands',
        rule='Neither is acknowledged and neither changes any register. They are FY2300 '
             'attenuation opcodes, absent from the FY6600 protocol.',
        evidence='No ack within 2 s, while every other command acked. Register state '
                 'unchanged either side of them.',
        confidence='measured',
        affects='They sit in SECONDARY_COMMANDS and INITIAL_COMMANDS and cost 1.2 s of '
                'dead time on every start.',
        first_seen='2026-09-05',
    ),
    dict(
        title='The identity probe needs longer than 500 ms',
        rule='UMO sometimes does not answer within the app\'s 500 ms window; it replied '
             'reliably only when given about 1.5 s.',
        evidence='Repeated probes at 0.7 s returned nothing; at 1.5 s the model string '
                 'came back every time.',
        confidence='measured',
        affects='reconnect_device may silently fall back to the TEST port, which looks '
                'to the operator like the app doing nothing.',
        first_seen='2026-09-05',
    ),
    dict(
        title='The front panel shows the most recently addressed channel on top',
        rule='Each CH1/CH2 alternation swaps the yellow and blue panels, and the newly '
             'promoted panel shows a blank white FREQ box until that channel is written '
             'again. A USA command redraws with CH1 on top and a SYNC badge.',
        evidence='Photographed through the camera while stepping a start-up sequence one '
                 'command at a time.',
        confidence='measured',
        affects='This is the "muddled yellow and blue screen" Rob describes. It is '
                'cosmetic — the outputs are unaffected.',
        first_seen='2026-09-05',
    ),
    dict(
        title='The ASK/FSK/PSK modulation family is documented but not implemented',
        rule='WTA, WTF and WTP (set ASK/FSK/PSK) and their reads RTA, RTF and RTP never '
             'acknowledge and never return a value. WPM, WPN and WFK do work.',
        evidence='Full command sweep: these six were the only documented opcodes besides '
                 'the FY2300 pair that produced no reply within 2 s.',
        confidence='measured',
        affects='Nothing today — the app uses none of them. Do not build a feature on '
                'them without re-testing on the customer\'s unit.',
        first_seen='2026-09-06',
    ),
    dict(
        title='All 95 waveform codes are accepted',
        rule='WMW00 to WMW94 are all honoured and echoed back, covering triangle, '
             'sawtooth, exponential, logarithmic, half-wave, Lorentz pulse, multitone, '
             'noise, ECG, trapezoid, sinc, narrow pulse and 64 arbitrary slots.',
        evidence='Enumerated every code and read RMW back; 95/95 matched. The front panel '
                 'named and drew each one.',
        confidence='measured',
        affects='The app only ever sends 00 (sine) and 01 (square). If a therapy ever '
                'wants another shape the hardware already supports it.',
        first_seen='2026-09-06',
    ),
    dict(
        title='50 ms is the minimum reliable gap between two writes',
        rule='Two consecutive writes both land at 50 ms and above. At 25 ms one is lost '
             'roughly one time in eight; at 10 ms and below the first is always lost.',
        evidence='Eight trials at each of 0, 5, 10, 25, 50, 100 and 200 ms.',
        confidence='measured',
        affects='FREQ_PAIR_GAP_MS = 50 is correct and has no margin to spare. Do not '
                'reduce it.',
        first_seen='2026-09-06',
    ),
    dict(
        title='In a rapid burst the last value always wins',
        rule='Sending 10 to 50 frequency writes at 20-50 ms spacing drops intermediate '
             'values but the final one always lands.',
        evidence='Bursts of 10, 25 and 50 writes; the register matched the last value '
                 'sent every time.',
        confidence='measured',
        affects='A fast sweep reaches the right end point, but intermediate steps are not '
                'all emitted — the therapy is coarser than the step list implies.',
        first_seen='2026-09-06',
    ),
    dict(
        title='Malformed input cannot break the link',
        rule='Unknown opcodes, missing payloads, non-numeric payloads, out-of-range values '
             'and a flood of 200 unpaced writes all leave the unit responsive. Only an '
             'unknown opcode goes unacknowledged; the rest are acked and clamped.',
        evidence='Thirteen boundary and malformed probes plus a 200-command flood, each '
                 'followed by a successful identity query.',
        confidence='measured',
        affects='No input validation is needed to protect the device itself. Validation is '
                'still needed to protect the patient from a wrong-but-valid value.',
        first_seen='2026-09-06',
    ),
    dict(
        title='A read can occasionally return a malformed value',
        rule='One read during the sweep returned "100001000.000000", a concatenation of '
             'two replies. Parsed loosely that is a plausible 100 MHz.',
        evidence='Observed once in 71 commands, despite the input flush.',
        confidence='measured',
        affects='ProgramRunner.verifyAndCorrect validates every reply against its '
                'documented shape and ignores anything else, so a glitched read cannot '
                'trigger a spurious correction.',
        first_seen='2026-09-06',
    ),
    dict(
        title='Register scaling differs per parameter',
        rule='Amplitude reads back in 0.1 mV units (WMA02.50 -> 25000), offset in mV '
             '(WMO01.00 -> 1000), duty in 0.001 percent (WMD40.0 -> 40000) and phase in '
             '0.001 degrees (WMP090 -> 90000). Frequency reads back in Hz with six '
             'decimals, matching what is written.',
        evidence='Wrote a known value to each and read its register back.',
        confidence='measured',
        affects='Anything that reads these registers must scale them; only frequency is '
                'symmetric with the write format.',
        first_seen='2026-09-06',
    ),
    dict(
        title='The generator never reports front-panel activity',
        rule='It speaks only when spoken to. Turning knobs and pressing keys produces no '
             'serial output at all, and neither uplink mode changes that: UMS1 (RMS goes '
             'to 255) and UUL1 both leave the link silent. The only way to see a '
             'front-panel change is to poll the registers.',
        evidence='45 s of continuous button pressing with the port open produced zero '
                 'bytes; repeated for 30 s under each uplink mode with the same result. '
                 'Polling every ~2 s did track every change (waveform steps, both outputs '
                 'switching on), so the state is visible, just not pushed.',
        confidence='measured',
        affects='Any future "what is the operator doing on the box" feature has to poll. '
                'It sees the resulting state, not which key was pressed.',
        first_seen='2026-09-06',
    ),
    dict(
        title='UMS and UUL are safe to set after all',
        rule='Both uplink commands are accepted, leave the link responsive, and restore '
             'cleanly with UMS0 / UUL0. They were originally skipped as a precaution.',
        evidence='Set and restored on the bench with an identity query either side; the '
                 'unit answered throughout.',
        confidence='measured',
        affects='Only USN and ULN remain untested, and those touch non-volatile storage.',
        first_seen='2026-09-06',
    ),
    dict(
        title='The acknowledgement means "line received", not "command carried out"',
        rule='Every recognised opcode is acked with a single 0x0a, 3-613 ms later, '
             'regardless of whether the payload was valid, in range, or applied as asked. '
             'Only a completely unknown opcode is met with silence.',
        evidence='WMF0002000.000000 acked in 201 ms and applied. WMFabc, a bare WMF with '
                 'no payload, and WMF60000000 on a 30 MHz unit each acked in ~200 ms too. '
                 'WMF0000000.070000 acked and then set 0.004464 Hz. Only ZZZ0 went '
                 'unacknowledged.',
        confidence='measured',
        affects='The ack is worthless as confirmation, and the app discards it anyway '
                '(write_to_port never reads). Reading the register back is the only way '
                'to know what the device did.',
        first_seen='2026-09-06',
    ),
    dict(
        title='A malformed frequency command drives the output to full scale',
        rule='WMF with a nonsense payload, or no payload at all, does not get ignored — '
             'the unit sets 30 MHz, its maximum. An out-of-range value clamps there too.',
        evidence='From a 1 kHz starting point, WMFabc and a bare WMF both left the '
                 'register reading 30000000.000000, each after a normal 200 ms ack.',
        confidence='measured',
        affects='Safety-relevant: a corrupted command on the wire yields maximum output '
                'rather than no output. The Rust formatter validates before sending so '
                'the app cannot emit one, and the start-up read-back would catch it, but '
                'nothing checks a corrupted write mid-run.',
        first_seen='2026-09-06',
    ),
]

FINDINGS = [
    dict(
        title='Sine programs run square on both channels',
        severity='bug', status='fixed',
        statement='insomnia, ttf and ttFields100to500kHz reached the device as square on '
                  'both channels while the app displayed sine.',
        evidence='Reproduced on hardware in the 50-program replay and again through the '
                 'real app, where the first read-back returned square at 0 Hz.',
        fix='FIXED: ProgramRunner.verifyAndCorrect reads the registers back after '
            'start-up and re-asserts anything that did not take. Confirmed on hardware in '
            'the real app, and across a 49-program replay where insomnia self-corrected.',
        reported_by='Rob, 12 and 14 Aug 2026',
        programs=['insomnia', 'ttf', 'ttFields100to500kHz'],
    ),
    dict(
        title='CH2 never receives the operator\'s amplitude',
        severity='safety', status='fixed',
        statement='USA2 does not copy CH1\'s amplitude to CH2, so CH2 keeps whatever it '
                  'had — typically the 5 V power-on default — while CH1 sits at the '
                  'intensity the operator chose. Only the four mirror:true programs send '
                  'an explicit WFA.',
        evidence='With CH1 at 1.00 V and CH2 at 5.00 V, enabling outputs and sending USA2 '
                 'left CH2 at 5.00 V.',
        fix='FIXED 2026-09-06: applyCurrentIntensity now writes WMA and WFA on every '
            'start, so both channels carry the slider value. Signed off by Tony.',
        reported_by=None,
        programs=[],
    ),
    dict(
        title='Eight programs request frequencies the firmware cannot represent',
        severity='bug', status='fixed',
        statement='Any step whose fractional part reaches .065536 is delivered 0.065536 Hz '
                  'low. schizophrenia asks for 0.07 Hz and gets 0.004464 Hz.',
        evidence='Deterministic; characterised by sweeping the fraction. The app now '
                 'detects the mismatch and warns, but cannot correct it.',
        fix='FIXED 2026-09-06: 19 steps across 8 programs snapped to the nearest value '
            'the firmware can produce. schizophrenia\'s worst step went from 94% low to '
            '6% low. Rob and Lynne still need telling, since it is a spec change.',
        reported_by=None,
        programs=['anxietyDisorders', 'bipolarDisorder', 'parasitesAndFungus',
                  'psychoticDisorders', 'rifeCrane', 'schizophrenia', 'tumors', 'tumors2'],
    ),
    dict(
        title='The device probe can time out and fall back to the test port',
        severity='bug', status='fixed',
        statement='reconnect_device waits 500 ms for the UMO reply and reads once. The '
                  'unit sometimes needs longer, after which the app silently uses the '
                  'TEST pseudo-port and no commands reach the hardware.',
        evidence='Probes at 0.7 s returned nothing; 1.5 s was reliable.',
        fix='FIXED 2026-09-06: reconnect_device now polls for up to 2 s instead of a '
            'single read after 500 ms.',
        reported_by=None,
        programs=[],
    ),
    dict(
        title='Two dead commands cost 1.2 s of every start-up',
        severity='hygiene', status='fixed',
        statement='WMT0 and WFT0 are never acknowledged and change nothing, but each holds '
                  'a 600 ms slot in the start-up batches.',
        evidence='No ack within 2 s; registers unchanged.',
        fix='FIXED 2026-09-06: removed from both tables, and the "trigger" mislabel in '
            'the comments and README corrected to attenuation.',
        reported_by='Rob, 17 Apr 2026 ("sending it a lot of rubbish before the proper setting")',
        programs=[],
    ),
    dict(
        title='Rapid sweeps do not emit every step',
        severity='doc', status='fixed',
        statement='In a burst of frequency writes the device keeps only the last one. A '
                  'range sweep with a short per-step interval therefore reaches the right '
                  'end frequency but skips intermediate steps.',
        evidence='Bursts of 10, 25 and 50 writes at 20-50 ms all ended on the final value '
                 'with intermediate ones lost.',
        fix='FIXED 2026-09-06: the editor now warns on save when a sweep would step '
            'faster than 50 ms, showing how many steps the device will actually emit. No '
            'built-in program is affected.',
        reported_by=None,
        programs=['hoyland', 'ultrasound'],
    ),
    dict(
        title='Nothing verifies commands sent during playback',
        severity='safety', status='open',
        statement='A frequency command corrupted in transit is acknowledged normally and '
                  'can leave the generator at 30 MHz. Start-up is now read back and '
                  'corrected, but per-step writes during a running program are not.',
        evidence='WMFabc and a bare WMF each acked in ~200 ms and set 30 MHz from a 1 kHz '
                 'starting point.',
        fix='Poll the CH1 frequency during long programs (a read costs ~200 ms and the '
            'steps are seconds to minutes apart) and re-assert or stop on a mismatch. '
            'The read-back plumbing already exists.',
        reported_by=None,
        programs=[],
    ),
]

MEASUREMENTS = [
    ('WMF (CH1 frequency)', 'ack_latency', 596, 'ms', None),
    ('WFF (CH2 frequency)', 'ack_latency', 497, 'ms', None),
    ('WMW00 (CH1 sine)', 'ack_latency', 613, 'ms', None),
    ('WMW01 (CH1 square)', 'ack_latency', 200, 'ms', None),
    ('WFW00 (CH2 sine)', 'ack_latency', 533, 'ms', None),
    ('WMA (CH1 amplitude)', 'ack_latency', 613, 'ms', None),
    ('WFA (CH2 amplitude)', 'ack_latency', 533, 'ms', None),
    ('WMN1 (CH1 output on)', 'ack_latency', 613, 'ms', None),
    ('WMN0 (CH1 output off)', 'ack_latency', 209, 'ms', None),
    ('USA0', 'ack_latency', 445, 'ms', None),
    ('USD0', 'ack_latency', 36, 'ms', None),
    ('WMT0', 'ack_latency', None, 'ms', 'never acknowledged — not an FY6600 command'),
    ('WFT0', 'ack_latency', None, 'ms', 'never acknowledged — not an FY6600 command'),
    ('WMF (CH1 frequency)', 'commit_latency', 310, 'ms', 'time until readable via RMF'),
    ('WFF (CH2 frequency)', 'commit_latency', 922, 'ms', 'time until readable via RFF'),
    ('UMO identity probe', 'reply_latency', 1500, 'ms',
     'no reply at 700 ms; reliable at 1500 ms. The app allows only 500 ms.'),
    ('CH1 then CH2 write, 0 ms gap', 'both_landed', 0, 'ratio', 'the first command is lost'),
    ('CH1 then CH2 write, 50 ms gap', 'both_landed', 1, 'ratio',
     'confirms FREQ_PAIR_GAP_MS on real hardware'),
]



# Vendor names for the waveform codes (protocol document, WMW section).
WAVEFORM_NAMES = {
    0: 'Sine', 1: 'Square', 2: 'Triangle/Ramp', 3: 'Rise Sawtooth', 4: 'Fall Sawtooth',
    5: 'Step Triangle', 6: 'Positive Step', 7: 'Inverse Step', 8: 'Positive Exponent',
    9: 'Inverse Exponent', 10: 'Positive Falling Exponent', 11: 'Inverse Falling Exponent',
    12: 'Positive Logarithm', 13: 'Inverse Logarithm', 14: 'Positive Falling Logarithm',
    15: 'Inverse Falling Logarithm', 16: 'Positive Half Wave', 17: 'Negative Half Wave',
    18: 'Positive Half Wave Rectification', 19: 'Negative Half Wave Rectification',
    20: 'Lorenz Pulse', 21: 'Multitone', 22: 'Random Noise', 23: 'Electrocardiogram (ECG)',
    24: 'Trapezoidal Pulse', 25: 'Sinc Pulse', 26: 'Narrow Pulse', 27: 'Gauss White Noise',
    28: 'AM', 29: 'FM', 30: 'Linear FM',
}
WAVEFORM_NAMES.update({c: f'Arbitrary {c - 30}' for c in range(31, 95)})

def load(name):
    path = DATA / name
    return json.loads(path.read_text()) if path.exists() else None


def main():
    if DB.exists():
        DB.unlink()
    con = sqlite3.connect(DB)
    con.executescript((HERE / 'schema.sql').read_text())

    dev_id = con.execute(
        'INSERT INTO device (model, usb_adapter, port, baud, notes) VALUES (?,?,?,?,?)',
        (DEVICE['model'], DEVICE['usb_adapter'], DEVICE['port'], DEVICE['baud'],
         DEVICE['notes'])).lastrowid
    ses_id = con.execute(
        'INSERT INTO session (started, device_id, app_version, git_commit, tooling, notes)'
        ' VALUES (?,?,?,?,?,?)',
        (SESSION['started'], dev_id, SESSION['app_version'], SESSION['git_commit'],
         SESSION['tooling'], SESSION['notes'])).lastrowid

    # ---- command experiments. Later files supersede earlier ones for the same ref.
    experiments = {}
    for fname in ('D_E_amplitude_and_waveform.json', 'A_B_acceptance_and_sync.json',
                  'C_output_enable_and_sequences.json', 'D_E_corrected.json'):
        for rec in (load(fname) or []):
            rec['_source'] = fname
            experiments[rec['id']] = rec
    for ref, r in sorted(experiments.items()):
        con.execute(
            'INSERT INTO experiment (session_id, ref, question, sequence, gap_ms, expected,'
            ' observed, verdict, mismatches, unacked, note) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
            (ses_id, ref, r['question'], json.dumps(r['sequence']), r.get('gap_ms'),
             json.dumps(r.get('expected')), json.dumps(r.get('observed')), r['verdict'],
             json.dumps(r.get('mismatches')), json.dumps(r.get('unacked')),
             ' | '.join(filter(None, [r.get('note'), 'source: ' + r['_source']]))))

    for subject, metric, value, unit, note in MEASUREMENTS:
        con.execute('INSERT INTO measurement (session_id, subject, metric, value, unit, note)'
                    ' VALUES (?,?,?,?,?,?)', (ses_id, subject, metric, value, unit, note))

    # ---- per-program hardware replays
    def strict_ok(rec):
        for ch in ('ch1', 'ch2'):
            want, got = rec[ch]['want'], rec[ch]['got']
            tol = max(1e-6, abs(want['hz']) * 5e-7)
            if abs((got['hz'] or 0) - want['hz']) > tol:
                return 0
            if got['wave'] != want['wave'] or bool(got['on']) != bool(want['on']):
                return 0
        return 1

    for label, fname in (('baseline', 'replay_all.json'), ('verified', 'replay_verified.json')):
        for rec in (load(fname) or []):
            con.execute(
                'INSERT INTO program_run (session_id, run_label, program,'
                ' ch1_want_hz, ch1_got_hz, ch1_want_wave, ch1_got_wave, ch1_want_on, ch1_got_on,'
                ' ch2_want_hz, ch2_got_hz, ch2_want_wave, ch2_got_wave, ch2_want_on, ch2_got_on,'
                ' corrections, unacked, seconds, pass_loose, pass_strict)'
                ' VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
                (ses_id, label, rec['name'],
                 rec['ch1']['want']['hz'], rec['ch1']['got']['hz'],
                 rec['ch1']['want']['wave'], rec['ch1']['got']['wave'],
                 int(bool(rec['ch1']['want']['on'])), int(bool(rec['ch1']['got']['on'])),
                 rec['ch2']['want']['hz'], rec['ch2']['got']['hz'],
                 rec['ch2']['want']['wave'], rec['ch2']['got']['wave'],
                 int(bool(rec['ch2']['want']['on'])), int(bool(rec['ch2']['got']['on'])),
                 json.dumps(rec.get('corrections', [])), json.dumps(rec.get('unacked', [])),
                 rec.get('secs'), int(bool(rec.get('pass'))), strict_ok(rec)))

    # ---- exact wire transcripts and program properties
    transcripts = load('transcripts.json') or {}
    defaults_path = REPO / 'public' / 'defaultPrograms.json'
    defaults = json.loads(defaults_path.read_text()) if defaults_path.exists() else {}

    for name, entry in sorted(transcripts.items()):
        prev_t = None
        for i, ln in enumerate(entry['lines']):
            gap = 0 if prev_t is None else max(0, ln['t'] - prev_t)
            prev_t = ln['t']
            con.execute('INSERT INTO transcript_line (program, seq, line, tauri_command,'
                        ' js_gap_ms) VALUES (?,?,?,?,?)',
                        (name, i, ln['line'], ln.get('cmd'), gap))

        row = entry.get('row', {})
        src = defaults.get(name, {})
        freqs = []
        for item in (src.get('data') or []):
            if isinstance(item, (int, float)):
                freqs.append(float(item))
            elif isinstance(item, dict) and isinstance(item.get('f'), (int, float)):
                freqs.append(float(item['f']))
        if isinstance(src.get('channel2frequency'), (int, float)):
            freqs.append(float(src['channel2frequency']))

        start_mhz = float(src.get('startFrequency') or 0)
        ch2_hz = float(src.get('channel2frequency') or 0)
        if ch2_hz > 0:
            runner_cat = 'independent'
        elif start_mhz > 0 and 'ultra' not in name.lower():
            runner_cat = 'carrier'
        else:
            runner_cat = 'mirror'

        con.execute(
            'INSERT INTO program (name, category, runner_category, ch1_wavetype,'
            ' ch2_wavetype, start_frequency_mhz, channel2_frequency_hz, run_time_minutes,'
            ' steps, looped, pulsed, ranged, bad_freq_steps, notes)'
            ' VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
            (name, src.get('category'), runner_cat,
             src.get('channel1wavetype'), src.get('channel2wavetype'),
             start_mhz, ch2_hz, src.get('runTimeInMinutes'),
             len(row.get('data') or []),
             int(bool(src.get('loop'))),
             int(bool(src.get('onkeysec')) and bool(src.get('offkeysec'))),
             int(bool(src.get('range'))),
             sum(1 for f in freqs if freq_is_misparsed(f)),
             'ultrasound ignores its JSON fields and runs a hardcoded 0.5/0.67 MHz toggle'
             if name == 'ultrasound' else None))

    # ---- full command sweep: every opcode, the waveform catalogue and the stress runs
    sweep = load('command_sweep.json') or {}
    for c in sweep.get('commands', []):
        con.execute(
            'INSERT OR REPLACE INTO command (opcode, grp, direction, purpose, payload,'
            ' documented, used_by_app, risk, tested, acked, ack_ms, reply, took_effect,'
            ' side_effects, notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
            (c['opcode'], c['group'], c['direction'], c['purpose'], c.get('payload'),
             c.get('documented', 1), c.get('used_by_app', 0), c.get('risk', 'safe'),
             int(not c.get('skipped')), int(c.get('ack_ms') is not None),
             c.get('ack_ms'), c.get('reply'), c.get('took_effect'),
             json.dumps(c.get('side_effects') or {}), c.get('note')))
        con.execute('INSERT INTO command_trial (session_id, opcode, sent, ack_ms, reply,'
                    ' state_before, state_after, note) VALUES (?,?,?,?,?,?,?,?)',
                    (ses_id, c['opcode'], c.get('sent') or c['opcode'], c.get('ack_ms'),
                     c.get('reply'), None, json.dumps(c.get('side_effects') or {}),
                     c.get('note')))

    for w in sweep.get('waveforms', []):
        con.execute('INSERT OR REPLACE INTO waveform (code, name, accepted, readback,'
                    ' used_by_app) VALUES (?,?,?,?,?)',
                    (w['code'], WAVEFORM_NAMES.get(w['code']), w['accepted'],
                     w['readback'], int(w['code'] in (0, 1))))

    for st in sweep.get('stress', []):
        con.execute('INSERT INTO stress_result (session_id, scenario, parameter, trials,'
                    ' successes, detail) VALUES (?,?,?,?,?,?)',
                    (ses_id, st['scenario'], st['parameter'], st['trials'],
                     st['successes'], st['detail']))

    for q in QUIRKS:
        con.execute('INSERT INTO quirk (title, rule, evidence, confidence, affects,'
                    ' first_seen) VALUES (?,?,?,?,?,?)',
                    (q['title'], q['rule'], q['evidence'], q['confidence'], q['affects'],
                     q['first_seen']))

    for f in FINDINGS:
        con.execute('INSERT INTO finding (title, severity, status, statement, evidence,'
                    ' fix, reported_by, programs) VALUES (?,?,?,?,?,?,?,?)',
                    (f['title'], f['severity'], f['status'], f['statement'], f['evidence'],
                     f['fix'], f['reported_by'], json.dumps(f['programs'])))

    con.commit()
    counts = {t: con.execute(f'SELECT COUNT(*) FROM {t}').fetchone()[0]
              for t in ('device', 'session', 'experiment', 'measurement', 'program_run',
                        'transcript_line', 'program', 'quirk', 'finding',
                        'command', 'waveform', 'stress_result')}
    con.close()
    print(f'built {DB.relative_to(REPO)}')
    for t, n in counts.items():
        print(f'  {t:16} {n}')


if __name__ == '__main__':
    main()

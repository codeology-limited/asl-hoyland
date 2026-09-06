#!/usr/bin/env python3
"""Exercise the FY6300's entire documented command set and record what it does.

For every command: send it, time the acknowledgement, read back its own register, and
snapshot the therapy-relevant registers either side so collateral changes show up.
Then enumerate the 95 waveform codes, then stress the link.

Four commands are deliberately NOT sent (see SKIPPED): they either write to the unit's
non-volatile storage or change how it talks over the link, so a bad outcome would
persist or cost serial control of the device.

    python3 bench/tools/command_sweep.py            # everything
    python3 bench/tools/command_sweep.py commands   # one section only
"""
import json
import pathlib
import sys
import time

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from fy import FY  # noqa: E402

OUT = pathlib.Path(__file__).parent.parent / 'data' / 'command_sweep.json'

# Registers snapshotted around every command to catch collateral damage.
CORE = ['RMW', 'RMF', 'RMN', 'RFW', 'RFF', 'RFN']

# Put the unit somewhere harmless and known before each command.
BASELINE = ['USD0', 'USD1', 'USD2', 'USD3', 'USD4', 'WMN0', 'WFN0',
            'WMF0001000.000000', 'WFF0002000.000000', 'WMA01.00', 'WFA01.00',
            'WMW01', 'WFW01', 'WMO00.00', 'WFO00.00', 'WMD50.0', 'WFD50.0']

SKIPPED = [
    ('USN', 'system', 'write', 'Save both channels to a storage position',
     'Writes the unit\'s non-volatile memory and would overwrite whatever the owner has '
     'saved there. Nothing in the app needs it.'),
    ('ULN', 'system', 'write', 'Load parameters from a storage position',
     'Would replace the live settings with unknown stored ones mid-test.'),
    ('UMS', 'system', 'write', 'Set uplink mode',
     'Changes how the unit talks over the link; a wrong value risks losing serial control '
     'with no way to send it back.'),
    ('UUL', 'system', 'write', 'Set local uplink status',
     'Same risk as UMS.'),
]

# opcode, group, direction, payload, purpose, own read-back command (None if not readable)
COMMANDS = [
    # ---- CH1, the therapy channel
    ('WMW', 'ch1', 'write', '00', 'Set CH1 waveform (00 sine)', 'RMW'),
    ('WMF', 'ch1', 'write', '0001234.000000', 'Set CH1 frequency', 'RMF'),
    ('WMA', 'ch1', 'write', '02.50', 'Set CH1 amplitude in volts', 'RMA'),
    ('WMO', 'ch1', 'write', '01.00', 'Set CH1 DC offset in volts', 'RMO'),
    ('WMD', 'ch1', 'write', '40.0', 'Set CH1 duty cycle percent', 'RMD'),
    ('WMP', 'ch1', 'write', '090', 'Set CH1 phase in degrees', 'RMP'),
    ('WMN', 'ch1', 'write', '1', 'Set CH1 output on', 'RMN'),
    ('WMS', 'ch1', 'write', '10000', 'Set CH1 pulse period in nanoseconds', None),
    ('RMW', 'ch1', 'read', '', 'Read CH1 waveform', None),
    ('RMF', 'ch1', 'read', '', 'Read CH1 frequency', None),
    ('RMA', 'ch1', 'read', '', 'Read CH1 amplitude', None),
    ('RMO', 'ch1', 'read', '', 'Read CH1 offset', None),
    ('RMD', 'ch1', 'read', '', 'Read CH1 duty cycle', None),
    ('RMP', 'ch1', 'read', '', 'Read CH1 phase', None),
    ('RMN', 'ch1', 'read', '', 'Read CH1 output state', None),
    # ---- CH2, the carrier / second tone
    ('WFW', 'ch2', 'write', '00', 'Set CH2 waveform (00 sine)', 'RFW'),
    ('WFF', 'ch2', 'write', '0005678.000000', 'Set CH2 frequency', 'RFF'),
    ('WFA', 'ch2', 'write', '03.50', 'Set CH2 amplitude in volts', 'RFA'),
    ('WFO', 'ch2', 'write', '01.50', 'Set CH2 DC offset in volts', 'RFO'),
    ('WFD', 'ch2', 'write', '35.0', 'Set CH2 duty cycle percent', 'RFD'),
    ('WFP', 'ch2', 'write', '045', 'Set CH2 phase in degrees', 'RFP'),
    ('WFN', 'ch2', 'write', '1', 'Set CH2 output on', 'RFN'),
    ('RFW', 'ch2', 'read', '', 'Read CH2 waveform', None),
    ('RFF', 'ch2', 'read', '', 'Read CH2 frequency', None),
    ('RFA', 'ch2', 'read', '', 'Read CH2 amplitude', None),
    ('RFO', 'ch2', 'read', '', 'Read CH2 offset', None),
    ('RFD', 'ch2', 'read', '', 'Read CH2 duty cycle', None),
    ('RFP', 'ch2', 'read', '', 'Read CH2 phase', None),
    ('RFN', 'ch2', 'read', '', 'Read CH2 output state', None),
    # ---- modulation
    ('WPM', 'modulation', 'write', '0', 'Set CH1 trigger mode', 'RPM'),
    ('WPN', 'modulation', 'write', '0001', 'Set pulse count for triggered burst', 'RPN'),
    ('WTA', 'modulation', 'write', '0', 'Set ASK mode', 'RTA'),
    ('WTF', 'modulation', 'write', '0', 'Set FSK mode', 'RTF'),
    ('WFK', 'modulation', 'write', '0003000.000000', 'Set FSK secondary frequency', 'RFK'),
    ('WTP', 'modulation', 'write', '0', 'Set PSK mode', 'RTP'),
    ('RPM', 'modulation', 'read', '', 'Read CH1 trigger mode', None),
    ('RPN', 'modulation', 'read', '', 'Read triggered pulse count', None),
    ('RTA', 'modulation', 'read', '', 'Read ASK mode', None),
    ('RTF', 'modulation', 'read', '', 'Read FSK mode', None),
    ('RFK', 'modulation', 'read', '', 'Read FSK secondary frequency', None),
    ('RTP', 'modulation', 'read', '', 'Read PSK mode', None),
    # ---- frequency counter / external measurement
    ('WCC', 'measurement', 'write', '0', 'Set measurement coupling mode', None),
    ('WCZ', 'measurement', 'write', '0', 'Reset the counter', None),
    ('WCP', 'measurement', 'write', '0', 'Pause the measurement', None),
    ('WCG', 'measurement', 'write', '1', 'Set measurement gate time', 'RCG'),
    ('RCG', 'measurement', 'read', '', 'Read measurement gate time', None),
    ('RCF', 'measurement', 'read', '', 'Read externally measured frequency', None),
    ('RCC', 'measurement', 'read', '', 'Read external counter value', None),
    ('RCT', 'measurement', 'read', '', 'Read external counting period', None),
    ('RCD', 'measurement', 'read', '', 'Read externally measured duty cycle', None),
    ('RC+', 'measurement', 'read', '', 'Read positive pulse width', None),
    ('RC-', 'measurement', 'read', '', 'Read negative pulse width', None),
    # ---- sweep (configuration only; SBE0 stops rather than starts)
    ('SOB', 'sweep', 'write', '0', 'Set the sweep object', None),
    ('SST', 'sweep', 'write', '0001000.000000', 'Set sweep start value', None),
    ('SEN', 'sweep', 'write', '0002000.000000', 'Set sweep end value', None),
    ('STI', 'sweep', 'write', '0005', 'Set sweep time', None),
    ('SMO', 'sweep', 'write', '0', 'Set sweep mode', None),
    ('SXY', 'sweep', 'write', '0', 'Set sweep signal source', None),
    ('SBE', 'sweep', 'write', '0', 'Stop the sweep', None),
    ('RSS', 'sweep', 'read', '', 'Read sweep status (listed in the command table)', None),
    # ---- system
    ('USA', 'system', 'write', '0', 'Couple CH2 waveform to CH1', 'RSA0'),
    ('USD', 'system', 'write', '0', 'Release the CH2 waveform coupling', 'RSA0'),
    ('UBZ', 'system', 'write', '0', 'Set the buzzer off', 'RBZ'),
    ('RSA', 'system', 'read', '0', 'Read a synchronisation flag', None),
    ('RBZ', 'system', 'read', '', 'Read buzzer state', None),
    ('RMS', 'system', 'read', '', 'Read uplink mode', None),
    ('RUL', 'system', 'read', '', 'Read local uplink status', None),
    ('UID', 'system', 'read', '', 'Read the unit id', None),
    ('UMO', 'system', 'read', '', 'Read the model string', None),
    # ---- sent by the app but absent from the FY6600 protocol
    ('WMT', 'ch1', 'write', '0', 'CH1 attenuation (an FY2300 opcode the app still sends)', None),
    ('WFT', 'ch2', 'write', '0', 'CH2 attenuation (an FY2300 opcode the app still sends)', None),
]

APP_SENDS = {'WMW', 'WMF', 'WMA', 'WMO', 'WMD', 'WMP', 'WMN', 'WFW', 'WFF', 'WFA',
             'WFO', 'WFD', 'WFP', 'WFN', 'USA', 'USD', 'UMO', 'WMT', 'WFT'}
UNDOCUMENTED = {'WMT', 'WFT'}


def snapshot(fy):
    return {q: fy.query(q, 0.45) for q in CORE}


def sweep_commands(fy):
    results = []
    for opcode, grp, direction, payload, purpose, own_read in COMMANDS:
        for c in BASELINE:
            fy.send(c, 0.35)
        before = snapshot(fy)
        prior = fy.query(own_read, 0.45) if own_read else None

        sent = opcode + payload
        ack_ms, reply = fy.timed_send(sent, timeout=2.0)
        time.sleep(0.8)                       # let the write commit

        after_own = fy.query(own_read, 0.45) if own_read else None
        after = snapshot(fy)
        side = {k: [before[k], after[k]] for k in CORE if before[k] != after[k]}
        # A command's own register is expected to move; don't call that a side effect.
        if own_read in side:
            side.pop(own_read, None)

        took_effect = None
        if own_read:
            took_effect = int(after_own != prior or (direction == 'read'))
        elif direction == 'read':
            took_effect = int(bool(reply.strip()))

        rec = dict(opcode=opcode, group=grp, direction=direction, payload=payload,
                   purpose=purpose, sent=sent, ack_ms=ack_ms,
                   reply=(reply.strip() if direction == 'read' else after_own),
                   own_read=own_read, took_effect=took_effect,
                   side_effects=side, documented=int(opcode not in UNDOCUMENTED),
                   used_by_app=int(opcode in APP_SENDS), risk='safe', skipped=False)
        results.append(rec)
        print(f"  {sent:22} ack={'none' if ack_ms is None else str(int(ack_ms)) + 'ms':>7} "
              f"read={str(rec['reply'])[:22]:24} side={list(side) if side else '-'}", flush=True)
    for opcode, grp, direction, purpose, why in SKIPPED:
        results.append(dict(opcode=opcode, group=grp, direction=direction, payload=None,
                            purpose=purpose, sent=None, ack_ms=None, reply=None,
                            own_read=None, took_effect=None, side_effects={},
                            documented=1, used_by_app=0,
                            risk='persistent' if opcode in ('USN', 'ULN') else 'mode-change',
                            skipped=True, note=why))
        print(f"  {opcode:22} SKIPPED — {why[:60]}")
    return results


def sweep_waveforms(fy):
    """The protocol lists 95 waveform codes; the app only ever uses 00 and 01."""
    out = []
    for c in ['USD0', 'WMN0', 'WFN0']:
        fy.send(c, 0.35)
    for code in range(0, 95):
        fy.send(f'WMW{code:02d}', 0.65)
        time.sleep(0.25)
        got = fy.query('RMW', 0.45)
        accepted = got.strip().lstrip('0') == str(code) or (code == 0 and got.strip('0 ') == '')
        out.append(dict(code=code, readback=got, accepted=int(accepted)))
        if code % 10 == 0:
            print(f'  waveform {code:02d} -> {got!r}', flush=True)
    fy.send('WMW01', 0.6)
    accepted = sum(w['accepted'] for w in out)
    print(f'  {accepted}/95 waveform codes accepted')
    return out


def stress(fy):
    out = []

    def record(scenario, parameter, trials, successes, detail):
        out.append(dict(scenario=scenario, parameter=parameter, trials=trials,
                        successes=successes, detail=detail))
        print(f'  {scenario:34} {parameter:14} {successes}/{trials}  {detail}', flush=True)

    # 1. how close together can two writes be before one is lost
    for gap_ms in (0, 5, 10, 25, 50, 100, 200):
        ok = 0
        trials = 8
        for _ in range(trials):
            fy.send('WMF0', 0.35)
            fy.send('WFF0', 0.35)
            fy.write_now('WMF0001234.000000')
            if gap_ms:
                time.sleep(gap_ms / 1000.0)
            fy.write_now('WFF0005678.000000')
            time.sleep(1.0)
            a, b = fy.query('RMF', 0.4), fy.query('RFF', 0.4)
            try:
                ok += abs(float(a) - 1234) < 0.5 and abs(float(b) - 5678) < 0.5
            except ValueError:
                pass
        record('paired writes, both land', f'{gap_ms} ms gap', trials, ok,
               'the first command is lost when they are too close')

    # 2. sustained burst: how many of N rapid writes survive
    for n, gap in ((10, 0.05), (25, 0.05), (50, 0.02)):
        fy.send('WMF0', 0.4)
        for i in range(n):
            fy.write_now(f'WMF{1000 + i:07d}.000000')
            time.sleep(gap)
        time.sleep(1.5)
        got = fy.query('RMF', 0.5)
        try:
            landed = abs(float(got) - (1000 + n - 1)) < 0.5
        except ValueError:
            landed = False
        record('sustained burst, last value wins', f'{n} at {int(gap*1000)} ms', 1,
               int(landed), f'final register {got!r}, expected {1000 + n - 1}')

    # 3. boundary and malformed input, and whether the link survives it
    probes = [
        ('WMF0000000.000000', 'zero frequency'),
        ('WMF30000000.000000', '30 MHz, the model ceiling'),
        ('WMF60000000.000000', '60 MHz, above this model'),
        ('WMF99999999.999999', 'absurdly high'),
        ('WMA00.00', 'zero amplitude'),
        ('WMA20.00', 'maximum amplitude the app allows'),
        ('WMA99.99', 'above the documented range'),
        ('WMD00.0', 'zero duty cycle'),
        ('WMD99.9', 'maximum duty cycle'),
        ('WMW99', 'waveform code beyond the documented 94'),
        ('ZZZ0', 'unknown opcode'),
        ('WMF', 'opcode with no payload'),
        ('WMFabc', 'non-numeric payload'),
    ]
    for cmd, why in probes:
        ack_ms, reply = fy.timed_send(cmd, timeout=1.5)
        time.sleep(0.4)
        alive = fy.query('UMO', 0.8)
        record('boundary / malformed input', cmd[:14],
               1, int(bool(alive)),
               f'{why}: ack={"none" if ack_ms is None else str(int(ack_ms)) + "ms"}, '
               f'link {"alive" if alive else "UNRESPONSIVE"}')

    # 4. does the link recover after being flooded
    for i in range(200):
        fy.write_now(f'WMF{1000 + (i % 50):07d}.000000')
    time.sleep(2.0)
    alive = fy.query('UMO', 1.5)
    record('flood, 200 writes with no pacing', '200 commands', 1, int(bool(alive)),
           f'link {"recovered" if alive else "UNRESPONSIVE"} afterwards')
    return out


def main():
    which = sys.argv[1] if len(sys.argv) > 1 else 'all'
    fy = FY()
    data = {}
    try:
        if which in ('all', 'commands'):
            print('=== command set ===')
            data['commands'] = sweep_commands(fy)
        if which in ('all', 'waveforms'):
            print('=== waveform codes ===')
            data['waveforms'] = sweep_waveforms(fy)
        if which in ('all', 'stress'):
            print('=== stress ===')
            data['stress'] = stress(fy)
    finally:
        for c in ['USD0', 'USD1', 'USD2', 'USD3', 'USD4', 'WFF0', 'WMF0',
                  'WMA00.00', 'WFA00.00', 'WMO00.00', 'WFO00.00', 'WMD50.0', 'WFD50.0',
                  'WMW01', 'WFW01', 'WFN0', 'WMN0']:
            fy.send(c, 0.4)
        fy.close()
    if OUT.exists() and which != 'all':
        existing = json.loads(OUT.read_text())
        existing.update(data)
        data = existing
    OUT.write_text(json.dumps(data, indent=1))
    print(f'\nwrote {OUT}')


if __name__ == '__main__':
    main()

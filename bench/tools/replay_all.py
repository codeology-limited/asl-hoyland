#!/usr/bin/env python3
"""Replay every program's start-up on the real generator with the app's exact wire
pacing, then read the device back and compare with the intended state."""
import sys, json, time, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from fy import FY

HERE = pathlib.Path(__file__).parent
TRANSCRIPTS = json.loads((HERE.parent / 'data' / 'transcripts.json').read_text())

# Rust-side sleep after each command (src-tauri/src/commands/program.rs)
BATCHED = {'send_initial_commands', 'send_secondary_commands', 'sync', 'enable_waveform_sync',
           'enable_outputs', 'stop_and_reset', 'set_both_channels_to_sine_wave',
           'set_both_channels_to_square_wave', 'sine_wave', 'square_wave'}
def rust_sleep(cmd):
    if cmd in BATCHED: return 0.600
    if cmd == 'set_frequency': return 0.005
    if cmd == 'set_amplitude': return 0.200
    return 0.050

STOP = ['USD0', 'USD1', 'USD2', 'USD3', 'USD4', 'WFF0', 'WMF0', 'WFN0', 'WMN0']


def main():
    fy = FY()
    results = []
    names = sorted(TRANSCRIPTS.keys())
    only = sys.argv[1:] or names
    for idx, name in enumerate([n for n in names if n in only], 1):
        entry = TRANSCRIPTS[name]
        lines = entry['lines']
        want = entry['modelState']
        t0 = time.time()
        # stop/reset between programs exactly as the app does
        for c in STOP:
            fy.send(c, 0.6)
        unacked = []
        prev_t = lines[0]['t'] if lines else 0
        for ln in lines:
            js_gap = max(0, (ln['t'] - prev_t) / 1000.0)
            if js_gap:
                time.sleep(js_gap)
            prev_t = ln['t']
            ack = fy.send(ln['line'], rust_sleep(ln['cmd']))
            if ack == '':
                unacked.append(ln['line'])
        # --- the app's new verify-and-correct step, exactly as ProgramRunner does it ---
        corrections = []
        want_wave = want['ch1']['wave']
        want_ch1 = want['ch1']['hz']
        want_ch2 = want['ch2']['hz'] if entry['row'].get('startFrequency') or entry['row'].get('channel2frequency') else None
        for _ in range(2):
            time.sleep(1.0)                  # DEVICE_COMMIT_MS
            mw = fy.query('RMW', 0.5); mf = fy.query('RMF', 0.5); ff = fy.query('RFF', 0.5)
            mn = fy.query('RMN', 0.5); fn = fy.query('RFN', 0.5); fw = fy.query('RFW', 0.5)
            fixed = []
            wave = 'SINE' if mw == '0' else 'SQUARE' if mw == '1' else None
            if wave and wave != want_wave:
                fixed.append(f'wave {wave}->{want_wave}')
                fy.send('WMW00' if want_wave == 'SINE' else 'WMW01', 0.6)
            # split-waveform carriers own CH2's waveform too (no USA0 holds it)
            want_ch2_wave = want['ch2']['wave']
            if want_ch2_wave != want_wave:
                ch2_wave = 'SINE' if fw == '0' else 'SQUARE' if fw == '1' else None
                if ch2_wave and ch2_wave != want_ch2_wave:
                    fixed.append(f'ch2 wave {ch2_wave}->{want_ch2_wave}')
                    fy.send('WFW00' if want_ch2_wave == 'SINE' else 'WFW01', 0.6)
            try:
                if mf and abs(float(mf) - want_ch1) > max(1e-6, abs(want_ch1) * 1e-6):
                    fixed.append(f'ch1 {mf}->{want_ch1}')
                    fy.send(f'WMF{int(round(want_ch1 * 1e6)) // 1000000:07d}.{int(round(want_ch1 * 1e6)) % 1000000:06d}', 0.005)
            except ValueError:
                pass
            if want_ch2 is not None and ff:
                try:
                    if abs(float(ff) - want_ch2) > max(1e-6, abs(want_ch2) * 1e-6):
                        fixed.append(f'ch2 {ff}->{want_ch2}')
                        time.sleep(0.05)
                        fy.send(f'WFF{int(round(want_ch2 * 1e6)) // 1000000:07d}.{int(round(want_ch2 * 1e6)) % 1000000:06d}', 0.005)
                except ValueError:
                    pass
            if mn == '0' or fn == '0':
                fixed.append('outputs off')
                for c in ['WFN1', 'WMN1', 'USA2']:
                    fy.send(c, 0.6)
            if not fixed:
                break
            corrections.extend(fixed)
        time.sleep(1.0)
        got = fy.state()
        def cmp(ch):
            w, g = want[ch], got[ch]
            return {
                'hz_ok': abs((g['hz'] or 0) - w['hz']) < 0.6,
                'wave_ok': g['wave'] == w['wave'],
                'on_ok': bool(g['on']) == bool(w['outputOn']),
                'want': {'hz': w['hz'], 'wave': w['wave'], 'on': w['outputOn']},
                'got': {'hz': g['hz'], 'wave': g['wave'], 'on': g['on'], 'v': g['v']},
            }
        rec = {'name': name, 'corrections': corrections, 'ch1': cmp('ch1'), 'ch2': cmp('ch2'),
               'sync': {'wave': got['syncWave'], 'freq': got['syncFreq'], 'amp': got['syncAmp']},
               'unacked': unacked, 'lines': len(lines), 'secs': round(time.time() - t0, 1)}
        rec['pass'] = all(rec[c][k] for c in ('ch1', 'ch2') for k in ('hz_ok', 'wave_ok', 'on_ok'))
        results.append(rec)
        mark = 'PASS' if rec['pass'] else 'FAIL'
        print(f"[{idx:2}/{len(only)}] {mark} {name:26} "
              f"CH1 {rec['ch1']['got']['hz']!s:>12} {rec['ch1']['got']['wave']:<6} on={rec['ch1']['got']['on']!s:<5} | "
              f"CH2 {rec['ch2']['got']['hz']!s:>12} {rec['ch2']['got']['wave']:<6} on={rec['ch2']['got']['on']!s:<5} "
              f"({rec['secs']}s){' FIXED: ' + '; '.join(corrections) if corrections else ''}", flush=True)
        if not rec['pass']:
            for ch in ('ch1', 'ch2'):
                if not all(rec[ch][k] for k in ('hz_ok', 'wave_ok', 'on_ok')):
                    print(f"        {ch}: want {rec[ch]['want']} got {rec[ch]['got']}", flush=True)
        (HERE.parent / 'data' / 'replay_final.json').write_text(json.dumps(results, indent=1))
    for c in STOP:
        fy.send(c, 0.6)
    fy.close()
    npass = sum(1 for r in results if r['pass'])
    print(f"\n==== {npass}/{len(results)} programs matched the intended device state ====")


main()

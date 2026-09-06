#!/usr/bin/env python3
"""Is the sub-Hz frequency error deterministic, and is it the app's format or the device?"""
import sys, time, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from fy import FY

fy = FY()
CASES = [0.07, 0.08, 0.16, 0.5, 0.57, 0.62, 0.87, 1.0, 2.5, 5.81, 42.7]

def app_format(hz):                       # what program.rs emits
    micro = round(hz * 1_000_000)
    return f'WMF{micro // 1_000_000:07d}.{micro % 1_000_000:06d}'

def vendor_format(hz):                    # what the vendor doc specifies: 14-digit uHz, no dot
    return f'WMF{round(hz * 1_000_000):014d}'

print('=== the app\'s dotted decimal-Hz format, 3 trials each ===')
print(f'{"want":>10} {"command":24} {"trial1":>12} {"trial2":>12} {"trial3":>12}  verdict')
bad_app = []
for hz in CASES:
    cmd = app_format(hz)
    reads = []
    for _ in range(3):
        fy.send('WMF0', 0.6)
        fy.send(cmd, 0.7)
        time.sleep(0.3)
        reads.append(fy.query('RMF', 0.5))
    vals = [float(r) if r else -1 for r in reads]
    ok = all(abs(v - hz) < 1e-6 for v in vals)
    if not ok:
        bad_app.append((hz, vals))
    print(f'{hz:10} {cmd:24} {vals[0]:>12} {vals[1]:>12} {vals[2]:>12}  {"ok" if ok else "WRONG"}')

print('\n=== the vendor-documented 14-digit micro-Hz format, same values ===')
print(f'{"want":>10} {"command":24} {"read back":>14}  verdict')
for hz, _ in bad_app or [(h, None) for h in CASES]:
    cmd = vendor_format(hz)
    fy.send('WMF0', 0.6)
    fy.send(cmd, 0.7)
    time.sleep(0.3)
    got = fy.query('RMF', 0.5)
    v = float(got) if got else -1
    print(f'{hz:10} {cmd:24} {v:>14}  {"ok" if abs(v - hz) < 1e-6 else "WRONG"}')

print('\n=== does the value stick, or drift after other commands? ===')
fy.send('WMF0', 0.5)
fy.send(app_format(0.08), 0.7)
print('  after set          ', fy.query('RMF', 0.5))
for extra in ['WMW01', 'USA0', 'USA1', 'WFN1', 'WMN1', 'USA2']:
    fy.send(extra, 0.65)
    print(f'  after {extra:6}       ', fy.query('RMF', 0.5))
for c in ['USD0','USD1','USD2','USD3','USD4','WFF0','WMF0','WFN0','WMN0']:
    fy.send(c, 0.5)
fy.close()

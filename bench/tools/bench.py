"""Experiment harness: apply a command sequence, read the device back, record a verdict."""
import json, time, sys, pathlib
from fy import FY

RESULTS = []
OUT = pathlib.Path(__file__).parent / 'results'
OUT.mkdir(exist_ok=True)

# Known-safe idle state: sync off, 0 Hz, 0 V, square, outputs off.
RESET = ['USD0', 'USD1', 'USD2', 'USD3', 'USD4', 'WMN0', 'WFN0',
         'WMF0000000.000000', 'WFF0000000.000000', 'WMA00.00', 'WFA00.00', 'WMW01', 'WFW01']


class Bench:
    def __init__(self):
        self.fy = FY()

    def reset(self, gap=0.25):
        for c in RESET:
            self.fy.send(c, gap)

    def apply(self, cmds, gap=0.6):
        """Send commands, returning the ack for each ('' means no reply)."""
        acks = []
        for c in cmds:
            acks.append(self.fy.send(c, gap))
        return acks

    def state(self):
        return self.fy.state()

    def run(self, eid, question, cmds, expect, gap=0.6, reset=True, note=''):
        if reset:
            self.reset()
        acks = self.apply(cmds, gap)
        st = self.state()
        obs = {k: v for k, v in st.items() if k != 'raw'}
        ok = True
        detail = []
        for path, want in expect.items():
            cur = st
            for part in path.split('.'):
                cur = cur[part] if isinstance(cur, dict) else None
            match = (abs(cur - want) < 0.5) if isinstance(want, (int, float)) and isinstance(cur, (int, float)) and not isinstance(want, bool) else (cur == want)
            if not match:
                ok = False
                detail.append(f'{path}: want {want!r} got {cur!r}')
        rec = {'id': eid, 'question': question, 'sequence': cmds, 'gap_ms': int(gap * 1000),
               'expected': expect, 'observed': obs, 'verdict': 'PASS' if ok else 'MISMATCH',
               'mismatches': detail, 'unacked': [c for c, a in zip(cmds, acks) if a == ''], 'note': note}
        RESULTS.append(rec)
        flag = '  ok' if ok else 'DIFF'
        print(f'[{flag}] {eid}: {question}')
        if detail:
            for d in detail:
                print(f'         {d}')
        return rec

    def close(self):
        self.fy.close()


def save(name):
    path = OUT / f'{name}.json'
    path.write_text(json.dumps(RESULTS, indent=1))
    print(f'\n-> {len(RESULTS)} results written to {path}')

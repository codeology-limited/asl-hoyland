#!/usr/bin/env python3
"""FY6300/FY6600 bench driver — stdlib only (termios on a raw fd, DTR/RTS asserted).

  fy.py probe                            UMO identity
  fy.py read                             query device state via R* commands
  fy.py send [--gap=MS] CMD [CMD...]     send commands (\\n appended unless given)
"""
import os, sys, time, select, termios, fcntl, struct

PORT = '/dev/cu.usbserial-210'


class FY:
    def __init__(self, settle=0.30):
        self.fd = os.open(PORT, os.O_RDWR | os.O_NOCTTY | os.O_NONBLOCK)
        a = termios.tcgetattr(self.fd)
        a[0] = 0                                              # iflag: no translation/flow
        a[1] = 0                                              # oflag: raw
        a[2] = termios.CS8 | termios.CREAD | termios.CLOCAL    # 8N1, ignore modem status
        a[3] = 0                                              # lflag: non-canonical, no echo
        a[4] = a[5] = termios.B115200
        a[6][termios.VMIN] = 0
        a[6][termios.VTIME] = 0
        termios.tcsetattr(self.fd, termios.TCSANOW, a)
        # CH340 needs DTR/RTS asserted (the node serialport lib does this on open).
        fcntl.ioctl(self.fd, termios.TIOCMBIS, struct.pack('I', termios.TIOCM_DTR | termios.TIOCM_RTS))
        time.sleep(settle)
        termios.tcflush(self.fd, termios.TCIOFLUSH)

    def _read_for(self, seconds):
        got = b''
        deadline = time.time() + seconds
        while time.time() < deadline:
            r, _, _ = select.select([self.fd], [], [], max(0.0, deadline - time.time()))
            if not r:
                break
            try:
                chunk = os.read(self.fd, 4096)
            except BlockingIOError:
                continue
            if chunk:
                got += chunk
        return got

    def send(self, cmd, wait=0.6):
        payload = cmd if cmd.endswith(('\n', '\r\n')) else cmd + '\n'
        os.write(self.fd, payload.encode('latin1'))
        return self._read_for(wait).decode('latin1')

    def write_now(self, cmd):
        """Write without waiting for the ack — for true back-to-back pacing tests."""
        payload = cmd if cmd.endswith(('\n', '\r\n')) else cmd + '\n'
        os.write(self.fd, payload.encode('latin1'))

    def timed_send(self, cmd, timeout=2.0):
        """Send one command and time how long the ack takes. (None, '') if it never acks."""
        termios.tcflush(self.fd, termios.TCIFLUSH)
        payload = cmd if cmd.endswith(('\n', '\r\n')) else cmd + '\n'
        t0 = time.time()
        os.write(self.fd, payload.encode('latin1'))
        deadline = t0 + timeout
        got = b''
        while time.time() < deadline:
            r, _, _ = select.select([self.fd], [], [], max(0.0, deadline - time.time()))
            if not r:
                break
            try:
                chunk = os.read(self.fd, 4096)
            except BlockingIOError:
                continue
            if chunk:
                got += chunk
                return (time.time() - t0) * 1000.0, got.decode('latin1')
        return None, got.decode('latin1')

    def query(self, cmd, wait=0.45):
        # Flush first: the device acks every write with 0x0a and nothing consumes those
        # acks during a paced sequence, so a stale ack would be read as THIS query's
        # reply and shift every subsequent read by one register.
        termios.tcflush(self.fd, termios.TCIFLUSH)
        return self.send(cmd, wait).replace('\r', '').replace('\n', '').strip()

    def state(self):
        """Decoded device state read back over the wire (the real oracle)."""
        def num(v):
            try:
                return float(v)
            except ValueError:
                return None
        w = {'0': 'SINE', '1': 'SQUARE'}
        raw = {label: self.query(q) for label, q in
               [('mw', 'RMW'), ('fw', 'RFW'), ('mf', 'RMF'), ('ff', 'RFF'),
                ('ma', 'RMA'), ('fa', 'RFA'), ('mn', 'RMN'), ('fn', 'RFN'),
                ('s0', 'RSA0'), ('s1', 'RSA1'), ('s2', 'RSA2')]}
        onoff = lambda v: None if v == '' else (v.strip('0') != '' )
        return {
            'ch1': {'wave': w.get(raw['mw'].lstrip('0') or '0', raw['mw']),
                    'hz': num(raw['mf']),
                    'v': (num(raw['ma']) or 0) / 10000.0,
                    'on': onoff(raw['mn'])},
            'ch2': {'wave': w.get(raw['fw'].lstrip('0') or '0', raw['fw']),
                    'hz': num(raw['ff']),
                    'v': (num(raw['fa']) or 0) / 10000.0,
                    'on': onoff(raw['fn'])},
            'syncWave': onoff(raw['s0']), 'syncFreq': onoff(raw['s1']), 'syncAmp': onoff(raw['s2']),
            'raw': raw,
        }

    def close(self):
        os.close(self.fd)


READS = [('CH1 wave', 'RMW'), ('CH2 wave', 'RFW'), ('CH1 freq', 'RMF'), ('CH2 freq', 'RFF'),
         ('CH1 ampl', 'RMA'), ('CH2 ampl', 'RFA'), ('CH1 out', 'RMN'), ('CH2 out', 'RFN'),
         ('sync wave', 'RSA0'), ('sync freq', 'RSA1'), ('sync ampl', 'RSA2')]


def main():
    args = sys.argv[1:]
    if not args:
        print(__doc__); return 2
    mode, args = args[0], args[1:]
    gap, rest = 600, []
    for a in args:
        if a.startswith('--gap='):
            gap = int(a.split('=')[1])
        else:
            rest.append(a)
    fy = FY()
    try:
        if mode == 'probe':
            print('UMO ->', repr(fy.send('UMO\r\n', 0.7)))
        elif mode == 'read':
            for label, q in READS:
                print(f'{label:10} {q:5} -> {fy.query(q)!r}')
        elif mode == 'send':
            for c in rest:
                c = c.replace('\\r', '\r').replace('\\n', '\n')
                t0 = time.time()
                rep = fy.send(c, gap / 1000.0)
                print(f'{c.strip()!r:28} reply={rep!r:14} ({int((time.time()-t0)*1000)}ms)')
        else:
            print(__doc__); return 2
    finally:
        fy.close()
    return 0


if __name__ == '__main__':
    sys.exit(main())

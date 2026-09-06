-- Hardware knowledge base for the FY6300/FY6600 signal generator this app drives.
--
-- Everything here was MEASURED on a real unit over the serial link, not inferred from
-- the vendor documentation (which is wrong in several places — see `quirks`). The point
-- of the database is that the next person to touch the device sequencing can check a
-- belief against evidence instead of re-deriving it, and can tell the difference between
-- "the app sends the right bytes" and "the box actually did the right thing".
--
-- Rebuild from the raw JSON with:  python3 bench/build.py
-- Query with:                      sqlite3 bench/device.db

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------- units under test
CREATE TABLE IF NOT EXISTS device (
    id            INTEGER PRIMARY KEY,
    model         TEXT NOT NULL,       -- as returned by the UMO identity query
    usb_adapter   TEXT,                -- e.g. "CH340 (1a86:7523)"
    port          TEXT,                -- e.g. "/dev/cu.usbserial-210"
    baud          INTEGER DEFAULT 115200,
    notes         TEXT
);

-- ---------------------------------------------------------------- when data was taken
CREATE TABLE IF NOT EXISTS session (
    id            INTEGER PRIMARY KEY,
    started       TEXT NOT NULL,       -- ISO date
    device_id     INTEGER REFERENCES device(id),
    app_version   TEXT,                -- version string shown in the app footer
    git_commit    TEXT,                -- repo HEAD at the time
    tooling       TEXT,                -- how the link was driven
    notes         TEXT
);

-- ---------------------------------------------------------------- command experiments
-- One row per controlled experiment: send a sequence, read the registers back, compare
-- with what the sequence was supposed to achieve.
CREATE TABLE IF NOT EXISTS experiment (
    id            INTEGER PRIMARY KEY,
    session_id    INTEGER REFERENCES session(id),
    ref           TEXT,                -- short id used in the run logs, e.g. "B1", "C9"
    question      TEXT NOT NULL,       -- what the experiment was trying to settle
    sequence      TEXT NOT NULL,       -- JSON array of commands, in order
    gap_ms        INTEGER,             -- delay between commands
    expected      TEXT,                -- JSON of the expected register state
    observed      TEXT,                -- JSON of what the device actually reported
    verdict       TEXT CHECK (verdict IN ('PASS','MISMATCH')),
    mismatches    TEXT,                -- JSON array of human-readable differences
    unacked       TEXT,                -- JSON array of commands the device never acked
    note          TEXT
);

-- ---------------------------------------------------------------- timing measurements
CREATE TABLE IF NOT EXISTS measurement (
    id            INTEGER PRIMARY KEY,
    session_id    INTEGER REFERENCES session(id),
    subject       TEXT NOT NULL,       -- the command or behaviour measured
    metric        TEXT NOT NULL,       -- 'ack_latency', 'commit_latency', ...
    value         REAL,                -- NULL means "never happened"
    unit          TEXT,
    note          TEXT
);

-- ---------------------------------------------------------------- per-program results
-- One row per program per hardware replay. `pass_strict` uses a 0.5 ppm frequency
-- tolerance; the looser `pass_loose` is what the replay script reported at the time and
-- is kept so the two runs stay comparable.
CREATE TABLE IF NOT EXISTS program_run (
    id            INTEGER PRIMARY KEY,
    session_id    INTEGER REFERENCES session(id),
    run_label     TEXT NOT NULL,       -- 'baseline' or 'verified'
    program       TEXT NOT NULL,
    ch1_want_hz   REAL, ch1_got_hz   REAL,
    ch1_want_wave TEXT, ch1_got_wave TEXT,
    ch1_want_on   INTEGER, ch1_got_on INTEGER,
    ch2_want_hz   REAL, ch2_got_hz   REAL,
    ch2_want_wave TEXT, ch2_got_wave TEXT,
    ch2_want_on   INTEGER, ch2_got_on INTEGER,
    corrections   TEXT,                -- JSON array; what verify-and-correct had to fix
    unacked       TEXT,
    seconds       REAL,
    pass_loose    INTEGER,
    pass_strict   INTEGER
);

-- ---------------------------------------------------------------- exact wire capture
-- The byte-for-byte serial sequence the app produces for each program, captured through
-- the virtual device. This is the input to the hardware replay.
CREATE TABLE IF NOT EXISTS transcript_line (
    id            INTEGER PRIMARY KEY,
    program       TEXT NOT NULL,
    seq           INTEGER NOT NULL,    -- 0-based position in the sequence
    line          TEXT NOT NULL,       -- the ASCII command, newline stripped
    tauri_command TEXT,                -- which backend command emitted it
    js_gap_ms     INTEGER              -- frontend sleep before this line
);
CREATE INDEX IF NOT EXISTS idx_transcript_program ON transcript_line(program);

-- ---------------------------------------------------------------- program properties
CREATE TABLE IF NOT EXISTS program (
    name             TEXT PRIMARY KEY,
    category         TEXT,             -- UI tab: rife / ttf / fsm
    runner_category  TEXT,             -- engine path: carrier / mirror / independent
    ch1_wavetype     TEXT,
    ch2_wavetype     TEXT,
    start_frequency_mhz REAL,
    channel2_frequency_hz REAL,
    run_time_minutes REAL,
    steps            INTEGER,
    looped           INTEGER,
    pulsed           INTEGER,
    ranged           INTEGER,
    bad_freq_steps   INTEGER,          -- steps hit by the parser overflow (see quirks)
    notes            TEXT
);

-- ---------------------------------------------------------------- device behaviour
-- Durable rules about how the hardware behaves. These override the vendor documentation.
CREATE TABLE IF NOT EXISTS quirk (
    id           INTEGER PRIMARY KEY,
    title        TEXT NOT NULL,
    rule         TEXT NOT NULL,        -- what to believe
    evidence     TEXT NOT NULL,        -- how it was established
    confidence   TEXT CHECK (confidence IN ('measured','inferred','suspected')),
    affects      TEXT,                 -- what in the app depends on it
    first_seen   TEXT
);

-- ---------------------------------------------------------------- open issues
CREATE TABLE IF NOT EXISTS finding (
    id           INTEGER PRIMARY KEY,
    title        TEXT NOT NULL,
    severity     TEXT CHECK (severity IN ('safety','bug','doc','hygiene')),
    status       TEXT CHECK (status IN ('fixed','open','needs-decision','wontfix')),
    statement    TEXT NOT NULL,
    evidence     TEXT,
    fix          TEXT,                 -- the validated fix, or what remains
    reported_by  TEXT,                 -- field reporter and date, where applicable
    programs     TEXT                  -- JSON array of affected program names
);

-- ---------------------------------------------------------------- convenience views
CREATE VIEW IF NOT EXISTS v_program_verdicts AS
SELECT program,
       MAX(CASE WHEN run_label='baseline' THEN pass_strict END) AS baseline_ok,
       MAX(CASE WHEN run_label='verified' THEN pass_strict END) AS verified_ok,
       MAX(CASE WHEN run_label='verified' THEN corrections END) AS corrections_applied
FROM program_run GROUP BY program ORDER BY program;

CREATE VIEW IF NOT EXISTS v_open_issues AS
SELECT severity, status, title, statement, fix FROM finding
WHERE status IN ('open','needs-decision')
ORDER BY CASE severity WHEN 'safety' THEN 0 WHEN 'bug' THEN 1 WHEN 'doc' THEN 2 ELSE 3 END;

CREATE VIEW IF NOT EXISTS v_startup_sequence AS
SELECT program, seq, line, tauri_command, js_gap_ms
FROM transcript_line ORDER BY program, seq;

-- ---------------------------------------------------------------- command catalogue
-- Every opcode in the vendor protocol document, plus the two the app sends that are not
-- in it, with what the hardware actually did when each was tried.
CREATE TABLE IF NOT EXISTS command (
    opcode        TEXT PRIMARY KEY,
    grp           TEXT,                -- ch1 / ch2 / modulation / measurement / sweep / system
    direction     TEXT,                -- write / read / utility
    purpose       TEXT,
    payload       TEXT,                -- the payload sent during the sweep
    documented    INTEGER,             -- appears in the FY6600 protocol document
    used_by_app   INTEGER,             -- asl-hoyland sends it
    risk          TEXT,                -- safe / persistent / mode-change
    tested        INTEGER,
    acked         INTEGER,             -- device replied at all
    ack_ms        REAL,
    reply         TEXT,                -- what a read command returned
    took_effect   INTEGER,             -- its own read-back changed as intended
    side_effects  TEXT,                -- JSON: other registers that moved
    notes         TEXT
);

CREATE TABLE IF NOT EXISTS command_trial (
    id            INTEGER PRIMARY KEY,
    session_id    INTEGER REFERENCES session(id),
    opcode        TEXT,
    sent          TEXT NOT NULL,
    ack_ms        REAL,                -- NULL means no acknowledgement
    reply         TEXT,
    state_before  TEXT,                -- JSON snapshot
    state_after   TEXT,
    note          TEXT
);

CREATE TABLE IF NOT EXISTS stress_result (
    id            INTEGER PRIMARY KEY,
    session_id    INTEGER REFERENCES session(id),
    scenario      TEXT NOT NULL,
    parameter     TEXT,
    trials        INTEGER,
    successes     INTEGER,
    detail        TEXT
);

CREATE VIEW IF NOT EXISTS v_command_summary AS
SELECT grp, opcode, direction, purpose,
       CASE WHEN acked THEN printf('%d ms', ack_ms) ELSE 'no ack' END AS ack,
       CASE WHEN took_effect IS NULL THEN '' WHEN took_effect THEN 'yes' ELSE 'NO' END AS effective,
       reply, used_by_app, risk
FROM command ORDER BY grp, opcode;

-- ---------------------------------------------------------------- waveform catalogue
-- The protocol lists 95 waveform codes. The app only ever uses 00 (sine) and 01 (square);
-- this records which the hardware actually accepts, in case a therapy ever wants another.
CREATE TABLE IF NOT EXISTS waveform (
    code       INTEGER PRIMARY KEY,
    name       TEXT,                  -- vendor name for the code
    accepted   INTEGER,               -- device echoed the code back
    readback   TEXT,
    used_by_app INTEGER
);

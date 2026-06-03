# Test Plan

This document tracks test coverage for the serial/command layer and the program
engine. Items are marked **[DONE]** when a real, non-trivial test exists in the
repo, **[PARTIAL]** when some coverage exists but gaps remain, and
**[ASPIRATIONAL]** for planned work not yet implemented.

## Status summary (current)

**Implemented today:**

- Rust command tests exercise the **real** frequency and amplitude formatting
  and the stop/initial/secondary/enable command sequences
  (`src-tauri/src/commands/program.rs`, `io.rs`).
- The deadman watchdog and force-stop path have unit tests
  (`src-tauri/src/commands/session.rs`, `app_state.rs`).
- The `perform_real_port_write` / `log_test_port_data` port layer has tests,
  including poisoned-lock recovery (`app_state.rs`).
- The frontend `ProgramRunner` suite covers sweep (`sweepTo`), pulsed
  (`onkeysec`/`offkeysec`), continuous, range, pause/resume, command ordering
  (outputs enabled last), mirror, waveform selection, and the ultrasound special
  case (`src/util/__tests__/ProgramRunner.test.ts`).

**Still aspirational:**

- Full Tauri-command integration tests that drive `set_frequency` /
  `set_amplitude` / `stop_and_reset` through a real `State<AppState>` + `Window`
  and assert on bytes captured from an injectable mock port.
- Dependency-injected mocking of `serialport::available_ports` / `serialport::new`
  to test `reconnect_device` hardware/fallback paths and `use_test_port`.
- Automated coverage collection (tarpaulin/llvm-cov) and a `make coverage` flow.

---

1. **Map coverage gaps**
   - Review existing Rust tests (app_state/data formatting/IO) and note missing commands (set_frequency, set_amplitude, send_initial/secondary/sync/stop, square-wave, sinewave, reconnect_device, use_test_port).
     - **[DONE]** Formatting/sequencing tests now exist: `program.rs` tests call
       the real frequency formatter (`format_frequency_cmd`), the real amplitude
       formatter (`format_amplitude_cmd`), and assert the exact
       `INITIAL`/`SECONDARY`/`ENABLE_OUTPUT`/`STOP` command arrays (including that
       outputs are NOT enabled in the initial/secondary batches).
     - **[ASPIRATIONAL]** `reconnect_device` / `use_test_port` still lack
       hardware/fallback unit tests (need DI/mocking of `serialport`).
   - Identify mock points (write_to_port, send_batched_commands, serial port handles) to observe emitted commands without needing actual hardware.
     - **[PARTIAL]** The dummy `PortHandle` / `log_test_port_data` path is tested,
       but `send_batched_commands` is not yet asserted byte-for-byte through a
       command entrypoint.

2. **Mock serial port layer** — **[PARTIAL]**
   - Extend the current dummy port/Arc buffer to expose `write` calls and configurable errors.
   - Provide helper constructors that can report when a command hits the wire or inject I/O failures.
   - Ensure `AppState::perform_real_port_write` uses the mock when registered so command tests can assert contents.
     - **[DONE]** `perform_real_port_write_uses_port` and
       `perform_real_port_write_recovers_poisoned_lock` cover the write path and
       a poisoned-lock failure case.
     - **[ASPIRATIONAL]** A configurable error-injecting mock for asserting
       descriptive error returns from higher-level commands is not yet built.

3. **Command tests** — **[PARTIAL]**
   - For each Tauri command (`set_frequency`, `set_amplitude`, `set_both_channels_to_square_wave`, `send_initial_commands`, `sync`, `send_secondary_commands`, `stop_and_reset`, `sine_wave`):
     * Call the function with fake `State<AppState>` and `Window` (may stub `Window` if necessary or use a dummy struct that implements the minimal traits).
     * Register the dummy port and capture the written bytes.
     * Assert the exact command sequences (prefixes/durations/amplitude formatting) and verify the function returns `Ok(true)`.
     - **[DONE]** The pure formatting and the static command arrays are asserted
       directly (see `program.rs` `#[cfg(test)]`): frequency formatting for CH1/CH2,
       amplitude min/rounding/max, and the full stop/initial/secondary/enable
       sequences.
     - **[ASPIRATIONAL]** Invoking the `#[tauri::command]` functions end-to-end
       with a stubbed `Window` and asserting captured bytes is still open (the
       current tests extract the formatting/sequence logic instead of stubbing
       `Window`).
   - Exercise error paths by having the mock return `Err` and confirming the command returns a descriptive error.
     - **[ASPIRATIONAL]** Not yet covered at the command level.

4. **Connection command tests** — **[ASPIRATIONAL]**
   - Create a fake `serialport::SerialPort` instance that reports given strings from `read`.
   - Mock `serialport::available_ports` and `serialport::new` using dependency injection or Detour (if feasible) to simulate real hardware and failure paths.
   - Test `reconnect_device`: success path picks a port, writes the handshake, updates `ports`/`PORT_NAME`, emits "reconnected" event, and returns the port name.
   - Test fallback path: no hardware, so it inserts "TEST" into `ports`, updates `PORT_NAME`, emits the event, and returns "TEST".
   - Verify `use_test_port` sets the test entry and emits the event as expected.
   - **[DONE (smoke only)]** `list_ports_always_includes_test` confirms `"TEST"`
     is always offered, but the reconnect/fallback handshake flow itself is not
     yet unit-tested.

5. **Integration-style scenarios** — **[ASPIRATIONAL]**
   - Combine commands (frequency + amplitude + square wave) and inspect order/values via the dummy port buffer to ensure they match usage patterns.
   - Simulate state where `PORT_NAME` already contains a live port to ensure reconnect/close flows skip duplicates.
   - **Note:** the *frontend* equivalent — ordering of amplitude/frequency/
     waveform vs. output-enable — IS covered by the `ProgramRunner` Vitest suite
     (outputs enabled last, pulsed/sweep/range sequencing). The Rust-side
     buffer-inspection version remains open.

6. **Deadman watchdog / safety** — **[DONE]**
   - `session.rs` tests cover a fresh heartbeat (no breach), a missed heartbeat
     (breach), max-session bounds, and that `session_stop` disarms the watchdog.
   - `app_state.rs` `force_stop_writes_all_stop_commands` and
     `force_stop_is_best_effort_when_no_port` cover the force-stop sequence used
     by the watchdog.

7. **Automate coverage collection** — **[ASPIRATIONAL]**
   - Use `cargo-tarpaulin`/`llvm-cov` once the nightly toolchain and dependencies are installed (per Makefile).
   - Document how to rerun coverage (`make coverage` or `cargo +nightly tarpaulin --out Html`).
   - Frontend coverage is wired today via `npm run coverage` (Vitest); Rust
     coverage automation is still pending.

8. **Future work** — **[ASPIRATIONAL]**
   - Explore adding Rust-based integration tests via `tauri::Builder` (headless) if deeper UI command coverage is needed.
   - Keep tracking new command code paths when features expand (e.g., mirror intensity, multiple channels).

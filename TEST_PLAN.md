1. **Map coverage gaps**
   - Review existing Rust tests (app_state/data formatting/IO) and note missing commands (set_frequency, set_amplitude, send_initial/secondary/sync/stop, square-wave, sinewave, reconnect_device, use_test_port).
   - Identify mock points (write_to_port, send_batched_commands, serial port handles) to observe emitted commands without needing actual hardware.

2. **Mock serial port layer**
   - Extend the current dummy port/Arc buffer to expose `write` calls and configurable errors.
   - Provide helper constructors that can report when a command hits the wire or inject I/O failures.
   - Ensure `AppState::perform_real_port_write` uses the mock when registered so command tests can assert contents.

3. **Command tests**
   - For each Tauri command (`set_frequency`, `set_amplitude`, `set_both_channels_to_square_wave`, `send_initial_commands`, `sync`, `send_secondary_commands`, `stop_and_reset`, `sine_wave`):
     * Call the function with fake `State<AppState>` and `Window` (may stub `Window` if necessary or use a dummy struct that implements the minimal traits).
     * Register the dummy port and capture the written bytes.
     * Assert the exact command sequences (prefixes/durations/amplitude formatting) and verify the function returns `Ok(true)`.
   - Exercise error paths by having the mock return `Err` and confirming the command returns a descriptive error.

4. **Connection command tests**
   - Create a fake `serialport::SerialPort` instance that reports given strings from `read`.
   - Mock `serialport::available_ports` and `serialport::new` using dependency injection or Detour (if feasible) to simulate real hardware and failure paths.
   - Test `reconnect_device`: success path picks a port, writes the handshake, updates `ports`/`PORT_NAME`, emits “reconnected” event, and returns the port name.
   - Test fallback path: no hardware, so it inserts “TEST” into `ports`, updates `PORT_NAME`, emits the event, and returns “TEST”.
   - Verify `use_test_port` sets the test entry and emits the event as expected.

5. **Integration-style scenarios**
   - Combine commands (frequency + amplitude + square wave) and inspect order/values via the dummy port buffer to ensure they match usage patterns.
   - Simulate state where `PORT_NAME` already contains a live port to ensure reconnect/close flows skip duplicates.

6. **Automate coverage collection**
   - Use `cargo-tarpaulin`/`llvm-cov` once the nightly toolchain and dependencies are installed (per Makefile).
   - Document how to rerun coverage (`make coverage` or `cargo +nightly tarpaulin --out Html`).

7. **Future work**
   - Explore adding Rust-based integration tests via `tauri::Builder` (headless) if deeper UI command coverage is needed.
   - Keep tracking new command code paths when features expand (e.g., mirror intensity, multiple channels).

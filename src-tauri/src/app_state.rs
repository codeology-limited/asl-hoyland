use lazy_static::lazy_static;
use serialport::SerialPort;
use std::collections::HashMap;
use std::io::Write;
use std::sync::Mutex;
use std::time::Instant;

lazy_static! {
    pub static ref PORT_NAME: Mutex<String> = Mutex::new("TEST".to_string());
}

pub struct PortHandle(pub Mutex<Option<Box<dyn SerialPort + Send>>>);

/// Deadman/heartbeat session tracking for the watchdog. When a therapeutic
/// session is `active`, the watchdog force-stops the device if no heartbeat has
/// arrived within HEARTBEAT_TIMEOUT or the session has run past MAX_SESSION.
#[derive(Default)]
pub struct SessionState {
    pub active: bool,
    pub last_heartbeat: Option<Instant>,
    pub started_at: Option<Instant>,
}

pub struct AppState {
    pub ports: Mutex<HashMap<String, PortHandle>>,
    pub session: Mutex<SessionState>,
}

pub fn log_test_port_data(data: &str) -> Result<bool, String> {
    println!("Test Port received data: {}", data);
    Ok(true)
}

pub fn perform_real_port_write(
    ports: &Mutex<HashMap<String, PortHandle>>,
    data: &str,
) -> Result<bool, String> {
    // Poison-tolerant locks: a panic elsewhere must never brick the write/STOP
    // path on this safety-critical device. Recover the inner guard either way.
    let port_name = PORT_NAME.lock().unwrap_or_else(|e| e.into_inner()).clone();
    println!(
        "perform_real_port_write called with port_name: {} and data: {}",
        port_name, data
    );
    if let Some(handle) = ports.lock().unwrap_or_else(|e| e.into_inner()).get(&port_name) {
        if let Some(port) = handle.0.lock().unwrap_or_else(|e| e.into_inner()).as_mut() {
            port.write_all(data.as_bytes()).map_err(|e| {
                println!("Failed to write to port: {}", e);
                e.to_string()
            })?;
            port.flush().map_err(|e| {
                println!("Failed to flush port: {}", e);
                e.to_string()
            })?;
            return Ok(true);
        }
    }
    Err("Port not found".to_string())
}

/// Best-effort synchronous force-stop of the device. Writes every command in
/// STOP_COMMANDS (disable sync, reset frequencies, turn off channels) ignoring
/// per-write errors so a single failure can't abort the safety shutdown. Used by
/// the window-close handler and the deadman watchdog — keep it bounded (no
/// sleeps/loops beyond iterating the fixed STOP_COMMANDS list).
pub fn force_stop(ports: &Mutex<HashMap<String, PortHandle>>) {
    for cmd in crate::commands::program::STOP_COMMANDS.iter() {
        if let Err(e) = perform_real_port_write(ports, cmd) {
            // Best-effort: log and keep going so every STOP command is attempted.
            println!("force_stop: write of {:?} failed: {}", cmd, e);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serialport::{ClearBuffer, DataBits, FlowControl, Parity, Result, SerialPort, StopBits};
    use std::io::{Read, Result as IoResult, Write};
    use std::sync::{Arc, Mutex};
    use std::time::Duration;

    #[test]
    fn log_test_port_data_ok() {
        let res = log_test_port_data("PING");
        assert_eq!(res, Ok(true));
    }

    #[test]
    fn perform_real_port_write_without_handle_fails() {
        let ports_map: Mutex<HashMap<String, PortHandle>> = Mutex::new(HashMap::new());
        let err = perform_real_port_write(&ports_map, "CMD").unwrap_err();
        assert!(err.contains("Port not found"));

        ports_map
            .lock()
            .unwrap()
            .insert("TEST".to_string(), PortHandle(Mutex::new(None)));
        let err2 = perform_real_port_write(&ports_map, "CMD").unwrap_err();
        assert!(err2.contains("Port not found"));
    }

    #[derive(Clone)]
    struct DummyPort {
        buffer: Arc<Mutex<Vec<u8>>>,
    }

    impl DummyPort {
        fn new(buffer: Arc<Mutex<Vec<u8>>>) -> Self {
            Self { buffer }
        }
    }

    impl Read for DummyPort {
        fn read(&mut self, _buf: &mut [u8]) -> IoResult<usize> {
            Ok(0)
        }
    }

    impl Write for DummyPort {
        fn write(&mut self, buf: &[u8]) -> IoResult<usize> {
            self.buffer.lock().unwrap().extend_from_slice(buf);
            Ok(buf.len())
        }

        fn flush(&mut self) -> IoResult<()> {
            Ok(())
        }
    }

    impl SerialPort for DummyPort {
        fn name(&self) -> Option<String> {
            Some("TEST".into())
        }

        fn baud_rate(&self) -> Result<u32> {
            Ok(9600)
        }

        fn data_bits(&self) -> Result<DataBits> {
            Ok(DataBits::Eight)
        }

        fn flow_control(&self) -> Result<FlowControl> {
            Ok(FlowControl::None)
        }

        fn parity(&self) -> Result<Parity> {
            Ok(Parity::None)
        }

        fn stop_bits(&self) -> Result<StopBits> {
            Ok(StopBits::One)
        }

        fn timeout(&self) -> Duration {
            Duration::from_millis(0)
        }

        fn set_baud_rate(&mut self, _baud_rate: u32) -> Result<()> {
            Ok(())
        }

        fn set_data_bits(&mut self, _data_bits: DataBits) -> Result<()> {
            Ok(())
        }

        fn set_flow_control(&mut self, _flow_control: FlowControl) -> Result<()> {
            Ok(())
        }

        fn set_parity(&mut self, _parity: Parity) -> Result<()> {
            Ok(())
        }

        fn set_stop_bits(&mut self, _stop_bits: StopBits) -> Result<()> {
            Ok(())
        }

        fn set_timeout(&mut self, _timeout: Duration) -> Result<()> {
            Ok(())
        }

        fn write_request_to_send(&mut self, _level: bool) -> Result<()> {
            Ok(())
        }

        fn write_data_terminal_ready(&mut self, _level: bool) -> Result<()> {
            Ok(())
        }

        fn read_clear_to_send(&mut self) -> Result<bool> {
            Ok(true)
        }

        fn read_data_set_ready(&mut self) -> Result<bool> {
            Ok(true)
        }

        fn read_ring_indicator(&mut self) -> Result<bool> {
            Ok(true)
        }

        fn read_carrier_detect(&mut self) -> Result<bool> {
            Ok(true)
        }

        fn bytes_to_read(&self) -> Result<u32> {
            Ok(0)
        }

        fn bytes_to_write(&self) -> Result<u32> {
            Ok(0)
        }

        fn clear(&self, _buffer_to_clear: ClearBuffer) -> Result<()> {
            Ok(())
        }

        fn try_clone(&self) -> Result<Box<dyn SerialPort>> {
            Ok(Box::new(DummyPort::new(self.buffer.clone())))
        }

        fn set_break(&self) -> Result<()> {
            Ok(())
        }

        fn clear_break(&self) -> Result<()> {
            Ok(())
        }
    }

    #[test]
    fn perform_real_port_write_uses_port() {
        let buffer = Arc::new(Mutex::new(Vec::new()));
        let dummy = DummyPort::new(buffer.clone());
        let state = AppState {
            ports: Mutex::new(HashMap::new()),
            session: Mutex::new(SessionState::default()),
        };
        state.ports.lock().unwrap().insert(
            "TEST".to_string(),
            PortHandle(Mutex::new(Some(Box::new(dummy)))),
        );

        let res = perform_real_port_write(&state.ports, "HELLO");
        assert_eq!(res, Ok(true));
        let written = buffer.lock().unwrap().clone();
        assert_eq!(written, b"HELLO");
    }

    #[test]
    fn perform_real_port_write_recovers_poisoned_lock() {
        // A poisoned ports mutex must not brick the write path.
        let buffer = Arc::new(Mutex::new(Vec::new()));
        let dummy = DummyPort::new(buffer.clone());
        let ports: Mutex<HashMap<String, PortHandle>> = Mutex::new(HashMap::new());
        ports.lock().unwrap().insert(
            "TEST".to_string(),
            PortHandle(Mutex::new(Some(Box::new(dummy)))),
        );

        // Poison the mutex by panicking while holding the lock.
        let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let _guard = ports.lock().unwrap();
            panic!("intentional poison");
        }));
        assert!(ports.is_poisoned());

        let res = perform_real_port_write(&ports, "HELLO");
        assert_eq!(res, Ok(true));
        assert_eq!(buffer.lock().unwrap_or_else(|e| e.into_inner()).clone(), b"HELLO");
    }

    #[test]
    fn force_stop_writes_all_stop_commands() {
        let buffer = Arc::new(Mutex::new(Vec::new()));
        let dummy = DummyPort::new(buffer.clone());
        let ports: Mutex<HashMap<String, PortHandle>> = Mutex::new(HashMap::new());
        ports.lock().unwrap().insert(
            "TEST".to_string(),
            PortHandle(Mutex::new(Some(Box::new(dummy)))),
        );

        force_stop(&ports);

        let written = String::from_utf8(buffer.lock().unwrap().clone()).unwrap();
        let expected: String = crate::commands::program::STOP_COMMANDS.concat();
        assert_eq!(written, expected);
        // Sanity: sync is disabled before channels are turned off.
        let usd0 = written.find("USD0").unwrap();
        let wfn0 = written.find("WFN0").unwrap();
        assert!(usd0 < wfn0, "sync must be disabled before channels turn off");
    }

    #[test]
    fn force_stop_is_best_effort_when_no_port() {
        // No port present: force_stop must not panic, just swallow errors.
        let ports: Mutex<HashMap<String, PortHandle>> = Mutex::new(HashMap::new());
        force_stop(&ports);
    }
}

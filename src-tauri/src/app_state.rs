use lazy_static::lazy_static;
use serialport::SerialPort;
use std::collections::HashMap;
use std::io::Write;
use std::sync::Mutex;

lazy_static! {
    pub static ref PORT_NAME: Mutex<String> = Mutex::new("TEST".to_string());
}

pub struct PortHandle(pub Mutex<Option<Box<dyn SerialPort + Send>>>);

pub struct AppState {
    pub ports: Mutex<HashMap<String, PortHandle>>,
}

pub fn log_test_port_data(data: &str) -> Result<bool, String> {
    println!("Test Port received data: {}", data);
    Ok(true)
}

pub fn perform_real_port_write(
    ports: &Mutex<HashMap<String, PortHandle>>,
    data: &str,
) -> Result<bool, String> {
    // Poison-tolerant locks: a panic elsewhere must not turn every later write into a
    // panic on the IPC thread (the device would be left in whatever state it was in).
    let port_name = PORT_NAME.lock().unwrap_or_else(|e| e.into_inner()).clone();
    println!(
        "perform_real_port_write called with port_name: {} and data: {}",
        port_name, data
    );
    let ports = ports.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(handle) = ports.get(&port_name) {
        let mut guard = handle.0.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(port) = guard.as_mut() {
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

/// Send one `R*` read command and return the device's reply, trimmed.
///
/// The device acks every write with 0x0a and nothing consumes those acks during a
/// paced run, so the input buffer holds a backlog. Clear it first, otherwise a stale
/// ack is read as this query's reply and every later read is shifted by one register.
pub fn perform_real_port_query(
    ports: &Mutex<HashMap<String, PortHandle>>,
    query: &str,
) -> Result<String, String> {
    use std::io::Read;
    let port_name = PORT_NAME.lock().unwrap_or_else(|e| e.into_inner()).clone();
    let ports = ports.lock().unwrap_or_else(|e| e.into_inner());
    let handle = ports.get(&port_name).ok_or_else(|| "Port not found".to_string())?;
    let mut guard = handle.0.lock().unwrap_or_else(|e| e.into_inner());
    let port = guard.as_mut().ok_or_else(|| "Port not open".to_string())?;

    let _ = port.clear(serialport::ClearBuffer::Input);
    port.write_all(format!("{}\n", query).as_bytes())
        .map_err(|e| e.to_string())?;
    port.flush().map_err(|e| e.to_string())?;

    // Replies land 300-900 ms after the query on the FY6300, so poll past the port's
    // own 500 ms read timeout rather than giving up on the first empty read.
    let deadline = std::time::Instant::now() + std::time::Duration::from_millis(1500);
    let mut out = String::new();
    let mut buf = [0u8; 64];
    while std::time::Instant::now() < deadline {
        match port.read(&mut buf) {
            Ok(0) => {}
            Ok(n) => {
                out.push_str(&String::from_utf8_lossy(&buf[..n]));
                if out.contains('\n') && !out.trim().is_empty() {
                    break;
                }
            }
            Err(ref e) if e.kind() == std::io::ErrorKind::TimedOut => {}
            Err(e) => return Err(e.to_string()),
        }
    }
    Ok(out.trim().to_string())
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
}

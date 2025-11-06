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
    let port_name = PORT_NAME.lock().unwrap().clone();
    println!(
        "perform_real_port_write called with port_name: {} and data: {}",
        port_name, data
    );
    if let Some(handle) = ports.lock().unwrap().get(&port_name) {
        if let Some(port) = handle.0.lock().unwrap().as_mut() {
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

#[cfg(test)]
mod tests {
    use super::*;

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
}

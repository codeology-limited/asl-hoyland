use crate::app_state::{AppState, PortHandle, PORT_NAME};
use serde::Deserialize;
use serialport;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{State, Window};

#[derive(Deserialize)]
pub struct ReconnectArgs {
    pub target_device: String,
    pub baud_rate: u32,
}

#[tauri::command]
pub fn reconnect_device(
    state: State<AppState>,
    args: ReconnectArgs,
    window: Window,
) -> Result<String, String> {
    println!(
        "reconnect_device called with target_device: {}",
        args.target_device
    );

    {
        // Poison-tolerant: a prior panic must not block disconnecting/reconnecting.
        let mut ports = state.ports.lock().unwrap_or_else(|e| e.into_inner());
        for port_name in ports.keys().cloned().collect::<Vec<_>>() {
            println!("Disconnecting port: {}", port_name);
            ports.remove(&port_name);
        }
    }

    let available_ports =
        serialport::available_ports().map_err(|_| "Failed to list available ports.".to_string())?;

    for p in available_ports.iter() {
        println!("PORT FOUND ---> {}", p.port_name);
    }

    let mut reconnected_port = String::new();
    for port in available_ports {
        println!("Checking port: {}", port.port_name);
        // Emit scanning event so UI can show which port is being checked
        let _ = window.emit("scanning_port", port.port_name.clone());
        match serialport::new(&port.port_name, args.baud_rate)
            .timeout(Duration::from_millis(500))
            .data_bits(serialport::DataBits::Eight)
            .parity(serialport::Parity::None)
            .stop_bits(serialport::StopBits::One)
            .flow_control(serialport::FlowControl::None)
            .open()
        {
            Ok(mut serial_port) => {
                println!("Opened port: {}", port.port_name);
                if let Err(e) = serial_port.write_all(b"UMO\r\n") {
                    println!("Failed to write to port {}: {}", port.port_name, e);
                    continue;
                }
                // Robust identify read: the FY6600 can dribble its banner out
                // over several reads, so accumulate until we see a newline /
                // enough bytes, or a short overall deadline elapses. A read
                // timeout is normal (no data yet) and is retried; a hard error
                // aborts this port and continues scanning the next one.
                let deadline = std::time::Instant::now() + std::time::Duration::from_millis(800);
                let mut response = String::new();
                let mut chunk = [0u8; 64];
                let mut hard_error = false;
                while std::time::Instant::now() < deadline {
                    match serial_port.read(&mut chunk) {
                        Ok(0) => {}
                        Ok(n) => {
                            response.push_str(&String::from_utf8_lossy(&chunk[..n]));
                            if response.contains('\n') || response.len() >= 100 {
                                break;
                            }
                        }
                        Err(ref e) if e.kind() == std::io::ErrorKind::TimedOut => {
                            // No data this round; keep polling until the deadline.
                            std::thread::sleep(std::time::Duration::from_millis(50));
                        }
                        Err(e) => {
                            println!(
                                "Failed to read from port: {}. Error: {}",
                                port.port_name, e
                            );
                            hard_error = true;
                            break;
                        }
                    }
                }
                if hard_error {
                    continue;
                }
                let banner = response.trim();
                println!("Response from device: {}", banner);
                if banner.starts_with("FY23") || banner.starts_with("FY63") {
                    // Poison-tolerant: never fail the reconnect on a poisoned lock.
                    let mut ports = state.ports.lock().unwrap_or_else(|e| e.into_inner());
                    ports.insert(
                        port.port_name.clone(),
                        PortHandle(Mutex::new(Some(serial_port))),
                    );
                    println!(
                        "Successfully connected to device on port: {}",
                        port.port_name
                    );
                    PORT_NAME
                        .lock()
                        .unwrap_or_else(|e| e.into_inner())
                        .clone_from(&port.port_name);
                    reconnected_port.clone_from(&port.port_name);
                    let _ = window.emit("reconnected", reconnected_port.clone());
                    return Ok(reconnected_port);
                }
            }
            Err(e) => {
                println!("Failed to open port: {}. Error: {}", port.port_name, e);
            }
        }
    }

    if reconnected_port.is_empty() {
        // Poison-tolerant: still fall back to the Test Port if a lock was poisoned.
        let mut ports = state.ports.lock().unwrap_or_else(|e| e.into_inner());
        println!("Target device not found. Defaulting to Test Port.");
        ports.insert("TEST".to_string(), PortHandle(Mutex::new(None)));
        *PORT_NAME.lock().unwrap_or_else(|e| e.into_inner()) = "TEST".to_string();
        reconnected_port = "TEST".to_string();
        let _ = window.emit("reconnected", reconnected_port.clone());
    }

    Ok(reconnected_port)
}

#[tauri::command]
pub fn use_test_port(state: State<AppState>, window: Window) -> Result<String, String> {
    // Poison-tolerant locks, uniform with the rest of the connection path.
    let mut ports = state.ports.lock().unwrap_or_else(|e| e.into_inner());
    ports.insert("TEST".to_string(), PortHandle(Mutex::new(None)));
    *PORT_NAME.lock().unwrap_or_else(|e| e.into_inner()) = "TEST".to_string();
    let label = "TEST".to_string();
    let _ = window.emit("reconnected", label.clone());
    Ok(label)
}

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
        let mut ports = state
            .ports
            .lock()
            .map_err(|_| "Failed to acquire lock on ports.".to_string())?;
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
                let mut buffer: Vec<u8> = vec![0; 100];
                if let Err(e) = serial_port.write_all(b"UMO\r\n") {
                    println!("Failed to write to port {}: {}", port.port_name, e);
                    continue;
                }
                std::thread::sleep(std::time::Duration::from_millis(500));
                match serial_port.read(buffer.as_mut_slice()) {
                    Ok(bytes_read) => {
                        let response = String::from_utf8_lossy(&buffer[..bytes_read]);
                        println!("Response from device: {}", response);
                        if response.starts_with("FY23") || response.starts_with("FY63") {
                            let mut ports = state
                                .ports
                                .lock()
                                .map_err(|_| "Failed to acquire lock on ports.".to_string())?;
                            ports.insert(
                                port.port_name.clone(),
                                PortHandle(Mutex::new(Some(serial_port))),
                            );
                            println!(
                                "Successfully connected to device on port: {}",
                                port.port_name
                            );
                            PORT_NAME.lock().unwrap().clone_from(&port.port_name);
                            reconnected_port.clone_from(&port.port_name);
                            window
                                .emit("reconnected", reconnected_port.clone())
                                .unwrap();
                            return Ok(reconnected_port);
                        }
                    }
                    Err(e) => {
                        println!("Failed to read from port: {}. Error: {}", port.port_name, e);
                    }
                }
            }
            Err(e) => {
                println!("Failed to open port: {}. Error: {}", port.port_name, e);
            }
        }
    }

    if reconnected_port.is_empty() {
        let mut ports = state
            .ports
            .lock()
            .map_err(|_| "Failed to acquire lock on ports.".to_string())?;
        println!("Target device not found. Defaulting to Test Port.");
        ports.insert("TEST".to_string(), PortHandle(Mutex::new(None)));
        *PORT_NAME.lock().unwrap() = "TEST".to_string();
        reconnected_port = "TEST".to_string();
        window
            .emit("reconnected", reconnected_port.clone())
            .unwrap();
    }

    Ok(reconnected_port)
}

#[tauri::command]
pub fn use_test_port(state: State<AppState>, window: Window) -> Result<String, String> {
    let mut ports = state
        .ports
        .lock()
        .map_err(|_| "Failed to acquire lock on ports.".to_string())?;
    ports.insert("TEST".to_string(), PortHandle(Mutex::new(None)));
    *PORT_NAME.lock().unwrap() = "TEST".to_string();
    let label = "TEST".to_string();
    let _ = window.emit("reconnected", label.clone());
    Ok(label)
}

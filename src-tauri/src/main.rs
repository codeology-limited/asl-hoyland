#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serialport::{self, SerialPort};
use std::time::Duration;
use tauri::Manager;
use std::io::Write;
use std::sync::Mutex;
use serde::{Serialize, Deserialize};
use tauri::State;

struct PortHandle(Mutex<Option<Box<dyn SerialPort + Send>>>);

struct AppState {
    port: Mutex<PortHandle>,
    port_name: Mutex<String>,
}

#[derive(Serialize, Deserialize)]
struct SetParameterArgs {
    channel: u8,
    value: f64,
}

#[derive(Serialize, Deserialize)]
struct EnableOutputArgs {
    channel: u8,
    enable: bool,
}

fn find_and_connect_port() -> Result<(Box<dyn SerialPort + Send>, String), String> {
    let ports = serialport::available_ports().map_err(|e| format!("No ports found: {}", e))?;

    for port_info in ports {
        if let Ok(mut port) = serialport::new(&port_info.port_name, 9600)
            .timeout(Duration::from_millis(10))
            .open()
        {
            let mut buffer = [0; 32];
            if let Ok(()) = port.write_all(b"UMO\n") {
                std::thread::sleep(Duration::from_millis(100));
                if let Ok(bytes_read) = port.read(&mut buffer) {
                    let response = String::from_utf8_lossy(&buffer[..bytes_read]);
                    if response.starts_with("FY23") || response.starts_with("FY63") {
                        println!("Found device on port: {}", port_info.port_name);
                        drop(port); // Close the port at 9600 baud
                        // Reconnect at 115200 baud
                        let port = serialport::new(&port_info.port_name, 115200)
                            .timeout(Duration::from_millis(10))
                            .open()
                            .map_err(|e| format!("Failed to open port at 115200: {}", e))?;
                        return Ok((port, port_info.port_name));
                    }
                }
            }
        }
    }

    Err("No compatible device found".to_string())
}

#[tauri::command]
fn get_current_port(state: State<AppState>) -> String {
    state.port_name.lock().unwrap().clone()
}

fn log_test_port_data(data: &str) -> Result<bool, String> {
    println!("Test Port received data: {}", data);
    Ok(true)
}

fn write_to_port(state: &State<AppState>, data: &str) -> Result<bool, String> {
    let port_name = state.port_name.lock().unwrap().clone();
    println!("write_to_port called with port_name: {}, data: {}", port_name, data);

    if port_name == "TEST" {
        log_test_port_data(data)
    } else {
        let port_handle = state.port.lock().map_err(|_| "Failed to acquire lock on port.".to_string())?;
        let mut port = port_handle.0.lock().map_err(|_| "Failed to acquire lock on port.".to_string())?;
        let port = port.as_mut().ok_or_else(|| "Port not open".to_string())?;

        port.write_all(data.as_bytes()).map_err(|e| {
            println!("Failed to write to port: {}", e);
            e.to_string()
        })?;
        println!("Successfully wrote to port: {}", port_name);
        Ok(true)
    }
}

#[tauri::command]
fn set_frequency(state: State<AppState>, args: SetParameterArgs) -> Result<bool, String> {
    println!("set_frequency called with channel: {}, frequency: {}", args.channel, args.value);
    let cmd = format!("WMF{}{:014}", args.channel, (args.value * 1_000_000.0) as u64);
    write_to_port(&state, &cmd)
}

#[tauri::command]
fn set_amplitude(state: State<AppState>, args: SetParameterArgs) -> Result<bool, String> {
    println!("set_amplitude called with channel: {}, amplitude: {}", args.channel, args.value);
    let cmd = format!("WMA{}{:05.2}", args.channel, args.value);
    write_to_port(&state, &cmd)
}

#[tauri::command]
fn enable_output(state: State<AppState>, args: EnableOutputArgs) -> Result<bool, String> {
    println!("enable_output called with channel: {}, enable: {}", args.channel, args.enable);
    let cmd = if args.enable {
        format!("WMN{}", args.channel)
    } else {
        format!("WMX{}", args.channel)
    };
    write_to_port(&state, &cmd)
}

#[tauri::command]
fn send_initial_commands(state: State<AppState>) -> Result<bool, String> {
    println!("send_initial_commands called");
    let commands = [
        "UBZ1", "UMS0", "UUL0", "WMW00", "WMF11000000000",
        "WMA101.00", "WMF20000000000", "WMA201.00", "WMN1", "WMN2"
    ];

    for cmd in &commands {
        write_to_port(&state, cmd)?;
        std::thread::sleep(Duration::from_millis(100));
    }

    Ok(true)
}

#[tauri::command]
fn stop_and_reset(state: State<AppState>) -> Result<bool, String> {
    println!("****** stop_and_reset called");
    let commands = [
        "WMX1", "WMX2", "UBZ0", "UMS0", "UUL0"
    ];

    for cmd in &commands {
        write_to_port(&state, cmd)?;
    }

    Ok(true)
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let port_result = find_and_connect_port();
            let (port, port_name) = match port_result {
                Ok((port, name)) => (Some(port), name),
                Err(e) => {
                    println!("Error finding port: {}. Using TEST port.", e);
                    (None, "TEST".to_string())
                }
            };

            let state = AppState {
                port: Mutex::new(PortHandle(Mutex::new(port))),
                port_name: Mutex::new(port_name),
            };
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_current_port,
            set_frequency,
            set_amplitude,
            send_initial_commands,
            enable_output,
            stop_and_reset,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

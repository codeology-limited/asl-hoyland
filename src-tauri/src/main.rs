#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serialport::{self, SerialPort};
use std::sync::Mutex;
use std::time::Duration;
use tauri::Manager;
use std::collections::HashMap;
use std::io::Write;
use serde::{Serialize, Deserialize};
use tauri::State;
use std::io::Read;

#[macro_use]
extern crate lazy_static;

// Global mutable state for port name
lazy_static! {
    static ref PORT_NAME: Mutex<String> = Mutex::new("TEST".to_string());
}

struct PortHandle(Mutex<Option<Box<dyn SerialPort + Send>>>);

struct AppState {
    ports: Mutex<HashMap<String, PortHandle>>,
}

#[derive(Serialize, Deserialize)]
struct WriteToPortArgs {
    data: String,
}

#[derive(Serialize, Deserialize)]
struct SetFrequencyArgs {
    channel: u8,
    frequency: f64,
}

#[derive(Serialize, Deserialize)]
struct SetAmplitudeArgs {
    channel: u8,
    amplitude: f64,
}

#[derive(Serialize, Deserialize)]
struct EnableOutputArgs {
    channel: u8,
    enable: bool,
}

#[derive(Serialize, Deserialize)]
struct OpenPortArgs {
    baud_rate: u32,
}

#[derive(Serialize, Deserialize)]
struct ClosePortArgs {}

#[derive(Serialize, Deserialize)]
struct ReconnectArgs {
    target_device: String,
    baud_rate: u32,
}

#[tauri::command]
fn list_ports() -> Vec<String> {
    println!("list_ports called");
    let mut ports = serialport::available_ports()
        .map(|ports| ports.into_iter().map(|p| p.port_name).collect::<Vec<String>>())
        .unwrap_or_else(|_| Vec::new());
    ports.push("TEST".to_string());
    println!("Available ports: {:?}", ports);
    ports
}

#[tauri::command]
fn open_port(state: State<AppState>, args: OpenPortArgs) -> Result<bool, String> {
    let port_name = PORT_NAME.lock().unwrap().clone();
    println!("open_port called with port_name: {}, baud_rate: {}", port_name, args.baud_rate);

    let mut ports = state.ports.lock().map_err(|_| "Failed to acquire lock on ports.".to_string())?;

    if ports.contains_key(&port_name) {
        return Err(format!("Port already open: {}", port_name));
    }

    if port_name == "TEST" {
        println!("Simulating opening Test Port");
        ports.insert(port_name.clone(), PortHandle(Mutex::new(None)));
        println!("Test Port opened");
        return Ok(true);
    }

    match serialport::new(&port_name, args.baud_rate)
        .timeout(Duration::from_millis(10))
        .data_bits(serialport::DataBits::Eight)
        .parity(serialport::Parity::None)
        .stop_bits(serialport::StopBits::One)
        .flow_control(serialport::FlowControl::None) // No flow control
        .open() {
        Ok(port) => {
            ports.insert(port_name.clone(), PortHandle(Mutex::new(Some(port))));
            println!("Successfully opened port: {}", port_name);
            Ok(true)
        },
        Err(e) => {
            let msg = format!("Failed to open port: {}. Error: {}", port_name, e);
            println!("{}", msg);
            Err(msg)
        },
    }
}

#[tauri::command]
fn close_port(state: State<AppState>, _args: ClosePortArgs) -> Result<bool, String> {
    let port_name = PORT_NAME.lock().unwrap().clone();
    println!("close_port called with port_name: {}", port_name);
    let mut ports = state.ports.lock().map_err(|_| "Failed to acquire lock on ports.".to_string())?;
    if ports.remove(&port_name).is_some() {
        println!("Successfully closed port: {}", port_name);
        Ok(true)
    } else {
        println!("Port not found: {}", port_name);
        Err("Port not found".to_string())
    }
}

fn log_test_port_data(data: &str) -> Result<bool, String> {
    println!("Test Port received data: {}", data);
    Ok(true)
}

fn perform_real_port_write(ports: &Mutex<HashMap<String, PortHandle>>, data: &str) -> Result<bool, String> {
    let port_name = PORT_NAME.lock().unwrap().clone();
    println!("perform_real_port_write called with port_name: {} and data: {}", port_name, data);
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

#[tauri::command]
fn write_to_port(state: State<AppState>, args: WriteToPortArgs) -> Result<bool, String> {
    println!("write_to_port called with data: {}", args.data);
    let data_with_newline = format!("{}{}", args.data, "\n"); // Appending newline character
    perform_real_port_write(&state.ports, &data_with_newline)
}

#[tauri::command]
fn set_frequency(state: State<AppState>, channel: u8, frequency: f64) -> Result<bool, String> {
    println!("set_frequency called with channel: {}, frequency: {}", channel, frequency);
    let cmd = format!("WMF{}{:014}", channel, (frequency * 1_000_000.0) as u64);
    write_to_port(state, WriteToPortArgs { data: cmd })
}

#[tauri::command]
fn set_amplitude(state: State<AppState>, channel: u8, amplitude: f64) -> Result<bool, String> {
    println!("set_amplitude called with channel: {}, amplitude: {}", channel, amplitude);
    let cmd = format!("WMA{}{:05.2}", channel, amplitude);
    write_to_port(state, WriteToPortArgs { data: cmd })
}

#[tauri::command]
fn enable_output(state: State<AppState>, channel: u8, enable: bool) -> Result<bool, String> {
    println!("enable_output called with channel: {}, enable: {}", channel, enable);
    let cmd = if enable {
        format!("WMN{}", channel)
    } else {
        format!("WMX{}", channel)
    };
    write_to_port(state, WriteToPortArgs { data: cmd })
}

#[tauri::command]
fn send_initial_commands(state: State<AppState>) -> Result<bool, String> {
    let port_name = PORT_NAME.lock().unwrap().clone();
    println!("send_initial_commands called with port_name: {}", port_name);
    let commands = [
        "UBZ1\n", "UMS0\n", "UUL0\n", "WMW00\n", "WMF11000000000\n",
        "WMA101.00\n", "WMF20000000000\n", "WMA201.00\n", "WMN1\n", "WMN2\n",
        "WMW01\n", "WMF00000000000000\n", "WMA02.00\n", "WMO00.00\n", "WMD50.0\n",
        "WMP000\n", "WMT0\n", "WMN1\n", "WMF0001000.000000\n", "RMW\n", "RMF\n",
        "RMA\n", "RMO\n", "RMD\n", "RMP\n", "RMT\n", "RMN\n"
    ];

    for cmd in &commands {
        println!("Sending command: {}", cmd);
        if port_name == "TEST" {
            log_test_port_data(cmd)?;
        } else {
            match perform_real_port_write(&state.ports, cmd) {
                Ok(_) => println!("Command '{}' sent successfully", cmd),
                Err(e) => println!("Failed to send command '{}': {}", cmd, e),
            };
        }
        std::thread::sleep(std::time::Duration::from_millis(1000));
    }

    Ok(true)
}

#[tauri::command]
fn stop_and_reset(state: State<AppState>) -> Result<bool, String> {
    let port_name = PORT_NAME.lock().unwrap().clone();
    println!("stop_and_reset called with port_name: {}", port_name);
    let commands = [
        "WMX1\n", "WMX2\n", "UBZ0\n", "UMS0\n", "UUL0\n"
    ];

    for cmd in &commands {
        println!("Sending command: {}", cmd);
        if port_name == "TEST" {
            log_test_port_data(cmd)?;
        } else {
            match perform_real_port_write(&state.ports, cmd) {
                Ok(_) => println!("Command '{}' sent successfully", cmd),
                Err(e) => println!("Failed to send command '{}': {}", cmd, e),
            };
        }
        std::thread::sleep(std::time::Duration::from_millis(1000));
    }

    Ok(true)
}

#[tauri::command]
fn reconnect_device(state: State<AppState>, args: ReconnectArgs) -> Result<bool, String> {
    println!("reconnect_device called with target_device: {}", args.target_device);

    // Disconnect all ports
    {
        let mut ports = state.ports.lock().map_err(|_| "Failed to acquire lock on ports.".to_string())?;
        for port_name in ports.keys().cloned().collect::<Vec<_>>() {
            println!("Disconnecting port: {}", port_name);
            ports.remove(&port_name);
        }
    }

    // Scan for available ports
    let available_ports = serialport::available_ports()
        .map_err(|_| "Failed to list available ports.".to_string())?;

    for p in available_ports.iter() {
        println!("PORT FOUND ---> {}", p.port_name);
    }

    // Reconnect to the target device if found
    let mut reconnected = false;
    for port in available_ports {
        println!("Checking port: {}", port.port_name);
        match serialport::new(&port.port_name, args.baud_rate)
            .timeout(Duration::from_millis(30))
            .data_bits(serialport::DataBits::Eight)
            .parity(serialport::Parity::None)
            .stop_bits(serialport::StopBits::One)
            .flow_control(serialport::FlowControl::None)
            .open() {
            Ok(mut serial_port) => {
                println!("Opened port: {}", port.port_name);
                let mut buffer: Vec<u8> = vec![0; 100];
                serial_port.write_all(b"UMO\r\n").expect("Write failed");
                std::thread::sleep(std::time::Duration::from_millis(30));
                match serial_port.read(buffer.as_mut_slice()) {
                    Ok(bytes_read) => {
                        let response = String::from_utf8_lossy(&buffer[..bytes_read]);
                        println!("Response from device: {}", response);
                        if response.starts_with("FY23") || response.starts_with("FY63") {
                            let mut ports = state.ports.lock().map_err(|_| "Failed to acquire lock on ports.".to_string())?;
                            ports.insert(port.port_name.clone(), PortHandle(Mutex::new(Some(serial_port))));
                            println!("Successfully connected to device on port: {}", port.port_name);
                            *PORT_NAME.lock().unwrap() = port.port_name.clone();
                            reconnected = true;
                            break;
                        }
                    },
                    Err(e) => {
                        println!("Failed to read from port: {}. Error: {}", port.port_name, e);
                    },
                }
            },
            Err(e) => {
                println!("Failed to open port: {}. Error: {}", port.port_name, e);
            },
        }
    }

    if !reconnected {
        // Default to "TEST"
        let mut ports = state.ports.lock().map_err(|_| "Failed to acquire lock on ports.".to_string())?;
        println!("Target device not found. Defaulting to Test Port.");
        ports.insert("TEST".to_string(), PortHandle(Mutex::new(None)));
        *PORT_NAME.lock().unwrap() = "TEST".to_string();
    }

    Ok(true)
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            app.manage(AppState {
                ports: Mutex::new(HashMap::new()),
            });

            let state = app.state::<AppState>().clone();
            let target_device = "your_target_device_name_here"; // Replace with the actual target device name
            let baud_rate = 115200; // Use 115200 baud rate

            // Call reconnect_device on startup
            reconnect_device(state, ReconnectArgs {
                target_device: target_device.to_string(),
                baud_rate,
            }).expect("Failed to execute reconnect_device on startup");

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_ports,
            open_port,
            close_port,
            set_frequency,
            set_amplitude,
            send_initial_commands,
            enable_output,
            stop_and_reset,
            write_to_port,
            reconnect_device
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

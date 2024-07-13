#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serialport::{self, SerialPort};
use std::time::Duration;
use tauri::Manager;
use std::io::Write;
use std::sync::Mutex;
use std::collections::HashMap;
use serde::{Serialize, Deserialize};
use tauri::State;

struct PortHandle(Mutex<Option<Box<dyn SerialPort + Send>>>);

struct AppState {
    ports: Mutex<HashMap<String, PortHandle>>,
}

#[derive(Serialize, Deserialize)]
struct WriteToPortArgs {
    port_name: String,
    data: String,
}

#[derive(Serialize, Deserialize)]
struct SetFrequencyArgs {
    port_name: String,
    channel: u8,
    frequency: f64,
}

#[derive(Serialize, Deserialize)]
struct SetAmplitudeArgs {
    port_name: String,
    channel: u8,
    amplitude: f64,
}

#[derive(Serialize, Deserialize)]
struct EnableOutputArgs {
    port_name: String,
    channel: u8,
    enable: bool,
}

#[derive(Serialize, Deserialize)]
struct OpenPortArgs {
    port_name: String,
    baud_rate: u32,
}

#[derive(Serialize, Deserialize)]
struct ClosePortArgs {
    port_name: String,
}

#[derive(Serialize, Deserialize)]
struct SendInitialCommandsArgs {
    port_name: String,
}
#[derive(Serialize, Deserialize)]
struct StopCommandsArgs {
    port_name: String,
}

#[tauri::command]
fn stop_and_reset(state: State<AppState>, args: StopCommandsArgs) -> Result<bool, String> {
    println!("stop_and_reset called with port_name: {}", args.port_name);
    let commands = [
        "WMX1",  // Disable output for channel 1
        "WMX2",  // Disable output for channel 2
        "UBZ0",  // Reset output through BNC (example reset command)
        "UMS0",  // Modulation off
        "UUL0",  // Sweep off
    ];

    for cmd in &commands {
        if args.port_name == "Test Port" {
            log_test_port_data(cmd)?;
        } else {
            perform_real_port_write(&state.ports, &args.port_name, cmd).map_err(|e| format!("Failed to write command: {}", e))?;
        }
        std::thread::sleep(Duration::from_millis(100));
    }

    Ok(true)
}
#[tauri::command]
fn list_ports() -> Vec<String> {
    println!("list_ports called");
    let mut ports = serialport::available_ports()
        .map(|ports| ports.into_iter().map(|p| p.port_name).collect::<Vec<String>>())
        .unwrap_or_else(|_| Vec::new());
    ports.push("Test Port".to_string());
    println!("Available ports: {:?}", ports);
    ports
}

#[tauri::command]
fn open_port(state: State<AppState>, args: OpenPortArgs) -> Result<bool, String> {
    println!("open_port called with port_name: {}, baud_rate: {}", args.port_name, args.baud_rate);

    let mut ports = state.ports.lock().map_err(|_| "Failed to acquire lock on ports.".to_string())?;

    if ports.contains_key(&args.port_name) {
        return Err(format!("Port already open: {}", args.port_name));
    }

    if args.port_name == "Test Port" {
        println!("Simulating opening Test Port");
        ports.insert(args.port_name.clone(), PortHandle(Mutex::new(None)));
        println!("Test Port opened");
        return Ok(true);
    }

    match serialport::new(&args.port_name, args.baud_rate)
        .timeout(Duration::from_millis(10))
        .data_bits(serialport::DataBits::Eight)
        .parity(serialport::Parity::None)
        .stop_bits(serialport::StopBits::One)
        .open() {
        Ok(port) => {
            ports.insert(args.port_name.clone(), PortHandle(Mutex::new(Some(port))));
            println!("Successfully opened port: {}", args.port_name);
            Ok(true)
        },
        Err(e) => {
            let msg = format!("Failed to open port: {}. Error: {}", args.port_name, e);
            println!("{}", msg);
            Err(msg)
        },
    }
}

#[tauri::command]
fn close_port(state: State<AppState>, args: ClosePortArgs) -> Result<bool, String> {
    println!("close_port called with port_name: {}", args.port_name);
    let mut ports = state.ports.lock().map_err(|_| "Failed to acquire lock on ports.".to_string())?;
    if ports.remove(&args.port_name).is_some() {
        println!("Successfully closed port: {}", args.port_name);
        Ok(true)
    } else {
        println!("Port not found: {}", args.port_name);
        Err("Port not found".to_string())
    }
}

fn log_test_port_data(data: &str) -> Result<bool, String> {
    println!("Test Port received data: {}", data);
    Ok(true)
}

fn perform_real_port_write(ports: &Mutex<HashMap<String, PortHandle>>, port_name: &str, data: &str) -> Result<bool, String> {
    println!("Writing Port data: {}", data);
    let ports = ports.lock().map_err(|_| "Failed to acquire lock on ports.".to_string())?;
    let port_handle = ports.get(port_name).ok_or_else(|| "Port not found".to_string())?;
    let mut port = port_handle.0.lock().map_err(|_| "Failed to acquire lock on port.".to_string())?;
    let port = port.as_mut().ok_or_else(|| "Port not open".to_string())?;

    port.write_all(data.as_bytes()).map_err(|e| {
        println!("Failed to write to port: {}", e);
        e.to_string()
    })?;
    println!("Successfully wrote to port: {}", port_name);
    Ok(true)
}

#[tauri::command]
fn write_to_port(state: State<AppState>, args: WriteToPortArgs) -> Result<bool, String> {
    println!("write_to_port called with port_name: {}, data: {}", args.port_name, args.data);
    if args.port_name == "Test Port" {
        log_test_port_data(&args.data)
    } else {
        perform_real_port_write(&state.ports, &args.port_name, &args.data)
    }
}

#[tauri::command]
fn set_frequency(state: State<AppState>, args: SetFrequencyArgs) -> Result<bool, String> {
    println!("set_frequency called with port_name: {}, channel: {}, frequency: {}", args.port_name, args.channel, args.frequency);
    let cmd = format!("WMF{}{:014}", args.channel, (args.frequency * 1_000_000.0) as u64);
    write_to_port(state, WriteToPortArgs { port_name: args.port_name, data: cmd })
}

#[tauri::command]
fn set_amplitude(state: State<AppState>, args: SetAmplitudeArgs) -> Result<bool, String> {
    println!("set_amplitude called with port_name: {}, channel: {}, amplitude: {}", args.port_name, args.channel, args.amplitude);
    let cmd = format!("WMA{}{:05.2}", args.channel, args.amplitude);
    write_to_port(state, WriteToPortArgs { port_name: args.port_name, data: cmd })
}

#[tauri::command]
fn enable_output(state: State<AppState>, args: EnableOutputArgs) -> Result<bool, String> {
    println!("enable_output called with port_name: {}, channel: {}, enable: {}", args.port_name, args.channel, args.enable);
    let cmd = if args.enable {
        format!("WFN{}", args.channel)
    } else {
        format!("WFX{}", args.channel)
    };
    write_to_port(state, WriteToPortArgs { port_name: args.port_name, data: cmd })
}

#[tauri::command]
fn send_initial_commands(state: State<AppState>, args: SendInitialCommandsArgs) -> Result<bool, String> {
    println!("send_initial_commands called with port_name: {}", args.port_name);
    let commands = [
        "UBZ1", "UMS0", "UUL0",
        "WMW00",  // Select square wave for channel 1
        "WMF11000000000",  // Set frequency for channel 1
        "WMA101.00",  // Set amplitude for channel 1
        "WMF20000000000",  // Set frequency for channel 2
        "WMA201.00",  // Set amplitude for channel 2
        "WMN1",  // Enable output for channel 1
        "WMN2"  // Enable output for channel 2
    ];

    for cmd in &commands {
        if args.port_name == "Test Port" {
            log_test_port_data(cmd)?;
        } else {
            perform_real_port_write(&state.ports, &args.port_name, cmd).map_err(|e| format!("Failed to write command: {}", e))?;
        }
        std::thread::sleep(Duration::from_millis(100));
    }

    Ok(true)
}
fn main() {
    tauri::Builder::default()
        .setup(|app| {
            app.manage(AppState {
                ports: Mutex::new(HashMap::new()),
            });
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
            write_to_port,
            stop_and_reset
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

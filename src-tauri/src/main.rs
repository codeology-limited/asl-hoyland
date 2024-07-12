// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serialport::{self, SerialPort};
use std::time::Duration;
use tauri::Manager;
use std::io::Write;
use std::io::Read;
use std::sync::Mutex;
use std::collections::HashMap;
use serde::{Serialize, Deserialize};
use tauri::State;

struct PortHandle(Mutex<Option<Box<dyn SerialPort + Send>>>);

struct AppState {
    ports: Mutex<HashMap<String, PortHandle>>,
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
fn xxx() -> Result<(), String> {
    println!("xxx called");
    Ok(())
}


#[derive(Serialize, Deserialize)]
struct OpenPortArgs {
    port_name: String,
    baud_rate: u32,
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

    match serialport::new(&args.port_name, args.baud_rate).timeout(Duration::from_millis(10)).open() {
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
fn close_port(state: State<AppState>, port_name: String) -> Result<(), String> {
    println!("close_port called with port_name: {}", port_name);
    let mut ports = state.ports.lock().map_err(|_| "Failed to acquire lock on ports.".to_string())?;
    if ports.remove(&port_name).is_some() {
        println!("Successfully closed port: {}", port_name);
        Ok(())
    } else {
        println!("Port not found: {}", port_name);
        Err("Port not found".to_string())
    }
}

#[tauri::command]
fn write_to_port(state: State<AppState>, port_name: String, data: String) -> Result<(), String> {
    println!("write_to_port called with port_name: {}, data: {}", port_name, data);
    let ports = state.ports.lock().map_err(|_| "Failed to acquire lock on ports.".to_string())?;
    if port_name == "Test Port" {
        println!("Test Port received data: {}", data);
        return Ok(());
    }
    let port_handle = ports.get(&port_name).ok_or_else(|| "Port not found".to_string())?;
    let mut port = port_handle.0.lock().map_err(|_| "Failed to acquire lock on port.".to_string())?;
    let port = port.as_mut().ok_or_else(|| "Port not open".to_string())?;

    port.write_all(data.as_bytes()).map_err(|e| {
        println!("Failed to write to port: {}", e);
        e.to_string()
    })?;
    println!("Successfully wrote to port: {}", port_name);
    Ok(())
}

#[tauri::command]
fn read_from_port(state: State<AppState>, port_name: String) -> Result<String, String> {
    println!("read_from_port called with port_name: {}", port_name);
    let ports = state.ports.lock().map_err(|_| "Failed to acquire lock on ports.".to_string())?;
    if port_name == "Test Port" {
        println!("Returning Test Port response");
        return Ok("Test Port response".to_string());
    }
    let port_handle = ports.get(&port_name).ok_or_else(|| "Port not found".to_string())?;
    let mut port = port_handle.0.lock().map_err(|_| "Failed to acquire lock on port.".to_string())?;
    let port = port.as_mut().ok_or_else(|| "Port not open".to_string())?;

    let mut serial_buf: Vec<u8> = vec![0; 1000];
    let t = port.read(serial_buf.as_mut_slice()).map_err(|e| {
        println!("Failed to read from port: {}", e);
        e.to_string()
    })?;
    println!("Successfully read from port: {}", port_name);
    Ok(String::from_utf8_lossy(&serial_buf[..t]).to_string())
}

#[tauri::command]
fn send_initial_commands(state: State<AppState>, port_name: String) -> Result<(), String> {
    println!("send_initial_commands called with port_name: {}", port_name);
    if port_name == "Test Port" {
        println!("Test Port: send_initial_commands");
        return Ok(());
    }
    let ports = state.ports.lock().map_err(|_| "Failed to acquire lock on ports.".to_string())?;
    let port_handle = ports.get(&port_name).ok_or_else(|| "Port not found".to_string())?;
    let mut port = port_handle.0.lock().map_err(|_| "Failed to acquire lock on port.".to_string())?;
    let port = port.as_mut().ok_or_else(|| "Port not open".to_string())?;

    let commands = [
        "UBZ1", "UMS0", "UUL0", "WFW00", "WFF3100000.000000",
        "WFO00.00", "WFD50.0", "WFP000", "WFT0", "WFN1"
    ];

    for cmd in &commands {
        port.write_all(cmd.as_bytes()).map_err(|e| format!("Failed to write command: {}", e))?;
        std::thread::sleep(Duration::from_millis(100));
    }

    Ok(())
}

#[tauri::command]
fn send_frequency(state: State<AppState>, port_name: String, frequency: f64, duration: u64) -> Result<(), String> {
    println!("send_frequency called with port_name: {}, frequency: {}, duration: {}", port_name, frequency, duration);
    if port_name == "Test Port" {
        println!("Test Port: send_frequency - frequency: {}, duration: {}", frequency, duration);
        return Ok(());
    }
    let cmd = format!("WMF{:.6}", frequency);
    write_to_port(state, port_name, cmd)?;
    std::thread::sleep(Duration::from_millis(duration));
    Ok(())
}

#[tauri::command]
fn set_frequency(state: State<AppState>, port_name: String, frequency: f64) -> Result<(), String> {
    println!("set_frequency called with port_name: {}, frequency: {}", port_name, frequency);
    let cmd = format!("WFF{:.6}", frequency);
    write_to_port(state, port_name, cmd)
}

#[tauri::command]
fn set_amplitude(state: State<AppState>, port_name: String, amplitude: f64) -> Result<(), String> {
    println!("set_amplitude called with port_name: {}, amplitude: {}", port_name, amplitude);
    let cmd = format!("WFA{:.2}", amplitude);
    write_to_port(state, port_name, cmd)
}

#[tauri::command]
fn set_offset(state: State<AppState>, port_name: String, offset: f64) -> Result<(), String> {
    println!("set_offset called with port_name: {}, offset: {}", port_name, offset);
    let cmd = format!("WFO{:.2}", offset);
    write_to_port(state, port_name, cmd)
}

#[tauri::command]
fn set_phase(state: State<AppState>, port_name: String, phase: f64) -> Result<(), String> {
    println!("set_phase called with port_name: {}, phase: {}", port_name, phase);
    let cmd = format!("WFP{:.1}", phase);
    write_to_port(state, port_name, cmd)
}

#[tauri::command]
fn enable_output(state: State<AppState>, port_name: String, channel: u8, enable: bool) -> Result<(), String> {
    println!("enable_output called with port_name: {}, channel: {}, enable: {}", port_name, channel, enable);
    let cmd = if enable {
        format!("WFN{}", channel)
    } else {
        format!("WFX{}", channel)
    };
    write_to_port(state, port_name, cmd)
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
            xxx,
            list_ports,
            open_port,
            close_port,
            send_initial_commands,
            send_frequency,
            set_frequency,
            set_amplitude,
            set_offset,
            set_phase,
            enable_output,
            write_to_port,
            read_from_port
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
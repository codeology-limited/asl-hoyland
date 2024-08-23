#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{self, Manager, State, Window};
// use tauri::api::process::Command;
// use std::path::PathBuf;
use env_logger::Env;
use serialport::{self, SerialPort};
use std::sync::Mutex;
use std::time::Duration;
use std::collections::HashMap;
use std::io::Write;
use serde::{Serialize, Deserialize};
use std::io::Read;

#[macro_use]
extern crate lazy_static;

lazy_static! {
    static ref PORT_NAME: Mutex<String> = Mutex::new("TEST".to_string());
}

struct PortHandle(Mutex<Option<Box<dyn SerialPort + Send>>>);

struct AppState {
    ports: Mutex<HashMap<String, PortHandle>>,
}

#[derive(serde::Deserialize)]
struct SetFrequencyArgs {
    channel: u8,
    frequency: f64,
}

#[derive(serde::Deserialize)]
struct WriteToPortArgs {
    data: String,
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
struct SetOffsetArgs {
    channel: u8,
    offset: f64,
}

#[derive(Serialize, Deserialize)]
struct SetDutyCycleArgs {
    channel: u8,
    duty_cycle: f64,
}

#[derive(Serialize, Deserialize)]
struct SetPhaseArgs {
    channel: u8,
    phase: u16,
}

#[derive(Serialize, Deserialize)]
struct SetAttenuationArgs {
    channel: u8,
    attenuation: u8,
}

#[derive(Serialize, Deserialize)]
struct OpenPortArgs {
    baud_rate: u32,
}

#[derive(serde::Deserialize)]
struct SetWaveformArgs {
    channel: u8,
    waveform_type: u8,
}

#[derive(Serialize, Deserialize)]
struct ClosePortArgs {}

#[derive(Serialize, Deserialize)]
struct ReconnectArgs {
    target_device: String,
    baud_rate: u32,
}

// fn get_resource_path(resource_name: &str) -> PathBuf {
//     let full_path = std::env::current_dir().unwrap().join(resource_name);
//     println!("Full path: {}", full_path.display());
//     full_path
// }

// fn install_driver(driver_path: &str) {
//     let path = PathBuf::from(driver_path);

//     // Check if the path exists
//     if path.exists() {
//         println!("File exists: {}", path.display());

//         // Convert PathBuf to &str
//         let path_str = path.to_str().expect("Failed to convert path to string");

//         // Run the command
//         match Command::new(path_str)
//             .args(&["/silent"])
//             .spawn() {
//             Ok(_) => println!("Successfully started installer for {}", path.display()),
//             Err(e) => eprintln!("Failed to run driver installer for {}: {}", path.display(), e),
//         }
//     } else {
//         eprintln!("Driver file not found at path: {}", path.display());
//     }
// }


// // Installers should only run on Windows
// #[cfg(target_os = "windows")]
// fn install_webview2() {
//     let webview2_installer = get_resource_path("webview/webview2.exe");
//     let installer_str = webview2_installer.to_string_lossy(); // Convert PathBuf to String
//     Command::new(installer_str.as_ref()) // Pass as str
//         .args(&["/silent"]) // Corrected from `.arg` to `.args
//         .spawn()
//         .expect("Failed to run WebView2 installer");
// }

// // Installers should only run on Windows
// #[cfg(target_os = "windows")]
// fn install_all_resources() {
//     // Detect system architecture
//     let arch = std::env::consts::ARCH;

//     // Install appropriate drivers based on architecture
//     if arch == "x86_64" {
//         println!("64-bit system detected. Installing 64-bit drivers...");
//         install_driver(&get_resource_path("drivers/CH340/CH34164.EXE").to_string_lossy());
//         install_driver(&get_resource_path("drivers/CP210x/CP21064.exe").to_string_lossy());
//     } else if arch == "x86" {
//         println!("32-bit system detected. Installing 32-bit drivers...");
//         install_driver(&get_resource_path("drivers/CH340/CH34032.EXE").to_string_lossy());
//         install_driver(&get_resource_path("drivers/CP210x/CP21086.exe").to_string_lossy());
//     } else {
//         println!("Unknown system architecture: {}. Skipping driver installation.", arch);
//     }

//     // Install WebView2 (This installer typically handles architecture internally)
//     install_webview2();
// }

// // On non-Windows platforms, these functions do nothing
// #[cfg(not(target_os = "windows"))]
// fn install_all_resources() {
//     // Do nothing on non-Windows platforms
// }

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
        .timeout(Duration::from_millis(500))
        .data_bits(serialport::DataBits::Eight)
        .parity(serialport::Parity::None)
        .stop_bits(serialport::StopBits::One)
        .flow_control(serialport::FlowControl::None)
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
            std::thread::sleep(std::time::Duration::from_millis(20));
            return Ok(true);
        }
    }
    Err("Port not found".to_string())
}

#[tauri::command]
fn write_to_port(state: State<AppState>, args: WriteToPortArgs, window: Window) -> Result<bool, String> {
    let port_name = PORT_NAME.lock().unwrap().clone();
    println!("Writing to port: {} with data: {}", port_name, args.data);

    let emit_event = |event: &str, message: String| {
        if let Err(err) = window.emit(event, message) {
            eprintln!("Failed to emit {} event: {}", event, err);
        }
    };

    if port_name == "TEST" {
        log_test_port_data(&args.data)?;
        emit_event("message_success", format!("Message sent to Test Port: {}", args.data));
    } else {
        match perform_real_port_write(&state.ports, &args.data) {
            Ok(_) => {
                println!("Command '{}' sent successfully by write to port", args.data);
                emit_event("message_success", format!("Message sent to {}: {}", port_name, args.data));
            },
            Err(e) => {
                let error_message = format!("Failed to send command '{}': {}", args.data, e);
                println!("{}", error_message);
                emit_event("message_fail", error_message.clone());
                return Err(error_message);
            },
        }
    }
    Ok(true)
}

#[tauri::command]
fn set_frequency(state: State<AppState>, args: SetFrequencyArgs, window: Window) -> Result<bool, String> {
    // Log the incoming request
    println!("Incoming request: set_frequency called with channel: {}, frequency: {}", args.channel, args.frequency);

    // Convert the frequency to MHz and fractional part
    let mhz_part = args.frequency.trunc() as u64;
    let fractional_part = (args.frequency.fract() * 1_000_000.0).round() as u64;

    // Log the calculated parts
    println!("MHz part: {}, Fractional part: {}", mhz_part, fractional_part);

    // Select the appropriate command prefix based on the channel
    let prefix = match args.channel {
        1 => "WMF", // COMMAND_PREFIX_CHANNEL_1
        2 => "WFF", // COMMAND_PREFIX_CHANNEL_2
        _ => return Err("Invalid channel. Must be 1 or 2".to_string()),
    };

    // Format the command to match the desired output
    let cmd = format!("{}{:07}.{:06}\n", prefix, mhz_part, fractional_part);

    // Log the command being sent for verification
    println!("Outgoing command: {}", cmd);

    // Send the command to the port
    match write_to_port(state, WriteToPortArgs { data: cmd.clone() }, window) {
        Ok(_) => println!("Command '{}' frequency sent successfully to the port", cmd.trim()),
        Err(e) => return Err(format!("Failed to send command: {}", e)),
    }

    // Return success
    Ok(true)
}

#[tauri::command]
fn set_amplitude(state: State<AppState>, args: SetAmplitudeArgs, window: Window) -> Result<bool, String> {
    println!("set_amplitude called with channel: {}, amplitude: {}", args.channel, args.amplitude);
    let scaled_amplitude = args.amplitude; // Scale the amplitude
    
    let cmd = format!("WMA{:05.2}", scaled_amplitude);
    write_to_port(state.clone(), WriteToPortArgs { data: cmd }, window.clone())?; // Send first command
    std::thread::sleep(std::time::Duration::from_millis(120));
    let cmd2 = format!("WFA{:05.2}", scaled_amplitude);
    write_to_port(state, WriteToPortArgs { data: cmd2 }, window)?; // Send second command
    std::thread::sleep(std::time::Duration::from_millis(120));
    Ok(true) // Return success
}

#[tauri::command]
fn set_offset(state: State<AppState>, args: SetOffsetArgs, window: Window) -> Result<bool, String> {
    println!("set_offset called with channel: {}, offset: {}", args.channel, args.offset);
    let cmd = format!("WMO{:05.2}", args.offset);
    write_to_port(state, WriteToPortArgs { data: cmd }, window)
}

#[tauri::command]
fn set_duty_cycle(state: State<AppState>, args: SetDutyCycleArgs, window: Window) -> Result<bool, String> {
    println!("set_duty_cycle called with channel: {}, duty_cycle: {}", args.channel, args.duty_cycle);
    let cmd = format!("WMD{:04.1}", args.duty_cycle);
    write_to_port(state, WriteToPortArgs { data: cmd }, window)
}

#[tauri::command]
fn set_phase(state: State<AppState>, args: SetPhaseArgs, window: Window) -> Result<bool, String> {
    println!("set_phase called with channel: {}, phase: {}", args.channel, args.phase);
    let cmd = format!("WMP{:03}", args.phase);
    write_to_port(state, WriteToPortArgs { data: cmd }, window)
}

#[tauri::command]
fn set_attenuation(state: State<AppState>, args: SetAttenuationArgs, window: Window) -> Result<bool, String> {
    println!("set_attenuation called with channel: {}, attenuation: {}", args.channel, args.attenuation);
    let cmd = format!("WMT{:01}", args.attenuation);
    write_to_port(state, WriteToPortArgs { data: cmd }, window)
}

#[tauri::command]
fn synchronise_voltage(state: State<AppState>, window: Window) -> Result<bool, String> {
    println!("synchronise_voltage called");
    let cmd = format!("USA2");
    write_to_port(state, WriteToPortArgs { data: cmd }, window)
}

#[tauri::command]
fn enable_output(state: State<AppState>, args: EnableOutputArgs, window: Window) -> Result<bool, String> {
    println!("enable_output called with channel: {}, enable: {}", args.channel, args.enable);

    // Using cloned state and window
    write_to_port(state.clone(), WriteToPortArgs { data: "WMN1\n".to_string() }, window.clone())?;
    std::thread::sleep(std::time::Duration::from_millis(500));
    write_to_port(state, WriteToPortArgs { data: "WFN1\n".to_string() }, window)?;

    Ok(true) // Return Ok with true to match the expected type
}

#[tauri::command]
fn send_initial_commands(state: State<AppState>, window: Window) -> Result<bool, String> {
    let port_name = PORT_NAME.lock().unwrap().clone();
    println!("send_initial_commands called with port_name: {}", port_name);

    let commands = [
        "WFN0\n",       // Set Channel 2 off
        "WMN0\n",       // Set Channel 1 off
        "USD2\n",       // Specific command, likely setting or reading a mode/state
        "UMS0\n",       // Specific command, likely setting or reading a mode/state
        "UUL0\n",       // Specific command, likely setting or reading a mode/state
        "WMF0000\n",    // Set Channel 1 frequency to 0
        "WFF0000\n",    // Set Channel 2 frequency to 0
        "WMW01\n",      // Set Channel 1 to square wave
        "WFW00\n",      // Set Channel 2 to sine wave
        "WFD50.0\n",    // Set Channel 2 duty cycle to 50%
        "WFO00.00\n",   // Set Channel 2 offset to 0
        "WMO00.00\n",   // Set Channel 1 offset to 0
        "WMD50.0\n",    // Set Channel 1 duty cycle to 50%
        "WMP000\n",     // Set Channel 1 phase to 0
        "WFP000\n",     // Set Channel 2 phase to 0
        "WFT0\n",       // Set Channel 2 attenuation to 0
        "WFF3100000.000000\n",  // Set Channel 2 frequency to 3.1 MHz
        "USA2\n",       // Specific command, likely setting or reading a mode/state
        "WFN1\n",       // Set Channel 2 on
        "WMN1\n",       // Set Channel 1 on
        "WMA20.00\n",       // Set Channel 1 on
        "WFA20.00\n"       // Set Channel 2 on

    ];

    for cmd in &commands {
        println!("Sending command: {}", cmd);
        match write_to_port(state.clone(), WriteToPortArgs { data: cmd.to_string() }, window.clone()) {
            Ok(_) => println!("Command '{}' initial command sent successfully", cmd),
            Err(e) => {
                println!("Failed to send command '{}': {}", cmd, e);
                return Err(format!("Failed to send command '{}': {}", cmd, e));
            },
        }
        std::thread::sleep(std::time::Duration::from_millis(600));
    }

    Ok(true)
}

#[tauri::command]
fn stop_and_reset(state: State<AppState>, window: Window) -> Result<bool, String> {
    let port_name = PORT_NAME.lock().unwrap().clone();
    println!("stop_and_reset called with port_name: {}", port_name);

    let commands = [
        "WFN0\n", "WMN0\n", "WFN0\n", "WMN0\n", "USD2\n",  "WFA05.00\n", "WMA05.00\n"
    ];

    for cmd in &commands {
        println!("Sending command: {}", cmd);
        match write_to_port(state.clone(), WriteToPortArgs { data: cmd.to_string() }, window.clone()) {
            Ok(_) => println!("Command '{}' stop command sent successfully", cmd),
            Err(e) => {
                println!("Failed to send command '{}': {}", cmd, e);
                return Err(format!("Failed to send command '{}': {}", cmd, e));
            },
        }
        std::thread::sleep(std::time::Duration::from_millis(300));
    }

    Ok(true)
}

#[tauri::command]
fn reconnect_device(state: State<AppState>, args: ReconnectArgs, window: Window) -> Result<String, String> {
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
    let mut reconnected_port = String::new();
    for port in available_ports {
        println!("Checking port: {}", port.port_name);
        match serialport::new(&port.port_name, args.baud_rate)
            .timeout(Duration::from_millis(500))
            .data_bits(serialport::DataBits::Eight)
            .parity(serialport::Parity::None)
            .stop_bits(serialport::StopBits::One)
            .flow_control(serialport::FlowControl::None)
            .open() {
            Ok(mut serial_port) => {
                println!("Opened port: {}", port.port_name);
                let mut buffer: Vec<u8> = vec![0; 100];
                serial_port.write_all(b"UMO\r\n").expect("Write failed");
                std::thread::sleep(std::time::Duration::from_millis(500));
                match serial_port.read(buffer.as_mut_slice()) {
                    Ok(bytes_read) => {
                        let response = String::from_utf8_lossy(&buffer[..bytes_read]);
                        println!("Response from device: {}", response);
                        if response.starts_with("FY23") || response.starts_with("FY63") {
                            let mut ports = state.ports.lock().map_err(|_| "Failed to acquire lock on ports.".to_string())?;
                            ports.insert(port.port_name.clone(), PortHandle(Mutex::new(Some(serial_port))));
                            println!("Successfully connected to device on port: {}", port.port_name);
                            *PORT_NAME.lock().unwrap() = port.port_name.clone();
                            reconnected_port = port.port_name.clone();
                            window.emit("reconnected", reconnected_port.clone()).unwrap();
                            return Ok(reconnected_port);
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

    if reconnected_port.is_empty() {
        // Default to "TEST"
        let mut ports = state.ports.lock().map_err(|_| "Failed to acquire lock on ports.".to_string())?;
        println!("Target device not found. Defaulting to Test Port.");
        ports.insert("TEST".to_string(), PortHandle(Mutex::new(None)));
        *PORT_NAME.lock().unwrap() = "TEST".to_string();
        reconnected_port = "TEST".to_string();
        window.emit("reconnected", reconnected_port.clone()).unwrap();
    }

    Ok(reconnected_port)
}

fn main() {
    // Install necessary resources before the app starts
    // install_all_resources();

    tauri::Builder::default()
        .setup(|app| {
            app.manage(AppState {
                ports: Mutex::new(HashMap::new()),
            });
            env_logger::Builder::from_env(Env::default().default_filter_or("info")).init();
            log::info!("Application started");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_ports,
            open_port,
            close_port,
            set_frequency,
            set_amplitude,
            set_offset,
            set_duty_cycle,
            set_phase,
            set_attenuation,
            synchronise_voltage,
            send_initial_commands,
            enable_output,
            stop_and_reset,
            write_to_port,
            reconnect_device
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

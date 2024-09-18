#![windows_subsystem = "windows"]
use tauri::{self, Manager, State, Window};


use env_logger::Env;
use serialport::{self, SerialPort};
use std::sync::Mutex;
use std::time::Duration;
use std::collections::HashMap;
use std::io::Write;
use serde::{Serialize, Deserialize};
use std::io::Read;


// Set Commands
// [WMW - Set waveform of main wave]
// [WMF - Set frequency of main wave]
// [WMA - Set amplitude of main wave]
// [WMO - Set offset of main wave]
// [WMD - Set duty cycle of main wave]
// [WMP - Set phase of main wave]
// [WMN - Set On/Off of main wave output]

// [WFW - Set waveform of auxiliary wave]
// [WFF - Set frequency of auxiliary wave]
// [WFA - Set amplitude of auxiliary wave]
// [WFO - Set offset of auxiliary wave]
// [WFD - Set duty cycle of auxiliary wave]
// [WFP - Set phase of auxiliary wave]
// [WFN - Set On/Off of auxiliary wave output]

// [WPM - Set trigger mode of main wave]
// [WPN - Set pulse amount triggered by main wave]
// [WTA - Set ASK mode of main wave]
// [WTF - Set FSK mode of main wave]
// [WFK - Set FSK secondary frequency of main wave]
// [WTP - Set PSK mode of main wave]

// Read Commands
// [RMW - Read waveform of main wave]
// [RMF - Read frequency of main wave]
// [RMA - Read amplitude of main wave]
// [RMO - Read offset of main wave]
// [RMD - Read duty cycle of main wave]
// [RMP - Read phase of main wave]
// [RMN - Read On/Off of main wave output]

// [RFW - Read waveform of auxiliary wave]
// [RFF - Read frequency of auxiliary wave]
// [RFA - Read amplitude of auxiliary wave]
// [RFO - Read offset of auxiliary wave]
// [RFD - Read duty cycle of auxiliary wave]
// [RFP - Read phase of auxiliary wave]
// [RFN - Read On/Off of auxiliary wave output]

// [RPM - Read trigger mode of main wave]
// [RPN - Read pulse amount triggered by main wave]
// [RTA - Read ASK mode of main wave]
// [RTF - Read FSK mode of main wave]
// [RFK - Read FSK secondary frequency of main wave]
// [RTP - Read PSK mode of main wave]


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
    std::thread::sleep(std::time::Duration::from_millis(50));
    // Return success
    Ok(true)
}

#[tauri::command]
fn set_amplitude(state: State<AppState>, args: SetAmplitudeArgs, window: Window) -> Result<bool, String> {
    println!("set_amplitude called with channel: {}, amplitude: {}", args.channel, args.amplitude);

    let scaled_amplitude = args.amplitude; // Scale the amplitude
    let commands = [
        format!("WMA{:05.2}\n", scaled_amplitude),
    ];

    for cmd in &commands {
        match write_to_port(state.clone(), WriteToPortArgs { data: cmd.to_string() }, window.clone()) {
            Ok(_) => {
                println!("Command '{}' sent successfully", cmd);
            },
            Err(e) => {
                println!("Failed to send command '{}': {}", cmd, e);
                return Err(format!("Failed to send command '{}': {}", cmd, e));
            },
        }
        std::thread::sleep(std::time::Duration::from_millis(200)); // Delay between commands
    }

    Ok(true)
}

#[tauri::command]
fn sine_wave(state: State<AppState>, window: Window) -> Result<bool, String> {
    println!("sine_wave called");
    let cmd = "WMW00\n".to_string();
    write_to_port(state, WriteToPortArgs { data: cmd }, window)
}




#[tauri::command]
fn send_initial_commands(state: State<AppState>, window: Window) -> Result<bool, String> {
    let port_name = PORT_NAME.lock().unwrap().clone();
    println!("send_initial_commands called with port_name: {}", port_name);


        let channel1 = vec![
            "WFW00\n",      // Set Channel 2 to sine wave
            "WFO00.00\n",   // Set Channel 2 offset to 0
            "WFD50.0\n",    // Set Channel 2 duty cycle to 50%
            "WFP000\n",     // Set Channel 2 phase to 0
            "WFT0\n",       // Set Channel 2 attenuation to 0
            "WFF3100000.000000\n",  // Set Channel 2 frequency to 3.1 MHz
            "WFN1\n"        // Set Channel 2 on
        ];

        let  commands = channel1.clone();  // Start with channel0



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
fn send_secondary_commands(state: State<AppState>, window: Window) -> Result<bool, String> {
    let port_name = PORT_NAME.lock().unwrap().clone();
    println!("send_secondary_commands called with port_name: {}", port_name);


        let channel0 = vec![
            "WMW01\n",      // Set Channel 1 to square wave
            "WMO00.00\n",   // Set Channel 1 offset to 0
            "WMD50.0\n",    // Set Channel 1 duty cycle to 50%
            "WMP000\n",     // Set Channel 1 phase to 0
            "WMT0\n",       // Set Channel 1 attenuation to 0
            "WMN1\n",        // Set Channel 1 on
            "WMA005.000\n",
            "USA2\n"
        ];

        let  commands = channel0.clone();  // Start with channel0



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
        "WFN0\n", "WMN0\n"//, "USD2\n", "WMA05.00\n"
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
        std::thread::sleep(std::time::Duration::from_millis(600));
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
                            PORT_NAME.lock().unwrap().clone_from(&port.port_name);
                            reconnected_port.clone_from(&port.port_name);
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
    //install_all_resources();

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

            send_initial_commands,
            send_secondary_commands,
            stop_and_reset,
            write_to_port,
            reconnect_device,
            sine_wave
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

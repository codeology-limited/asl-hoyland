use crate::app_state::{
    log_test_port_data, perform_real_port_write, AppState, PortHandle, PORT_NAME,
};
use serde::Deserialize;
use serialport;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{State, Window};

#[derive(Deserialize)]
pub struct WriteToPortArgs {
    pub data: String,
}

#[derive(Deserialize)]
pub struct OpenPortArgs {
    pub baud_rate: u32,
}

#[derive(Deserialize)]
pub struct ClosePortArgs {}

#[tauri::command]
pub fn list_ports() -> Vec<String> {
    println!("list_ports called");
    let mut ports = serialport::available_ports()
        .map(|ports| {
            ports
                .into_iter()
                .map(|p| p.port_name)
                .collect::<Vec<String>>()
        })
        .unwrap_or_else(|_| Vec::new());
    ports.push("TEST".to_string());
    println!("Available ports: {:?}", ports);
    ports
}

#[tauri::command]
pub fn open_port(state: State<AppState>, args: OpenPortArgs) -> Result<bool, String> {
    let port_name = PORT_NAME.lock().unwrap_or_else(|e| e.into_inner()).clone();
    println!(
        "open_port called with port_name: {}, baud_rate: {}",
        port_name, args.baud_rate
    );

    let mut ports = state
        .ports
        .lock()
        .map_err(|_| "Failed to acquire lock on ports.".to_string())?;

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
        .open()
    {
        Ok(port) => {
            ports.insert(port_name.clone(), PortHandle(Mutex::new(Some(port))));
            println!("Successfully opened port: {}", port_name);
            Ok(true)
        }
        Err(e) => {
            let msg = format!("Failed to open port: {}. Error: {}", port_name, e);
            println!("{}", msg);
            Err(msg)
        }
    }
}

#[tauri::command]
pub fn close_port(state: State<AppState>, _args: ClosePortArgs) -> Result<bool, String> {
    let port_name = PORT_NAME.lock().unwrap_or_else(|e| e.into_inner()).clone();
    println!("close_port called with port_name: {}", port_name);
    let mut ports = state
        .ports
        .lock()
        .map_err(|_| "Failed to acquire lock on ports.".to_string())?;
    if ports.remove(&port_name).is_some() {
        println!("Successfully closed port: {}", port_name);
        Ok(true)
    } else {
        println!("Port not found: {}", port_name);
        Err("Port not found".to_string())
    }
}

#[tauri::command]
pub fn write_to_port(
    state: State<AppState>,
    args: WriteToPortArgs,
    window: Window,
) -> Result<bool, String> {
    let port_name = PORT_NAME.lock().unwrap_or_else(|e| e.into_inner()).clone();
    println!("Writing to port: {} with data: {}", port_name, args.data);

    let emit_event = |event: &str, message: String| {
        if let Err(err) = window.emit(event, message) {
            eprintln!("Failed to emit {} event: {}", event, err);
        }
    };

    if port_name == "TEST" {
        log_test_port_data(&args.data)?;
        emit_event(
            "message_success",
            format!("Message sent to Test Port: {}", args.data),
        );
    } else {
        match perform_real_port_write(&state.ports, &args.data) {
            Ok(_) => {
                println!("Command '{}' sent successfully by write to port", args.data);
                emit_event(
                    "message_success",
                    format!("Message sent to {}: {}", port_name, args.data),
                );
            }
            Err(e) => {
                let error_message = format!("Failed to send command '{}': {}", args.data, e);
                println!("{}", error_message);
                emit_event("message_fail", error_message.clone());
                return Err(error_message);
            }
        }
    }
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn list_ports_always_includes_test() {
        let ports = list_ports();
        assert!(ports.contains(&"TEST".to_string()));
    }
}

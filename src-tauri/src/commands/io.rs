use crate::app_state::{
    log_test_port_data, perform_real_port_query, perform_real_port_write, AppState, PORT_NAME,
};
use serde::Deserialize;
use tauri::{State, Window};

#[derive(Deserialize)]
pub struct WriteToPortArgs {
    pub data: String,
}

/// Write one command line to the active port. Called directly by the program
/// commands (not exposed over IPC — the frontend never invokes it).
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


#[derive(Deserialize)]
pub struct ReadDeviceStateArgs {
    /// Read commands to issue, e.g. ["RMW", "RFW", "RMF", "RFF", "RMN", "RFN"].
    pub queries: Vec<String>,
}

/// Read the generator's own registers back.
///
/// The app is otherwise write-only: it assumes every command took effect. On real
/// hardware a command is occasionally ignored (observed after sustained use), which
/// silently leaves a channel on the wrong waveform while the UI shows the intended
/// one. Reading the registers back is the only way to tell.
#[tauri::command]
pub fn read_device_state(
    state: State<AppState>,
    args: ReadDeviceStateArgs,
) -> Result<Vec<String>, String> {
    let port_name = PORT_NAME.lock().unwrap_or_else(|e| e.into_inner()).clone();
    if port_name == "TEST" {
        // No device: report "unknown" for every query so callers skip verification.
        return Ok(args.queries.iter().map(|_| String::new()).collect());
    }
    let mut out = Vec::with_capacity(args.queries.len());
    for q in &args.queries {
        let reply = perform_real_port_query(&state.ports, q)?;
        println!("read_device_state: {} -> {:?}", q, reply);
        out.push(reply);
    }
    Ok(out)
}

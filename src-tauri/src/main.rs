#![windows_subsystem = "windows"]

mod app_state;
mod commands;

use app_state::{AppState, SessionState};
use env_logger::Env;
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            app.manage(AppState {
                ports: Mutex::new(HashMap::new()),
                session: Mutex::new(SessionState::default()),
            });
            env_logger::Builder::from_env(Env::default().default_filter_or("info")).init();
            log::info!("Application started");
            // Spawn the deadman/heartbeat watchdog. It force-stops the device if
            // the frontend stops sending heartbeats or a session overruns.
            commands::session::spawn_watchdog(app.handle());
            Ok(())
        })
        .on_window_event(|event| {
            // SAFETY: on window close, synchronously best-effort STOP the device
            // before the window goes away, so we never leave the FY6600 driving
            // a signal into a body after the UI is gone. Keep this bounded — it
            // only iterates the fixed STOP_COMMANDS list, no long loops/sleeps.
            if let tauri::WindowEvent::CloseRequested { .. } = event.event() {
                let window = event.window();
                let state = window.state::<AppState>();
                log::warn!("Window close requested: force-stopping device");
                app_state::force_stop(&state.ports);
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::io::list_ports,
            commands::io::open_port,
            commands::io::close_port,
            commands::io::write_to_port,
            commands::program::set_frequency,
            commands::program::set_amplitude,
            commands::program::set_both_channels_to_square_wave,
            commands::program::set_both_channels_to_sine_wave,
            commands::program::set_channels_output,
            commands::program::send_initial_commands,
            commands::program::send_secondary_commands,
            commands::program::enable_outputs,
            commands::program::stop_and_reset,
            commands::program::sync,
            commands::program::sine_wave,
            commands::connection::reconnect_device,
            commands::connection::use_test_port,
            commands::session::session_start,
            commands::session::session_stop,
            commands::session::heartbeat
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

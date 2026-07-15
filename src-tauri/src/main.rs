#![windows_subsystem = "windows"]

mod app_state;
mod commands;

use app_state::AppState;
use env_logger::Env;
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::Manager;

fn main() {
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
            commands::program::enable_waveform_sync,
            commands::program::sine_wave,
            commands::connection::reconnect_device,
            commands::connection::use_test_port
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

use super::io::{write_to_port, WriteToPortArgs};
use crate::app_state::{AppState, PORT_NAME};
use serde::Deserialize;
use tauri::{State, Window};

const SQUARE_WAVE_COMMANDS: &[&str] = &["WMW01\n", "WFW01\n"];
const INITIAL_COMMANDS: &[&str] = &[
    "WFW00\n",              // CH2 waveform sine
    "WFO00.00\n",           // CH2 offset
    "WFD50.0\n",            // CH2 duty
    "WFP000\n",             // CH2 phase
    "WFT0\n",               // CH2 trigger
    "WFF3100000.000000\n",  // CH2 frequency 3.1MHz
    // WFN1 moved to ENABLE_OUTPUT_COMMANDS — outputs enabled last
];
const SYNC_COMMANDS: &[&str] = &["USA0\n", "USA1\n", "USA2\n", "USA3\n", "USA4\n"];
const SECONDARY_COMMANDS: &[&str] = &[
    "WMW01\n",              // CH1 waveform square
    "WMO00.00\n",           // CH1 offset
    "WMD50.0\n",            // CH1 duty
    "WMP000\n",             // CH1 phase
    "WMT0\n",               // CH1 trigger
    // CH1 amplitude (WMA) removed — the run loop applies the UI intensity via
    // applyCurrentIntensity just before enabling outputs, so a hardcoded 5.00
    // here was always overwritten and only added startup noise (Robbie report).
    // WMN1 and USA2 moved to ENABLE_OUTPUT_COMMANDS — outputs enabled last
];
const ENABLE_OUTPUT_COMMANDS: &[&str] = &[
    "WFN1\n",               // CH2 on
    "WMN1\n",               // CH1 on
    "USA2\n",               // Amplitude sync — CH2 follows CH1 amplitude.
                            // (FY6600 protocol: USA0=waveform, USA1=frequency,
                            // USA2=amplitude, USA3=offset, USA4=duty.)
];
const STOP_COMMANDS: &[&str] = &[
    "USD0\n", "USD1\n", "USD2\n", "USD3\n", "USD4\n", // Disable sync FIRST
    "WFF0\n", "WMF0\n",                               // Reset frequencies
    "WFN0\n", "WMN0\n",                               // Turn off channels LAST
];

#[derive(Deserialize)]
pub struct SetFrequencyArgs {
    pub channel: u8,
    pub frequency: f64,
}

#[derive(Deserialize)]
pub struct SetAmplitudeArgs {
    pub channel: u8,
    pub amplitude: f64,
}

#[derive(Deserialize)]
pub struct SetChannelsOutputArgs {
    pub on: bool,
}

#[tauri::command]
pub fn set_frequency(
    state: State<AppState>,
    args: SetFrequencyArgs,
    window: Window,
) -> Result<bool, String> {
    println!(
        "Incoming request: set_frequency called with channel: {}, frequency: {}",
        args.channel, args.frequency
    );

    if args.frequency < 0.0 {
        return Err("Frequency must be non-negative".to_string());
    }

    let mhz_part = args.frequency.trunc() as u64;
    let fractional_part = (args.frequency.fract() * 1_000_000.0).round() as u64;

    println!(
        "MHz part: {}, Fractional part: {}",
        mhz_part, fractional_part
    );

    let prefix = match args.channel {
        1 => "WMF",
        2 => "WFF",
        _ => return Err("Invalid channel. Must be 1 or 2".to_string()),
    };

    let cmd = format!("{}{:07}.{:06}\n", prefix, mhz_part, fractional_part);
    println!("Outgoing command: {}", cmd);

    match write_to_port(state, WriteToPortArgs { data: cmd.clone() }, window) {
        Ok(_) => println!(
            "Command '{}' frequency sent successfully to the port",
            cmd.trim()
        ),
        Err(e) => return Err(format!("Failed to send command: {}", e)),
    }
    std::thread::sleep(std::time::Duration::from_millis(5));
    Ok(true)
}

#[tauri::command]
pub fn set_amplitude(
    state: State<AppState>,
    args: SetAmplitudeArgs,
    window: Window,
) -> Result<bool, String> {
    println!(
        "set_amplitude called with channel: {}, amplitude: {}",
        args.channel, args.amplitude
    );

    let prefix = match args.channel {
        2 => "WFA",
        _ => "WMA",
    };
    let commands = [format!("{}{:05.2}\n", prefix, args.amplitude)];

    for cmd in &commands {
        match write_to_port(
            state.clone(),
            WriteToPortArgs {
                data: cmd.to_string(),
            },
            window.clone(),
        ) {
            Ok(_) => {
                println!("Command '{}' sent successfully", cmd);
            }
            Err(e) => {
                println!("Failed to send command '{}': {}", cmd, e);
                return Err(format!("Failed to send command '{}': {}", cmd, e));
            }
        }
        std::thread::sleep(std::time::Duration::from_millis(200));
    }

    Ok(true)
}

#[tauri::command]
pub fn sine_wave(state: State<AppState>, window: Window) -> Result<bool, String> {
    println!("sine_wave called");
    let cmd = "WMW00\n".to_string();
    write_to_port(state, WriteToPortArgs { data: cmd }, window)
}

/// CH1 waveform → square (WMW01). Pair to sine_wave; with waveform-sync (USA0) on,
/// CH2 follows CH1, so per-step programs drive CH1 only and the channels can't split.
#[tauri::command]
pub fn square_wave(state: State<AppState>, window: Window) -> Result<bool, String> {
    println!("square_wave called");
    let cmd = "WMW01\n".to_string();
    write_to_port(state, WriteToPortArgs { data: cmd }, window)
}

#[tauri::command]
pub fn set_both_channels_to_sine_wave(
    state: State<AppState>,
    window: Window,
) -> Result<bool, String> {
    println!("set_both_channels_to_sine_wave called");
    let commands = ["WMW00\n", "WFW00\n"];
    send_batched_commands(state, window, &commands)
}

#[tauri::command]
pub fn set_channels_output(
    state: State<AppState>,
    args: SetChannelsOutputArgs,
    window: Window,
) -> Result<bool, String> {
    println!("set_channels_output called with on: {}", args.on);
    // Match the order used by ENABLE_OUTPUT_COMMANDS (CH2 first, then CH1, then re-assert sync).
    // The 50 ms gap is much shorter than the 600 ms used at startup, but enough for the
    // device to register each command between rapid pulse cycles.
    let commands: &[&str] = if args.on {
        &["WFN1\n", "WMN1\n", "USA2\n"]
    } else {
        &["WFN0\n", "WMN0\n"]
    };
    for cmd in commands.iter() {
        write_to_port(
            state.clone(),
            WriteToPortArgs {
                data: (*cmd).to_string(),
            },
            window.clone(),
        )?;
        std::thread::sleep(std::time::Duration::from_millis(50));
    }
    Ok(true)
}

fn send_batched_commands(
    state: State<AppState>,
    window: Window,
    commands: &[&str],
) -> Result<bool, String> {
    for cmd in commands {
        println!("Sending command: {}", cmd);
        match write_to_port(
            state.clone(),
            WriteToPortArgs {
                data: (*cmd).to_string(),
            },
            window.clone(),
        ) {
            Ok(_) => println!("Command '{}' sent successfully", cmd),
            Err(e) => {
                println!("Failed to send command '{}': {}", cmd, e);
                return Err(format!("Failed to send command '{}': {}", cmd, e));
            }
        }
        std::thread::sleep(std::time::Duration::from_millis(600));
    }
    Ok(true)
}

#[tauri::command]
pub fn set_both_channels_to_square_wave(
    state: State<AppState>,
    window: Window,
) -> Result<bool, String> {
    println!(
        "set_both_channels_to_square_wave called with port_name: {}",
        PORT_NAME.lock().unwrap_or_else(|e| e.into_inner()).as_str()
    );

    send_batched_commands(state, window, SQUARE_WAVE_COMMANDS)
}

#[tauri::command]
pub fn send_initial_commands(state: State<AppState>, window: Window) -> Result<bool, String> {
    println!(
        "send_initial_commands called with port_name: {}",
        PORT_NAME.lock().unwrap_or_else(|e| e.into_inner()).as_str()
    );

    send_batched_commands(state, window, INITIAL_COMMANDS)
}

/// Enable CH2→CH1 waveform sync (USA0) so CH2 tracks CH1's waveform in hardware.
/// Used for per-step-waveform programs: the device intermittently drops one of the
/// two per-step waveform commands, leaving the channels on different waveforms;
/// with waveform-sync on, CH2 can't diverge from CH1. Frequency stays independent
/// (USA1 is left off), and stop_and_reset's USD0 clears this sync. (Rob report)
#[tauri::command]
pub fn enable_waveform_sync(state: State<AppState>, window: Window) -> Result<bool, String> {
    send_batched_commands(state, window, &["USA0\n"])
}

#[tauri::command]
pub fn sync(state: State<AppState>, window: Window) -> Result<bool, String> {
    println!(
        "sync called with port_name: {}",
        PORT_NAME.lock().unwrap_or_else(|e| e.into_inner()).as_str()
    );

    send_batched_commands(state, window, SYNC_COMMANDS)
}

#[tauri::command]
pub fn send_secondary_commands(state: State<AppState>, window: Window) -> Result<bool, String> {
    println!(
        "send_secondary_commands called with port_name: {}",
        PORT_NAME.lock().unwrap_or_else(|e| e.into_inner()).as_str()
    );

    send_batched_commands(state, window, SECONDARY_COMMANDS)
}

#[tauri::command]
pub fn enable_outputs(state: State<AppState>, window: Window) -> Result<bool, String> {
    println!(
        "enable_outputs called with port_name: {}",
        PORT_NAME.lock().unwrap_or_else(|e| e.into_inner()).as_str()
    );

    send_batched_commands(state, window, ENABLE_OUTPUT_COMMANDS)
}

#[tauri::command]
pub fn stop_and_reset(state: State<AppState>, window: Window) -> Result<bool, String> {
    println!(
        "stop_and_reset called with port_name: {}",
        PORT_NAME.lock().unwrap_or_else(|e| e.into_inner()).as_str()
    );

    send_batched_commands(state, window, STOP_COMMANDS)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn format_frequency_cmd(prefix: &str, frequency: f64) -> String {
        let mhz_part = frequency.trunc() as u64;
        let fractional_part = (frequency.fract() * 1_000_000.0).round() as u64;
        format!("{}{:07}.{:06}\n", prefix, mhz_part, fractional_part)
    }

    fn format_amplitude_cmd(amplitude: f64) -> String {
        format!("WMA{:05.2}\n", amplitude)
    }

    #[test]
    fn frequency_formatting_channel1() {
        let cmd = format_frequency_cmd("WMF", 27.12);
        assert_eq!(cmd, "WMF0000027.120000\n");
    }

    #[test]
    fn frequency_formatting_channel2() {
        let cmd = format_frequency_cmd("WFF", 3.1);
        assert_eq!(cmd, "WFF0000003.100000\n");
    }

    #[test]
    fn amplitude_formatting_min_and_rounding() {
        assert_eq!(format_amplitude_cmd(1.5), "WMA01.50\n");
        assert_eq!(format_amplitude_cmd(20.0), "WMA20.00\n");
        assert_eq!(format_amplitude_cmd(0.0), "WMA00.00\n");
    }

    #[test]
    fn stop_and_reset_command_sequence_expected() {
        let expected = vec![
            "USD0\n", "USD1\n", "USD2\n", "USD3\n", "USD4\n", // Disable sync FIRST
            "WFF0\n", "WMF0\n",                               // Reset frequencies
            "WFN0\n", "WMN0\n",                               // Turn off channels LAST
        ];
        assert_eq!(expected.len(), 9);
        for s in expected {
            assert!(s.ends_with('\n'));
            let first = s.chars().next().unwrap_or(' ');
            assert!(first == 'W' || first == 'U');
        }
    }

    #[test]
    fn square_wave_commands_includes_expected_steps() {
        assert_eq!(SQUARE_WAVE_COMMANDS, &["WMW01\n", "WFW01\n"]);
    }

    #[test]
    fn initial_commands_configure_ch2_without_enabling() {
        assert_eq!(INITIAL_COMMANDS.first().copied(), Some("WFW00\n"));
        assert!(!INITIAL_COMMANDS.contains(&"WFN1\n")); // CH2 on moved to enable_outputs
        assert_eq!(INITIAL_COMMANDS.len(), 6);
    }

    #[test]
    fn sync_commands_cover_all_channels() {
        assert_eq!(SYNC_COMMANDS.len(), 5);
        for (index, cmd) in SYNC_COMMANDS.iter().enumerate() {
            assert!(cmd.contains(&index.to_string()));
        }
    }

    #[test]
    fn secondary_commands_configure_ch1_without_enabling() {
        assert!(SECONDARY_COMMANDS.contains(&"WMO00.00\n"));
        assert!(!SECONDARY_COMMANDS.contains(&"WMN1\n")); // CH1 on moved to enable_outputs
        assert!(!SECONDARY_COMMANDS.contains(&"USA2\n")); // Sync moved to enable_outputs
        // CH1 amplitude removed — applied from UI intensity at run time instead.
        assert!(!SECONDARY_COMMANDS.iter().any(|c| c.starts_with("WMA")));
        assert_eq!(SECONDARY_COMMANDS.len(), 5);
    }

    #[test]
    fn waveform_sync_uses_usa0_opcode() {
        // enable_waveform_sync sends USA0 — the waveform-sync opcode (index 0 of the
        // USA family), distinct from USA1 (frequency) which must stay off.
        assert_eq!(SYNC_COMMANDS.first().copied(), Some("USA0\n"));
        assert_ne!(SYNC_COMMANDS.first().copied(), Some("USA1\n"));
    }

    #[test]
    fn enable_output_commands_turn_on_channels_and_sync() {
        assert!(ENABLE_OUTPUT_COMMANDS.contains(&"WFN1\n")); // CH2 on
        assert!(ENABLE_OUTPUT_COMMANDS.contains(&"WMN1\n")); // CH1 on
        assert!(ENABLE_OUTPUT_COMMANDS.contains(&"USA2\n")); // Amplitude sync
        assert_eq!(ENABLE_OUTPUT_COMMANDS.len(), 3);
    }
}

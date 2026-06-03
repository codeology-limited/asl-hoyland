use crate::app_state::{force_stop, AppState, SessionState};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager, State};

/// If no heartbeat arrives within this window while a session is active, the
/// watchdog force-stops the device. The frontend ticks a heartbeat on every
/// progress update, so a stalled/crashed UI trips this safety net.
pub const HEARTBEAT_TIMEOUT: Duration = Duration::from_secs(30);

/// Absolute upper bound on a single session. Chosen comfortably above the
/// longest legitimate program (the 8h naturalKillerCell run) so a normal
/// session never trips it, while still bounding a stuck-on device.
pub const MAX_SESSION: Duration = Duration::from_secs(9 * 60 * 60);

/// How often the watchdog re-evaluates the session deadlines.
pub const WATCHDOG_TICK: Duration = Duration::from_secs(1);

// --- Pure state transitions (operate on the session mutex directly) ---------
// The #[tauri::command] wrappers below just adapt State<AppState> to these so
// the transitions can be unit tested without constructing a Tauri State.

/// Arm the deadman timer: active, started_at=now, last_heartbeat=now.
fn do_session_start(session: &Mutex<SessionState>, now: Instant) {
    let mut s = session.lock().unwrap_or_else(|e| e.into_inner());
    s.active = true;
    s.started_at = Some(now);
    s.last_heartbeat = Some(now);
}

/// Refresh the heartbeat, but only while a session is active so a stray ping
/// can't (re)arm a stopped session.
fn do_heartbeat(session: &Mutex<SessionState>, now: Instant) {
    let mut s = session.lock().unwrap_or_else(|e| e.into_inner());
    if s.active {
        s.last_heartbeat = Some(now);
    }
}

/// Disarm the deadman timer and clear all timers.
fn do_session_stop(session: &Mutex<SessionState>) {
    let mut s = session.lock().unwrap_or_else(|e| e.into_inner());
    s.active = false;
    s.last_heartbeat = None;
    s.started_at = None;
}

/// Begin a therapeutic session. Called right after outputs are enabled. Arms the
/// deadman timer so the watchdog can force-stop on a missed heartbeat or overrun.
#[tauri::command]
pub fn session_start(state: State<AppState>) -> Result<bool, String> {
    do_session_start(&state.session, Instant::now());
    log::info!("session_start: deadman watchdog armed");
    Ok(true)
}

/// Liveness ping from the frontend progress loop. Refreshes the heartbeat only
/// while a session is active so stray pings can't (re)arm a stopped session.
#[tauri::command]
pub fn heartbeat(state: State<AppState>) -> Result<bool, String> {
    do_heartbeat(&state.session, Instant::now());
    Ok(true)
}

/// End the session and disarm the deadman timer. Called from the stop/cleanup
/// path so a clean shutdown doesn't leave the watchdog armed.
#[tauri::command]
pub fn session_stop(state: State<AppState>) -> Result<bool, String> {
    do_session_stop(&state.session);
    log::info!("session_stop: deadman watchdog disarmed");
    Ok(true)
}

/// Pure deadman policy: given the session state and "now", decide whether the
/// watchdog must force-stop. Split out so it can be unit tested without threads
/// or real time. Returns an optional reason string for logging.
fn deadman_breach(session: &SessionState, now: Instant) -> Option<&'static str> {
    if !session.active {
        return None;
    }
    if let Some(last) = session.last_heartbeat {
        if now.duration_since(last) > HEARTBEAT_TIMEOUT {
            return Some("missed heartbeat");
        }
    }
    if let Some(started) = session.started_at {
        if now.duration_since(started) > MAX_SESSION {
            return Some("max session duration exceeded");
        }
    }
    None
}

/// Spawn the deadman watchdog thread. Every WATCHDOG_TICK it checks the managed
/// session state; on a breach it force-stops the device and disarms the session.
/// Panic-free: all locks use the poison-tolerant pattern.
pub fn spawn_watchdog(app_handle: AppHandle) {
    std::thread::spawn(move || loop {
        std::thread::sleep(WATCHDOG_TICK);
        let state = app_handle.state::<AppState>();
        let now = Instant::now();

        let breach = {
            let session = state.session.lock().unwrap_or_else(|e| e.into_inner());
            deadman_breach(&session, now)
        };

        if let Some(reason) = breach {
            log::warn!("Deadman watchdog tripped ({}): force-stopping device", reason);
            // Force-stop without holding the session lock so the STOP path can
            // never deadlock against it.
            force_stop(&state.ports);
            let mut session = state.session.lock().unwrap_or_else(|e| e.into_inner());
            session.active = false;
            session.last_heartbeat = None;
            session.started_at = None;
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deadman_inactive_never_breaches() {
        let session = SessionState::default();
        assert!(deadman_breach(&session, Instant::now()).is_none());
    }

    #[test]
    fn deadman_fresh_heartbeat_ok() {
        let now = Instant::now();
        let session = SessionState {
            active: true,
            last_heartbeat: Some(now),
            started_at: Some(now),
        };
        assert!(deadman_breach(&session, now).is_none());
    }

    #[test]
    fn deadman_missed_heartbeat_breaches() {
        // Build timestamps by ADDING to a base instant (never subtracting from
        // Instant::now(), which can underflow the monotonic clock on a freshly
        // booted machine). `base` is the session start / last heartbeat; `now`
        // is far enough past it that the heartbeat is stale.
        let base = Instant::now();
        let now = base + HEARTBEAT_TIMEOUT + Duration::from_secs(1);
        let session = SessionState {
            active: true,
            last_heartbeat: Some(base),
            started_at: Some(base),
        };
        assert_eq!(deadman_breach(&session, now), Some("missed heartbeat"));
    }

    #[test]
    fn deadman_max_session_breaches() {
        let base = Instant::now();
        let now = base + MAX_SESSION + Duration::from_secs(1);
        let session = SessionState {
            active: true,
            // Heartbeat is fresh (sent at `now`); only the absolute duration is
            // exceeded relative to the original start.
            last_heartbeat: Some(now),
            started_at: Some(base),
        };
        assert_eq!(
            deadman_breach(&session, now),
            Some("max session duration exceeded")
        );
    }

    #[test]
    fn max_session_exceeds_longest_program() {
        // The longest legitimate program (naturalKillerCell) runs 8h. The cap
        // must sit comfortably above it so a normal run never trips.
        assert!(MAX_SESSION > Duration::from_secs(8 * 60 * 60));
    }

    #[test]
    fn session_state_default_is_disarmed() {
        let session = SessionState::default();
        assert!(!session.active);
        assert!(session.last_heartbeat.is_none());
        assert!(session.started_at.is_none());
    }

    #[test]
    fn session_start_arms_timers() {
        let session = Mutex::new(SessionState::default());
        let now = Instant::now();
        do_session_start(&session, now);

        let s = session.lock().unwrap();
        assert!(s.active);
        assert_eq!(s.started_at, Some(now));
        assert_eq!(s.last_heartbeat, Some(now));
    }

    #[test]
    fn heartbeat_refreshes_only_when_active() {
        let session = Mutex::new(SessionState::default());
        let start = Instant::now();
        do_session_start(&session, start);

        let later = start + Duration::from_secs(5);
        do_heartbeat(&session, later);
        {
            let s = session.lock().unwrap();
            assert_eq!(s.last_heartbeat, Some(later));
            // started_at must NOT move on a heartbeat.
            assert_eq!(s.started_at, Some(start));
        }

        // After stop, a stray heartbeat must not re-arm or set last_heartbeat.
        do_session_stop(&session);
        do_heartbeat(&session, later + Duration::from_secs(1));
        let s = session.lock().unwrap();
        assert!(!s.active);
        assert!(s.last_heartbeat.is_none());
    }

    #[test]
    fn session_stop_disarms_and_clears_timers() {
        let session = Mutex::new(SessionState::default());
        do_session_start(&session, Instant::now());
        do_session_stop(&session);

        let s = session.lock().unwrap();
        assert!(!s.active);
        assert!(s.last_heartbeat.is_none());
        assert!(s.started_at.is_none());
    }

    #[test]
    fn full_session_lifecycle_then_no_breach() {
        let session = Mutex::new(SessionState::default());
        let now = Instant::now();
        do_session_start(&session, now);
        do_heartbeat(&session, now);
        do_session_stop(&session);
        // A disarmed session can never breach.
        let s = session.lock().unwrap();
        assert!(deadman_breach(&s, now + MAX_SESSION + Duration::from_secs(10)).is_none());
    }
}

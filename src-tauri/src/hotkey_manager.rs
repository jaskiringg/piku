use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, WebviewWindow};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
use crate::ipc;

// ⌥+Space toggles the ambient orb popup — a small overlay that drops in at the
// bottom of the active screen so you can talk to Piku / run a quick action from
// any other app. The main OS window is a normal window (tray + dock).
pub fn register(app: &AppHandle) {
    let shortcut = Shortcut::new(Some(Modifiers::ALT), Code::Space);
    if let Err(e) = app.global_shortcut().on_shortcut(shortcut, |app, _shortcut, event| {
        if event.state != ShortcutState::Pressed {
            return;
        }
        let Some(orb) = app.get_webview_window("orb") else {
            return;
        };
        if orb.is_visible().unwrap_or(false) {
            let _ = orb.hide();
            ipc::emit_close_request(app);
        } else {
            position_bottom_center(&orb);
            let _ = orb.show();
            let _ = orb.set_focus();
            ipc::emit_hotkey_pressed(app);
        }
    }) {
        // Graceful degradation — macOS Accessibility permission may be denied on
        // first launch. The tray icon opens the main window as a fallback.
        eprintln!("[piku] global hotkey registration failed: {e}");
    }
}

// Drop the ambient popup at the bottom-center of the active monitor.
fn position_bottom_center(window: &WebviewWindow) {
    let monitor = match window.current_monitor() {
        Ok(Some(m)) => m,
        _ => match window.primary_monitor() {
            Ok(Some(m)) => m,
            _ => return,
        },
    };
    let msize: PhysicalSize<u32> = *monitor.size();
    let mpos: PhysicalPosition<i32> = *monitor.position();
    let scale = monitor.scale_factor();
    let win: PhysicalSize<u32> = window
        .outer_size()
        .unwrap_or_else(|_| PhysicalSize::new((600.0 * scale) as u32, (240.0 * scale) as u32));
    let margin = (28.0 * scale) as i32;
    let x = mpos.x + (msize.width as i32 - win.width as i32) / 2;
    let y = mpos.y + (msize.height as i32 - win.height as i32 - margin);
    let _ = window.set_position(PhysicalPosition::new(x, y));
}

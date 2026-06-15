use tauri::{AppHandle, Emitter};

pub fn emit_hotkey_pressed(app: &AppHandle) {
    let _ = app.emit("hotkey-pressed", ());
}

pub fn emit_close_request(app: &AppHandle) {
    let _ = app.emit("overlay-close-request", ());
}

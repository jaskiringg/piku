use tauri::WebviewWindow;

#[tauri::command]
pub fn show_overlay(window: WebviewWindow) -> Result<(), String> {
    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn hide_overlay(window: WebviewWindow) -> Result<(), String> {
    window.hide().map_err(|e| e.to_string())
}

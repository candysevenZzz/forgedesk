use std::fs;
use tauri::{AppHandle, Manager};

fn work_notes_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let directory = app.path().app_data_dir().map_err(|error| error.to_string())?;
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    Ok(directory.join("work-notes.json"))
}

fn runtime_settings_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let directory = app.path().app_data_dir().map_err(|error| error.to_string())?;
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    Ok(directory.join("runtime-settings.json"))
}

fn session_token_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let directory = app.path().app_data_dir().map_err(|error| error.to_string())?;
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    Ok(directory.join("session-token"))
}

#[tauri::command]
fn load_work_notes(app: AppHandle) -> Result<String, String> {
    let path = work_notes_path(&app)?;
    match fs::read_to_string(path) {
        Ok(notes) => Ok(notes),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok("[]".to_string()),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
fn save_work_notes(app: AppHandle, notes_json: String) -> Result<(), String> {
    let _: serde_json::Value = serde_json::from_str(&notes_json).map_err(|error| error.to_string())?;
    fs::write(work_notes_path(&app)?, notes_json).map_err(|error| error.to_string())
}

#[tauri::command]
fn load_runtime_settings(app: AppHandle) -> Result<String, String> {
    let path = runtime_settings_path(&app)?;
    match fs::read_to_string(path) {
        Ok(settings) => Ok(settings),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok("{\"mode\":\"local\"}".to_string()),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
fn save_runtime_settings(app: AppHandle, settings_json: String) -> Result<(), String> {
    let _: serde_json::Value = serde_json::from_str(&settings_json).map_err(|error| error.to_string())?;
    fs::write(runtime_settings_path(&app)?, settings_json).map_err(|error| error.to_string())
}

#[tauri::command]
fn load_session_token(app: AppHandle) -> Result<String, String> {
    match fs::read_to_string(session_token_path(&app)?) {
        Ok(token) => Ok(token),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(String::new()),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
fn save_session_token(app: AppHandle, token: String) -> Result<(), String> {
    let path = session_token_path(&app)?;
    fs::write(&path, token).map_err(|error| error.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o600)).map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![load_work_notes, save_work_notes, load_runtime_settings, save_runtime_settings, load_session_token, save_session_token])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

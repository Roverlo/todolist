use tauri::Manager;
use tauri_plugin_log::Builder as LogBuilder;

#[tauri::command]
fn frontend_log(level: String, message: String) {
  let lvl = match level.to_lowercase().as_str() {
    "trace" => log::Level::Trace,
    "debug" => log::Level::Debug,
    "warn" => log::Level::Warn,
    "error" => log::Level::Error,
    _ => log::Level::Info,
  };
  log::log!(lvl, "[frontend] {message}");
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(LogBuilder::default().level(log::LevelFilter::Info).build())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_notification::init())
    .setup(|app| {
      if let Some(window) = app.get_webview_window("main") {
        let _ = window.maximize();
        let _ = window.set_decorations(true);
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![frontend_log])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

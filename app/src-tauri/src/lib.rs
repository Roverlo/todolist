use tauri::Manager;
use tauri_plugin_log::Builder as LogBuilder;
use std::fs;
use std::path::PathBuf;

/// 获取统一的数据存储路径：用户文档目录下的 ProjectTodo/data.json
/// 所有版本的 EXE 都会读写这个位置，确保数据共享
fn get_unified_data_path() -> Option<PathBuf> {
    dirs::document_dir().map(|p| p.join("ProjectTodo").join("data.json"))
}

/// 获取旧版数据路径：EXE 同目录（用于向后兼容和数据迁移）
fn get_legacy_data_path() -> Option<PathBuf> {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.join("data.json")))
}

#[tauri::command]
fn load_data() -> Result<String, String> {
    // 1. 优先尝试读取统一目录（新版数据）
    if let Some(unified_path) = get_unified_data_path() {
        if unified_path.exists() {
            return fs::read_to_string(&unified_path).map_err(|e| e.to_string());
        }
    }
    
    // 2. 回退：尝试读取旧版 EXE 同目录数据（迁移老用户数据）
    if let Some(legacy_path) = get_legacy_data_path() {
        if legacy_path.exists() {
            let data = fs::read_to_string(&legacy_path).map_err(|e| e.to_string())?;
            
            // 自动迁移到新的统一位置
            if let Some(unified_path) = get_unified_data_path() {
                if let Some(parent) = unified_path.parent() {
                    let _ = fs::create_dir_all(parent);
                }
                let _ = fs::write(&unified_path, &data);
                log::info!("Migrated data from {:?} to {:?}", legacy_path, unified_path);
            }
            
            return Ok(data);
        }
    }
    
    // 3. 都不存在，返回空（新用户）
    Ok("".to_string())
}

#[tauri::command]
fn save_data(data: String) -> Result<(), String> {
    let path = get_unified_data_path().ok_or("Failed to determine data path")?;
    
    // 确保目录存在
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    
    fs::write(path, data).map_err(|e| e.to_string())
}

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
  // 动态查找 webview2 目录下的任意版本运行时
  // 这样可以兼容不同版本的 Fixed Version Runtime
  if let Ok(exe_path) = std::env::current_exe() {
    if let Some(exe_dir) = exe_path.parent() {
      let webview2_dir = exe_dir.join("webview2");
      if webview2_dir.exists() {
        // 查找 webview2 目录下第一个 Microsoft.WebView2.FixedVersionRuntime.* 文件夹
        if let Ok(entries) = std::fs::read_dir(&webview2_dir) {
          for entry in entries.flatten() {
            let name = entry.file_name();
            let name_str = name.to_string_lossy();
            if name_str.starts_with("Microsoft.WebView2.FixedVersionRuntime") {
              let runtime_path = entry.path();
              log::info!("Found WebView2 runtime: {:?}", runtime_path);
              std::env::set_var("WEBVIEW2_BROWSER_EXECUTABLE_FOLDER", &runtime_path);
              break;
            }
          }
        }
      }
    }
  }

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
    .invoke_handler(tauri::generate_handler![frontend_log, load_data, save_data])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

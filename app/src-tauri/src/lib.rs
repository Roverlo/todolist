use std::fs;
use std::path::PathBuf;
use std::net::TcpStream;
use std::io::{Read, Write};
use tauri::{Emitter, Manager};
use tauri_plugin_log::Builder as LogBuilder;
use ssh2::Session;

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

// ==================== SMB 同步 ====================

#[derive(serde::Serialize)]
struct SyncResult {
    success: bool,
    message: String,
    data: Option<String>,
}

#[tauri::command]
fn smb_test_connection(path: String, _username: String, _password: String) -> SyncResult {
    // Windows SMB 路径直接使用文件系统访问
    // 注意：Windows 会使用当前用户凭据或缓存的凭据
    let smb_path = PathBuf::from(&path);
    
    if smb_path.exists() {
        SyncResult {
            success: true,
            message: "SMB 路径可访问".to_string(),
            data: None,
        }
    } else {
        // 尝试创建目录
        match fs::create_dir_all(&smb_path) {
            Ok(_) => SyncResult {
                success: true,
                message: "SMB 路径已创建".to_string(),
                data: None,
            },
            Err(e) => SyncResult {
                success: false,
                message: format!("无法访问 SMB 路径: {}", e),
                data: None,
            },
        }
    }
}

#[tauri::command]
fn smb_upload(path: String, _username: String, _password: String, data: String) -> SyncResult {
    let smb_path = PathBuf::from(&path);
    
    // 确保目录存在
    if let Err(e) = fs::create_dir_all(&smb_path) {
        return SyncResult {
            success: false,
            message: format!("无法创建目录: {}", e),
            data: None,
        };
    }
    
    let file_path = smb_path.join("data.json");
    match fs::write(&file_path, &data) {
        Ok(_) => SyncResult {
            success: true,
            message: "数据已保存".to_string(),
            data: None,
        },
        Err(e) => SyncResult {
            success: false,
            message: format!("写入失败: {}", e),
            data: None,
        },
    }
}

#[tauri::command]
fn smb_download(path: String, _username: String, _password: String) -> SyncResult {
    let file_path = PathBuf::from(&path).join("data.json");
    
    match fs::read_to_string(&file_path) {
        Ok(content) => SyncResult {
            success: true,
            message: "数据已读取".to_string(),
            data: Some(content),
        },
        Err(e) => SyncResult {
            success: false,
            message: format!("读取失败: {}", e),
            data: None,
        },
    }
}

// ==================== SSH/SFTP 同步 ====================

#[tauri::command]
fn ssh_test_connection(host: String, port: u16, username: String, password: String) -> SyncResult {
    match TcpStream::connect(format!("{}:{}", host, port)) {
        Ok(tcp) => {
            let mut sess = Session::new().unwrap();
            sess.set_tcp_stream(tcp);
            
            if let Err(e) = sess.handshake() {
                return SyncResult {
                    success: false,
                    message: format!("SSH 握手失败: {}", e),
                    data: None,
                };
            }
            
            match sess.userauth_password(&username, &password) {
                Ok(_) => {
                    if sess.authenticated() {
                        SyncResult {
                            success: true,
                            message: "SSH 连接成功".to_string(),
                            data: None,
                        }
                    } else {
                        SyncResult {
                            success: false,
                            message: "认证失败".to_string(),
                            data: None,
                        }
                    }
                }
                Err(e) => SyncResult {
                    success: false,
                    message: format!("认证失败: {}", e),
                    data: None,
                },
            }
        }
        Err(e) => SyncResult {
            success: false,
            message: format!("无法连接服务器: {}", e),
            data: None,
        },
    }
}

#[tauri::command]
fn ssh_upload(host: String, port: u16, username: String, password: String, remote_path: String, data: String) -> SyncResult {
    let tcp = match TcpStream::connect(format!("{}:{}", host, port)) {
        Ok(t) => t,
        Err(e) => return SyncResult {
            success: false,
            message: format!("连接失败: {}", e),
            data: None,
        },
    };
    
    let mut sess = Session::new().unwrap();
    sess.set_tcp_stream(tcp);
    
    if let Err(e) = sess.handshake() {
        return SyncResult {
            success: false,
            message: format!("SSH 握手失败: {}", e),
            data: None,
        };
    }
    
    if let Err(e) = sess.userauth_password(&username, &password) {
        return SyncResult {
            success: false,
            message: format!("认证失败: {}", e),
            data: None,
        };
    }
    
    let sftp = match sess.sftp() {
        Ok(s) => s,
        Err(e) => return SyncResult {
            success: false,
            message: format!("SFTP 初始化失败: {}", e),
            data: None,
        },
    };
    
    // 创建目录（忽略已存在错误）
    let _ = sftp.mkdir(std::path::Path::new(&remote_path), 0o755);
    
    let file_path = format!("{}/data.json", remote_path.trim_end_matches('/'));
    let mut file = match sftp.create(std::path::Path::new(&file_path)) {
        Ok(f) => f,
        Err(e) => return SyncResult {
            success: false,
            message: format!("创建文件失败: {}", e),
            data: None,
        },
    };
    
    match file.write_all(data.as_bytes()) {
        Ok(_) => SyncResult {
            success: true,
            message: "数据已上传".to_string(),
            data: None,
        },
        Err(e) => SyncResult {
            success: false,
            message: format!("写入失败: {}", e),
            data: None,
        },
    }
}

#[tauri::command]
fn ssh_download(host: String, port: u16, username: String, password: String, remote_path: String) -> SyncResult {
    let tcp = match TcpStream::connect(format!("{}:{}", host, port)) {
        Ok(t) => t,
        Err(e) => return SyncResult {
            success: false,
            message: format!("连接失败: {}", e),
            data: None,
        },
    };
    
    let mut sess = Session::new().unwrap();
    sess.set_tcp_stream(tcp);
    
    if let Err(e) = sess.handshake() {
        return SyncResult {
            success: false,
            message: format!("SSH 握手失败: {}", e),
            data: None,
        };
    }
    
    if let Err(e) = sess.userauth_password(&username, &password) {
        return SyncResult {
            success: false,
            message: format!("认证失败: {}", e),
            data: None,
        };
    }
    
    let sftp = match sess.sftp() {
        Ok(s) => s,
        Err(e) => return SyncResult {
            success: false,
            message: format!("SFTP 初始化失败: {}", e),
            data: None,
        },
    };
    
    let file_path = format!("{}/data.json", remote_path.trim_end_matches('/'));
    let mut file = match sftp.open(std::path::Path::new(&file_path)) {
        Ok(f) => f,
        Err(e) => return SyncResult {
            success: false,
            message: format!("文件不存在或无法读取: {}", e),
            data: None,
        },
    };
    
    let mut content = String::new();
    match file.read_to_string(&mut content) {
        Ok(_) => SyncResult {
            success: true,
            message: "数据已下载".to_string(),
            data: Some(content),
        },
        Err(e) => SyncResult {
            success: false,
            message: format!("读取失败: {}", e),
            data: None,
        },
    }
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
        .plugin(tauri_plugin_process::init())
        .plugin(LogBuilder::default().level(log::LevelFilter::Info).build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            use tauri::image::Image;
            use tauri::menu::{MenuBuilder, MenuItemBuilder};
            use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};

            // 创建托盘菜单
            let show_item = MenuItemBuilder::with_id("show", "显示窗口").build(app)?;
            let quit_item = MenuItemBuilder::with_id("quit", "退出程序").build(app)?;
            let menu = MenuBuilder::new(app)
                .item(&show_item)
                .separator()
                .item(&quit_item)
                .build()?;

            // 加载托盘图标（使用 .ico 文件）
            let icon = Image::from_bytes(include_bytes!("../icons/icon.ico"))
                .expect("Failed to load tray icon");

            // 创建托盘图标
            let _tray = TrayIconBuilder::new()
                .icon(icon)
                .menu(&menu)
                .tooltip("ProjectTodo - 任务管理")
                .on_menu_event(|app_handle, event| match event.id().as_ref() {
                    "show" => {
                        if let Some(window) = app_handle.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "quit" => {
                        app_handle.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        if let Some(window) = tray.app_handle().get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            if let Some(window) = app.get_webview_window("main") {
                let _ = window.maximize();
                let _ = window.set_decorations(true);
                // 打开开发者工具用于调试
                #[cfg(debug_assertions)]
                let _ = window.open_devtools();
            }
            log::info!("Tauri app setup complete");
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                log::info!("[CloseHandler] CloseRequested event received!");
                // 阻止默认关闭行为
                api.prevent_close();
                // 发送事件到前端，让前端显示确认弹窗
                log::info!("[CloseHandler] Emitting close-requested event to frontend");
                match window.emit("close-requested", ()) {
                    Ok(_) => log::info!("[CloseHandler] Event emitted successfully"),
                    Err(e) => log::error!("[CloseHandler] Failed to emit event: {:?}", e),
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            frontend_log, load_data, save_data,
            smb_test_connection, smb_upload, smb_download,
            ssh_test_connection, ssh_upload, ssh_download
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

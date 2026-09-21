use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use tauri::ipc::{InvokeBody, Request, Response};

fn valid_id(id: &str) -> bool {
    let Some((hash, extension)) = id.split_once('.') else { return false; };
    hash.len() == 64 && hash.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
        && !extension.is_empty() && extension.len() <= 16
        && extension.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit())
}

fn root() -> Result<PathBuf, String> {
    let data = PathBuf::from(super::get_data_directory()?);
    let root = data.join("attachments");
    fs::create_dir_all(&root).map_err(|e| format!("无法创建附件目录：{e}"))?;
    let canonical = root.canonicalize().map_err(|e| e.to_string())?;
    if canonical.parent() != Some(data.canonicalize().map_err(|e| e.to_string())?.as_path()) {
        return Err("附件目录不能指向数据目录以外的位置".into());
    }
    Ok(root)
}

fn attachment_path(id: &str) -> Result<PathBuf, String> {
    if !valid_id(id) { return Err("附件标识无效".into()); }
    let path = root()?.join(id);
    if path.exists() && fs::symlink_metadata(&path).map_err(|e| e.to_string())?.file_type().is_symlink() {
        return Err("附件不能是符号链接".into());
    }
    Ok(path)
}

fn write_bytes(path: &Path, bytes: &[u8]) -> Result<(), String> {
    if path.exists() {
        if fs::read(path).map_err(|e| e.to_string())? != bytes {
            return Err("已有同名附件的内容不一致，已停止写入".into());
        }
        return Ok(());
    }
    let temporary = path.with_extension(format!("pending-{}-{}", std::process::id(), chrono::Utc::now().timestamp_nanos_opt().unwrap_or_default()));
    let mut file = fs::OpenOptions::new().write(true).create_new(true).open(&temporary).map_err(|e| e.to_string())?;
    let result = (|| {
        file.write_all(bytes).and_then(|_| file.sync_all()).map_err(|e| e.to_string())?;
        drop(file);
        fs::rename(&temporary, path).map_err(|e| e.to_string())
    })();
    if result.is_err() { let _ = fs::remove_file(&temporary); }
    result
}

#[cfg(windows)]
fn clipboard_paths() -> Result<Vec<PathBuf>, String> {
    #[link(name = "user32")]
    extern "system" {
        fn OpenClipboard(window: *mut std::ffi::c_void) -> i32;
        fn CloseClipboard() -> i32;
        fn GetClipboardData(format: u32) -> *mut std::ffi::c_void;
    }
    #[link(name = "shell32")]
    extern "system" {
        fn DragQueryFileW(drop: *mut std::ffi::c_void, index: u32, buffer: *mut u16, length: u32) -> u32;
    }
    unsafe {
        if OpenClipboard(std::ptr::null_mut()) == 0 { return Err("剪贴板正被占用，请重试粘贴".into()); }
        let drop = GetClipboardData(15); // CF_HDROP: Explorer's copied files, never text interpreted as paths.
        let mut paths = Vec::new();
        if !drop.is_null() {
            let count = DragQueryFileW(drop, u32::MAX, std::ptr::null_mut(), 0);
            for index in 0..count {
                let length = DragQueryFileW(drop, index, std::ptr::null_mut(), 0);
                let mut buffer = vec![0u16; length as usize + 1];
                DragQueryFileW(drop, index, buffer.as_mut_ptr(), length + 1);
                paths.push(PathBuf::from(String::from_utf16_lossy(&buffer[..length as usize])));
            }
        }
        CloseClipboard();
        Ok(paths)
    }
}

#[cfg(not(windows))]
fn clipboard_paths() -> Result<Vec<PathBuf>, String> { Ok(Vec::new()) }

#[tauri::command]
pub fn clipboard_file_names() -> Result<Vec<String>, String> {
    clipboard_paths()?.iter().map(|path| {
        if !path.is_file() { return Err("暂不支持粘贴文件夹，请先压缩成文件".into()); }
        Ok(path.file_name().unwrap_or_default().to_string_lossy().into_owned())
    }).collect()
}

#[tauri::command]
pub fn read_clipboard_file(index: usize, name: String) -> Result<Response, String> {
    let paths = clipboard_paths()?;
    let path = paths.get(index).ok_or("剪贴板已变化，请重新复制文件")?;
    if path.file_name().unwrap_or_default().to_string_lossy() != name { return Err("剪贴板已变化，请重新复制文件".into()); }
    fs::read(path).map(Response::new).map_err(|e| format!("无法读取剪贴板文件：{e}"))
}

#[tauri::command]
pub fn write_attachment(request: Request<'_>) -> Result<(), String> {
    let id = request.headers().get("x-attachment-id").and_then(|v| v.to_str().ok()).ok_or("缺少附件标识")?;
    let InvokeBody::Raw(bytes) = request.body() else { return Err("附件数据格式无效".into()); };
    write_bytes(&attachment_path(id)?, bytes).map_err(|e| format!("附件保存失败：{e}"))
}

fn read_bytes(id: &str) -> Result<Vec<u8>, String> {
    fs::read(attachment_path(id)?).map_err(|e| format!("附件不存在或无法读取，请从完整备份恢复：{e}"))
}

#[tauri::command]
pub fn read_attachment(id: String) -> Result<Response, String> {
    read_bytes(&id).map(Response::new)
}

#[tauri::command]
pub fn reveal_attachment(id: String) -> Result<(), String> {
    let path = attachment_path(&id)?;
    if !path.is_file() { return Err("附件不存在，请从完整备份恢复".into()); }
    std::process::Command::new("explorer").arg(format!("/select,{}", path.display()))
        .spawn().map(|_| ()).map_err(|e| format!("打开附件目录失败：{e}"))
}

pub fn image_response(request: &tauri::http::Request<Vec<u8>>) -> tauri::http::Response<Vec<u8>> {
    let id = request.uri().path().trim_start_matches('/');
    let bytes = read_bytes(id);
    let mime = match id.rsplit('.').next().unwrap_or("") {
        "png" => "image/png", "jpg" | "jpeg" => "image/jpeg", "gif" => "image/gif", "webp" => "image/webp",
        _ => "application/octet-stream",
    };
    tauri::http::Response::builder()
        .status(if bytes.is_ok() { 200 } else { 404 })
        .header("Content-Type", mime)
        .header("X-Content-Type-Options", "nosniff")
        .header("Content-Security-Policy", "default-src 'none'; sandbox")
        .body(bytes.unwrap_or_default()).unwrap()
}

fn copy_verified(source: &Path, destination: &Path) -> Result<(), String> {
    fs::create_dir_all(destination).map_err(|e| e.to_string())?;
    for entry in fs::read_dir(source).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let kind = entry.file_type().map_err(|e| e.to_string())?;
        if kind.is_symlink() { return Err("数据目录包含链接，无法安全完成迁移前备份".into()); }
        let target = destination.join(entry.file_name());
        if kind.is_dir() { copy_verified(&entry.path(), &target)?; }
        else {
            fs::copy(entry.path(), &target).map_err(|e| e.to_string())?;
            if fs::read(entry.path()).map_err(|e| e.to_string())? != fs::read(target).map_err(|e| e.to_string())? {
                return Err("迁移前备份校验失败".into());
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub fn backup_before_attachment_migration() -> Result<(), String> {
    let source = PathBuf::from(super::get_data_directory()?);
    let marker = source.join("attachment-migration-backup.txt");
    if marker.exists() { return Ok(()); }
    let backup = source.with_file_name(format!("{}-before-attachments-{}", source.file_name().unwrap_or_default().to_string_lossy(), chrono::Local::now().format("%Y%m%d-%H%M%S-%f")));
    copy_verified(&source, &backup).map_err(|e| format!("旧图片迁移前备份失败，已保留原数据：{e}"))?;
    let quote = |path: &Path| path.to_string_lossy().replace('\'', "''");
    fs::write(backup.join("RESTORE.ps1"), format!("# Close ProjectTodo before restoring.\nGet-ChildItem -LiteralPath '{}' -Exclude RESTORE.ps1 | Copy-Item -Destination '{}' -Recurse -Force\n", quote(&backup), quote(&source))).map_err(|e| e.to_string())?;
    fs::write(marker, backup.to_string_lossy().as_bytes()).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn identifiers_reject_paths_and_active_names() {
        assert!(valid_id(&format!("{}.pdf", "a".repeat(64))));
        for id in ["../data.json", "C:\\data", "x.png", "a/b.png", "con", "a.png:secret"] { assert!(!valid_id(id)); }
    }
    #[test]
    fn stored_files_are_complete_and_immutable() {
        let directory = std::env::temp_dir().join(format!("projecttodo-attachment-test-{}", chrono::Utc::now().timestamp_nanos_opt().unwrap()));
        fs::create_dir(&directory).unwrap();
        let path = directory.join("file.bin");
        let bytes = vec![42; 3 * 1024 * 1024];
        write_bytes(&path, &bytes).unwrap();
        write_bytes(&path, &bytes).unwrap();
        assert!(write_bytes(&path, b"changed").is_err());
        assert_eq!(fs::read(&path).unwrap(), bytes);
        fs::remove_file(path).unwrap();
        fs::remove_dir(directory).unwrap();
    }
}

//! Self-contained Windows portable updater. The helper is a copy of this EXE,
//! launched before Tauri/single-instance initialization with a fixed private plan.
use super::update_windows::{hash_file, replace, Parent};
use serde::{Deserialize, Serialize};
use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    time::{Duration, Instant},
};
use tauri::{ipc::Channel, State};
use tauri_plugin_http::reqwest::{self, Url};

const CURRENT: &str = env!("PROJECTTODO_BUILD_VERSION");
const MAX_SIZE: u64 = 512 * 1024 * 1024;
const RECEIPT: &str = "PROJECTTODO_UPDATE_RECEIPT";

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct Release {
    version: String,
    download_url: String,
    sha256: String,
    size: u64,
}
#[derive(Clone, Deserialize, Serialize)]
struct Plan {
    target: PathBuf,
    data: PathBuf,
    release: Release,
    old_hash: String,
    parent_pid: u32,
}
#[derive(Default)]
pub struct Updater {
    busy: AtomicBool,
    cancel: AtomicBool,
    ready: Mutex<Option<PathBuf>>,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Progress {
    phase: &'static str,
    received: u64,
    total: u64,
}

fn valid_version(version: &str) -> bool {
    version.len() == 13
        && version.as_bytes()[8] == b'_'
        && version
            .bytes()
            .enumerate()
            .all(|(i, c)| i == 8 || c.is_ascii_digit())
}
fn secure_url(url: &Url) -> bool {
    (url.scheme() == "https"
        || (url.scheme() == "http"
            && matches!(url.host_str(), Some("127.0.0.1" | "[::1]" | "localhost"))
            && std::env::var_os("PROJECTTODO_TEST_DATA_DIR").is_some()))
        && url.username().is_empty()
        && url.password().is_none()
        && url.fragment().is_none()
}
fn validate_release(release: &Release) -> Result<(), String> {
    if !valid_version(&release.version) || release.version.as_str() <= CURRENT {
        return Err("请选择比当前版本更新的版本".into());
    }
    if release.size < 512
        || release.size > MAX_SIZE
        || release.sha256.len() != 64
        || !release.sha256.bytes().all(|c| c.is_ascii_hexdigit())
    {
        return Err("此版本缺少有效的文件大小或 SHA-256 校验信息，请联系发布者补全清单".into());
    }
    Ok(())
}
fn verify_file(path: &Path, release: &Release) -> Result<(), String> {
    if fs::metadata(path).map_err(|_| "更新文件不存在")?.len() != release.size
        || !hash_file(path)?.eq_ignore_ascii_case(&release.sha256)
    {
        return Err("更新文件校验不通过，旧版未改动，请重新下载".into());
    }
    let mut file = File::open(path).map_err(|_| "无法读取更新文件")?;
    let mut head = [0u8; 64];
    file.read_exact(&mut head)
        .map_err(|_| "更新文件不是有效的 Windows 程序")?;
    if &head[..2] != b"MZ" {
        return Err("更新文件不是有效的 Windows 程序".into());
    }
    use std::io::{Seek, SeekFrom};
    let offset = u32::from_le_bytes(head[60..64].try_into().unwrap()) as u64;
    file.seek(SeekFrom::Start(offset))
        .map_err(|_| "更新文件无效")?;
    let mut pe = [0u8; 6];
    file.read_exact(&mut pe).map_err(|_| "更新文件无效")?;
    if &pe[..4] != b"PE\0\0" || pe[4..6] != [0x64, 0x86] {
        return Err("更新文件不是 Windows x64 程序".into());
    }
    Ok(())
}
fn write_synced(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let mut file = File::create(path).map_err(|_| "无法写入更新文件，请检查目录权限和磁盘空间")?;
    file.write_all(bytes)
        .and_then(|_| file.sync_all())
        .map_err(|_| "更新文件写入失败，请检查磁盘空间".into())
}
// Only this updater's known staging files are removed, never a recursive tree.
fn discard(stage: &Path) {
    for name in [
        "new.exe",
        "helper.exe",
        "plan.json",
        "helper-ready",
        "boot-ok",
        "result.txt",
    ] {
        let _ = fs::remove_file(stage.join(name));
    }
    let _ = fs::remove_dir(stage); // A previous.exe backup, or any unexpected file, keeps the directory.
}

#[tauri::command]
pub async fn prepare_portable_update(
    server_url: String,
    version: String,
    progress: Channel<Progress>,
    updater: State<'_, Updater>,
) -> Result<(), String> {
    if updater.busy.swap(true, Ordering::SeqCst) {
        return Err("已有更新正在处理".into());
    }
    updater.cancel.store(false, Ordering::SeqCst);
    let mut stage = None;
    let result = async {
        if updater
            .ready
            .lock()
            .map_err(|_| "更新状态不可用")?
            .is_some()
        {
            return Err("已有下载完成的更新，请先取消或安装".into());
        }
        let mut server = Url::parse(server_url.trim()).map_err(|_| "更新服务器地址无效")?;
        if !secure_url(&server) || server.query().is_some() {
            return Err("应用内更新需要 HTTPS 更新服务器".into());
        }
        server.set_path(&format!(
            "{}/versions.json",
            server.path().trim_end_matches('/')
        ));
        let client = reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(10))
            .read_timeout(Duration::from_secs(15))
            .timeout(Duration::from_secs(1800))
            .redirect(reqwest::redirect::Policy::custom(|attempt| {
                if attempt.previous().len() >= 5 || !secure_url(attempt.url()) {
                    attempt.error("不安全的更新重定向")
                } else {
                    attempt.follow()
                }
            }))
            .build()
            .map_err(|_| "无法初始化更新下载")?;
        let mut response = client
            .get(server.clone())
            .header("Cache-Control", "no-cache")
            .send()
            .await
            .map_err(|_| "无法读取更新清单，请检查网络后重试")?;
        if !response.status().is_success() {
            return Err(format!(
                "更新服务器返回 HTTP {}",
                response.status().as_u16()
            ));
        }
        let mut manifest = Vec::new();
        while let Some(chunk) = response.chunk().await.map_err(|_| "更新清单读取失败")? {
            if updater.cancel.load(Ordering::SeqCst) {
                return Err("更新下载已取消".into());
            }
            if manifest.len() + chunk.len() > 1024 * 1024 {
                return Err("更新清单过大".into());
            }
            manifest.extend_from_slice(&chunk);
        }
        let manifest: serde_json::Value =
            serde_json::from_slice(&manifest).map_err(|_| "更新清单格式不正确")?;
        let entries = manifest["versions"]
            .as_array()
            .ok_or("更新清单缺少版本列表")?;
        let matches: Vec<_> = entries
            .iter()
            .filter(|entry| entry["version"].as_str() == Some(&version))
            .collect();
        if matches.len() != 1 {
            return Err("此版本已从服务器移除或版本记录重复，请重新检查更新".into());
        }
        let mut release: Release = serde_json::from_value(matches[0].clone())
            .map_err(|_| "此版本缺少文件大小或 SHA-256 校验信息，无法自动更新")?;
        validate_release(&release)?;
        let download = server
            .join(&release.download_url)
            .map_err(|_| "更新下载地址无效")?;
        if !secure_url(&download) {
            return Err("更新文件必须通过 HTTPS 下载".into());
        }
        release.download_url = download.to_string();
        let target = fs::canonicalize(std::env::current_exe().map_err(|_| "无法定位当前程序")?)
            .map_err(|_| "无法定位当前程序")?;
        if fs::metadata(&target)
            .map_err(|_| "无法读取当前程序")?
            .permissions()
            .readonly()
        {
            return Err("当前 EXE 为只读文件，请先移到可写目录后重试".into());
        }
        let folder = target.parent().ok_or("当前程序目录无效")?.join(format!(
            ".projecttodo-update-{}",
            super::downloads::random_hex(16)?
        ));
        fs::create_dir(&folder).map_err(|_| "程序目录不可写，请将 EXE 移到自己的可写目录后重试")?;
        stage = Some(folder.clone());
        let mut response = client
            .get(download)
            .send()
            .await
            .map_err(|_| "更新下载失败，请检查网络后重试")?;
        if !response.status().is_success() {
            return Err(format!("更新下载返回 HTTP {}", response.status().as_u16()));
        }
        if response
            .content_length()
            .is_some_and(|size| size != release.size)
        {
            return Err("服务器文件大小与清单不符，已停止更新".into());
        }
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(folder.join("new.exe"))
            .map_err(|_| "无法创建更新文件")?;
        let mut received = 0;
        let mut last_progress = Instant::now() - Duration::from_secs(1);
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|_| "下载中断，请重试；旧版未改动")?
        {
            if updater.cancel.load(Ordering::SeqCst) {
                return Err("更新下载已取消".into());
            }
            received += chunk.len() as u64;
            if received > release.size {
                return Err("更新文件超出声明大小，已停止下载".into());
            }
            file.write_all(&chunk)
                .map_err(|_| "更新下载写入失败，请检查磁盘空间")?;
            if last_progress.elapsed() >= Duration::from_millis(150) {
                let _ = progress.send(Progress {
                    phase: "downloading",
                    received,
                    total: release.size,
                });
                last_progress = Instant::now();
            }
        }
        file.sync_all().map_err(|_| "更新文件写入失败")?;
        drop(file);
        let _ = progress.send(Progress {
            phase: "verifying",
            received,
            total: release.size,
        });
        verify_file(&folder.join("new.exe"), &release)?;
        let plan = Plan {
            old_hash: hash_file(&target)?,
            target,
            data: PathBuf::from(super::get_data_directory()?),
            release,
            parent_pid: std::process::id(),
        };
        write_synced(
            &folder.join("plan.json"),
            &serde_json::to_vec(&plan).map_err(|_| "无法保存更新计划")?,
        )?;
        if updater.cancel.load(Ordering::SeqCst) {
            return Err("更新下载已取消".into());
        }
        *updater.ready.lock().map_err(|_| "更新状态不可用")? = Some(folder);
        Ok(())
    }
    .await;
    updater.busy.store(false, Ordering::SeqCst);
    let result = if updater.cancel.load(Ordering::SeqCst) {
        if let Ok(mut ready) = updater.ready.lock() {
            *ready = None;
        }
        Err("更新下载已取消".into())
    } else {
        result
    };
    if result.is_err() {
        if let Some(folder) = stage {
            discard(&folder);
        }
    }
    result
}

#[tauri::command]
pub fn cancel_portable_update(updater: State<'_, Updater>) {
    updater.cancel.store(true, Ordering::SeqCst);
    if !updater.busy.load(Ordering::SeqCst) {
        if let Ok(mut ready) = updater.ready.lock() {
            if let Some(folder) = ready.take() {
                discard(&folder);
            }
        }
    }
}

fn read_plan(stage: &Path, target: &Path) -> Result<Plan, String> {
    let name = stage
        .file_name()
        .and_then(|s| s.to_str())
        .ok_or("更新目录无效")?;
    let token = name
        .strip_prefix(".projecttodo-update-")
        .ok_or("更新目录无效")?;
    if token.len() != 32
        || !token.bytes().all(|c| c.is_ascii_hexdigit())
        || stage.parent() != target.parent()
    {
        return Err("更新目录与程序不匹配".into());
    }
    let plan: Plan =
        serde_json::from_slice(&fs::read(stage.join("plan.json")).map_err(|_| "更新计划不可读")?)
            .map_err(|_| "更新计划无效")?;
    if plan.target != target
        || plan
            .target
            .extension()
            .and_then(|s| s.to_str())
            .map_or(true, |s| !s.eq_ignore_ascii_case("exe"))
    {
        return Err("更新目标与当前程序不匹配".into());
    }
    Ok(plan)
}

#[tauri::command]
pub async fn install_portable_update(
    app: tauri::AppHandle,
    updater: State<'_, Updater>,
) -> Result<(), String> {
    if updater.busy.swap(true, Ordering::SeqCst) {
        return Err("已有更新正在处理".into());
    }
    let result = (|| {
        let folder = updater
            .ready
            .lock()
            .map_err(|_| "更新状态不可用")?
            .clone()
            .ok_or("请先下载更新")?;
        let target = fs::canonicalize(std::env::current_exe().map_err(|_| "无法定位当前程序")?)
            .map_err(|_| "无法定位当前程序")?;
        let plan = read_plan(&folder, &target)?;
        verify_file(&folder.join("new.exe"), &plan.release)?;
        if hash_file(&target)? != plan.old_hash {
            return Err("当前程序文件已变化，请重新下载更新".into());
        }
        fs::copy(&target, folder.join("helper.exe"))
            .map_err(|_| "无法准备更新助手，请检查目录权限或安全软件")?;
        if hash_file(&folder.join("helper.exe"))? != plan.old_hash {
            return Err("更新助手校验失败".into());
        }
        let _ = fs::remove_file(folder.join("helper-ready"));
        let mut helper = Command::new(folder.join("helper.exe"))
            .arg("--apply-portable-update")
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|_| "更新助手无法启动，旧版仍在运行，请检查安全软件或程序目录权限")?;
        let deadline = Instant::now() + Duration::from_secs(10);
        while !folder.join("helper-ready").is_file() {
            if helper
                .try_wait()
                .map_err(|_| "无法确认更新助手状态")?
                .is_some()
            {
                return Err("更新助手未就绪，旧版未退出".into());
            }
            if Instant::now() >= deadline {
                let _ = helper.kill();
                let _ = helper.wait();
                return Err("更新助手启动超时，旧版未退出".into());
            }
            std::thread::sleep(Duration::from_millis(100));
        }
        app.exit(0); // RunEvent::Exit flushes and pauses aria2 before the helper replaces us.
        Ok(())
    })();
    updater.busy.store(false, Ordering::SeqCst);
    result
}

fn restart(plan: &Plan, stage: &Path) -> Result<std::process::Child, String> {
    Command::new(&plan.target)
        .current_dir(plan.target.parent().ok_or("程序目录无效")?)
        .env(RECEIPT, stage)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|_| "新版无法启动".into())
}
fn backup_data(data: &Path) -> Result<PathBuf, String> {
    let backup = data.with_file_name(format!(
        "{}-before-update-{}",
        data.file_name().unwrap_or_default().to_string_lossy(),
        chrono::Local::now().format("%Y%m%d-%H%M%S-%f")
    ));
    if backup.exists() {
        return Err("更新前备份目录已存在".into());
    }
    super::attachments::copy_verified(data, &backup)
        .map_err(|_| "更新前数据备份失败，已停止替换程序")?;
    let quote = |path: &Path| path.to_string_lossy().replace('\'', "''");
    write_synced(&backup.join("RESTORE.ps1"), format!("\u{feff}# Close ProjectTodo before restoring.\nGet-ChildItem -LiteralPath '{}' -Force -Exclude RESTORE.ps1 | Copy-Item -Destination '{}' -Recurse -Force\n", quote(&backup), quote(data)).as_bytes())?;
    Ok(backup)
}
fn apply(stage: &Path, plan: &Plan) -> Result<(), String> {
    verify_file(&stage.join("new.exe"), &plan.release)?;
    if hash_file(&plan.target)? != plan.old_hash {
        return Err("当前程序已变化，未执行替换".into());
    }
    let backup = backup_data(&plan.data)?;
    write_synced(
        &stage.join("data-backup.txt"),
        backup.to_string_lossy().as_bytes(),
    )?;
    fs::copy(&plan.target, stage.join("previous.exe"))
        .map_err(|_| "旧版程序备份失败，更新未执行")?;
    if hash_file(&stage.join("previous.exe"))? != plan.old_hash {
        return Err("旧版程序备份校验失败".into());
    }
    OpenOptions::new()
        .write(true)
        .open(stage.join("previous.exe"))
        .and_then(|file| file.sync_all())
        .map_err(|_| "旧版备份刷盘失败")?;
    // Windows or a launcher may retain the old image mapping after process exit.
    replace_program(
        &stage.join("new.exe"),
        &plan.target,
        &stage.join("retired.exe"),
    )?;
    let launch = (|| {
        let mut child = restart(plan, stage)?;
        let deadline = Instant::now() + Duration::from_secs(60);
        loop {
            if stage.join("boot-ok").is_file() {
                return Ok(());
            }
            if child
                .try_wait()
                .map_err(|_| "无法确认新版启动状态")?
                .is_some()
            {
                return Err("新版启动后提前退出".to_string());
            }
            if Instant::now() >= deadline {
                child
                    .kill()
                    .map_err(|_| "新版启动超时且无法退出，已保留旧版备份，请关闭程序后手动恢复")?;
                child.wait().map_err(|_| "无法确认新版已经退出")?;
                return Err("新版启动超时".into());
            }
            std::thread::sleep(Duration::from_millis(100));
        }
    })();
    if let Err(error) = launch {
        // Preserve the verified backup even when rollback itself is blocked.
        fs::copy(stage.join("previous.exe"), stage.join("rollback.exe"))
            .map_err(|_| "无法准备回退，请使用保留的 previous.exe")?;
        replace_program(
            &stage.join("rollback.exe"),
            &plan.target,
            &stage.join("failed.exe"),
        )
        .map_err(|_| "无法恢复旧版，请关闭程序后用 previous.exe 手动恢复")?;
        return Err(format!("{error}，已恢复旧版程序。升级前数据备份已保留"));
    }
    Ok(())
}

pub fn run_helper() -> bool {
    if std::env::args_os().nth(1).as_deref()
        != Some(std::ffi::OsStr::new("--apply-portable-update"))
    {
        return false;
    }
    let run = || -> Result<(), String> {
        let executable = fs::canonicalize(std::env::current_exe().map_err(|_| "无法定位更新助手")?)
            .map_err(|_| "更新目录无效")?;
        let stage = executable.parent().ok_or("更新目录无效")?;
        let raw: Plan =
            serde_json::from_slice(&fs::read(stage.join("plan.json")).map_err(|_| "无更新计划")?)
                .map_err(|_| "更新计划无效")?;
        let plan = read_plan(stage, &raw.target)?;
        if hash_file(&executable)? != plan.old_hash {
            return Err("更新助手与旧版本不一致".into());
        }
        let parent = Parent::open(plan.parent_pid)?; // Hold a handle before old process exits; no PID reuse race.
        write_synced(&stage.join("helper-ready"), b"ready")?;
        parent.wait()?;
        drop(parent);
        match apply(stage, &plan) {
            Ok(()) => {
                let _ = write_synced(&stage.join("result.txt"), "更新完成".as_bytes());
            }
            Err(error) => {
                let _ = write_synced(&stage.join("result.txt"), error.as_bytes());
                let _ = restart(&plan, stage);
            }
        }
        Ok(())
    };
    let _ = run();
    true
}

fn replace_program(candidate: &Path, target: &Path, retired: &Path) -> Result<(), String> {
    if retired.exists() {
        return Err("更新暂存名称冲突，未替换程序".into());
    }
    replace(target, retired)?;
    if let Err(error) = replace(candidate, target) {
        replace(retired, target)
            .map_err(|_| "无法恢复原程序路径，请关闭程序后用 previous.exe 手动恢复")?;
        return Err(error);
    }
    Ok(())
}

#[tauri::command]
pub fn portable_update_ready() -> Result<Option<String>, String> {
    let Some(folder) = std::env::var_os(RECEIPT) else {
        return Ok(None);
    };
    let stage = PathBuf::from(folder);
    let target = fs::canonicalize(std::env::current_exe().map_err(|_| "无法定位程序")?)
        .map_err(|_| "无法定位程序")?;
    let plan = read_plan(&stage, &target)?;
    if let Ok(message) = fs::read_to_string(stage.join("result.txt")) {
        std::env::remove_var(RECEIPT);
        return Ok(Some(message));
    }
    if plan.release.version != CURRENT {
        return Err("启动版本与更新清单不一致".into());
    }
    let saved: serde_json::Value = serde_json::from_slice(
        &fs::read(plan.data.join("data.json")).map_err(|_| "更新后数据不可读")?,
    )
    .map_err(|_| "更新后数据格式无效")?;
    if !saved["state"].is_object() {
        return Err("更新后数据尚未就绪".into());
    }
    verify_file(&target, &plan.release)?;
    write_synced(&stage.join("boot-ok"), b"ready")?;
    std::env::remove_var(RECEIPT);
    Ok(Some(format!("已更新至 {CURRENT}")))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::os::windows::fs::OpenOptionsExt;

    #[test]
    fn portable_update_integrity_backup_and_locked_target() {
        let root = std::env::current_dir()
            .unwrap()
            .join("target")
            .join(format!(
                "update-test-{}",
                super::super::downloads::random_hex(8).unwrap()
            ));
        fs::create_dir_all(&root).unwrap();
        let file = root.join("中文 旧程序.exe");
        fs::write(&file, b"abc").unwrap();
        assert_eq!(
            hash_file(&file).unwrap(),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
        let new = root.join("new.exe");
        let mut pe = vec![0; 512];
        pe[..2].copy_from_slice(b"MZ");
        pe[60..64].copy_from_slice(&64u32.to_le_bytes());
        pe[64..70].copy_from_slice(b"PE\0\0\x64\x86");
        fs::write(&new, &pe).unwrap();
        let mut release = Release {
            version: "20990101_1200".into(),
            download_url: "https://example.invalid/new.exe".into(),
            size: 512,
            sha256: hash_file(&new).unwrap(),
        };
        validate_release(&release).unwrap();
        verify_file(&new, &release).unwrap();
        pe[500] = 1;
        fs::write(&new, &pe).unwrap();
        assert!(verify_file(&new, &release).is_err());
        release.size = 513;
        assert!(verify_file(&new, &release).is_err());
        release.size = MAX_SIZE + 1;
        assert!(validate_release(&release).is_err());
        release.version = CURRENT.into();
        assert!(validate_release(&release).is_err());
        assert!(!secure_url(
            &Url::parse("https://user:secret@example.invalid/new.exe").unwrap()
        ));
        assert!(!secure_url(
            &Url::parse("http://example.invalid/new.exe").unwrap()
        ));
        let lock = OpenOptions::new()
            .read(true)
            .share_mode(1)
            .open(&file)
            .unwrap();
        assert!(replace(&new, &file).is_err());
        assert_eq!(fs::read(&file).unwrap(), b"abc");
        assert!(new.exists());
        drop(lock);
        replace(&new, &file).unwrap();
        assert_eq!(fs::read(&file).unwrap(), pe);
        let data = root.join("模拟数据");
        fs::create_dir(&data).unwrap();
        fs::write(data.join("data.json"), br#"{"state":{"notes":[]}}"#).unwrap();
        let backup = backup_data(&data).unwrap();
        assert_eq!(
            hash_file(&data.join("data.json")).unwrap(),
            hash_file(&backup.join("data.json")).unwrap()
        );
        assert!(backup.join("RESTORE.ps1").is_file());
        assert!(fs::read(backup.join("RESTORE.ps1"))
            .unwrap()
            .starts_with(&[0xef, 0xbb, 0xbf]));
        let missing = root.join("missing.exe");
        assert!(replace_program(&missing, &file, &root.join("retired.exe")).is_err());
        assert_eq!(fs::read(&file).unwrap(), pe);
        assert!(read_plan(&root.join("../outside"), &file).is_err());
        // All files were generated inside this test's unique target directory.
        fs::remove_dir_all(root).unwrap();
    }
}

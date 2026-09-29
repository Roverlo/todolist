//! One worker owns the engine and its journal. Note persistence never sees progress updates.
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{fs, io::Write, net::TcpListener, path::{Path, PathBuf}, process::{Child, Command, Stdio}, sync::mpsc, time::Duration};
use tauri_plugin_http::reqwest;
use tauri_plugin_notification::NotificationExt;

const ENGINE: &[u8] = include_bytes!("../vendor/aria2/aria2c.exe");
const ENGINE_VERSION: &str = "1.37.0-motrix.16";

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    directory: String,
    concurrent: u8,
    limit_kib: u32,
    notify: bool,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    id: String,
    url: String,
    name: String,
    directory: String,
    status: String,
    total: u64,
    completed: u64,
    #[serde(default, skip_deserializing)]
    speed: u64,
    error: String,
    created_at: i64,
    finished_at: Option<i64>,
}

#[derive(Clone, Serialize, Deserialize)]
struct Journal { version: u8, settings: Settings, tasks: Vec<Task> }

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    settings: Settings,
    tasks: Vec<Task>,
    engine_version: &'static str,
    error: Option<String>,
}

#[derive(Deserialize)]
#[serde(tag = "action", rename_all = "camelCase")]
pub enum Request {
    List,
    Add { url: String, name: String, directory: String },
    Pause { id: String },
    Resume { id: String },
    Remove { id: String },
    Settings { settings: Settings },
    Reveal { id: String },
}

enum Message {
    Request(Request, mpsc::Sender<Result<Snapshot, String>>),
    Stop(mpsc::Sender<()>),
}
pub struct Service(mpsc::Sender<Message>);

impl Service {
    pub fn start(app: tauri::AppHandle) -> Self {
        let (tx, rx) = mpsc::channel();
        std::thread::spawn(move || {
            let mut manager = ManagerState::load();
            if let Ok(state) = &mut manager {
                if state.journal.tasks.iter().any(|t| matches!(t.status.as_str(), "active" | "waiting")) {
                    if let Err(error) = state.start_engine() {
                        for task in &mut state.journal.tasks {
                            if matches!(task.status.as_str(), "active" | "waiting") { task.status = "error".into(); task.error = error.clone(); }
                        }
                        state.error = Some(error);
                        let _ = state.persist();
                    }
                }
            }
            loop {
                match rx.recv_timeout(Duration::from_secs(1)) {
                    Ok(Message::Stop(done)) => {
                        if let Ok(state) = &mut manager { state.stop(); }
                        let _ = done.send(());
                        break;
                    }
                    Ok(Message::Request(request, reply)) => {
                        let result = match &mut manager {
                            Ok(state) => state.request(request).map(|()| state.snapshot()),
                            Err(error) => Err(error.clone()),
                        };
                        let _ = reply.send(result);
                    }
                    Err(mpsc::RecvTimeoutError::Disconnected) => break,
                    Err(mpsc::RecvTimeoutError::Timeout) => {}
                }
                if let Ok(state) = &mut manager {
                    if let Err(error) = state.refresh(&app) { state.error = Some(error); }
                }
            }
        });
        Self(tx)
    }

    pub fn stop(&self) {
        let (tx, rx) = mpsc::channel();
        if self.0.send(Message::Stop(tx)).is_ok() { let _ = rx.recv_timeout(Duration::from_secs(6)); }
    }
}

#[tauri::command]
pub async fn downloads_request(service: tauri::State<'_, Service>, request: Request) -> Result<Snapshot, String> {
    let (tx, rx) = mpsc::channel();
    service.0.send(Message::Request(request, tx)).map_err(|_| "下载服务已退出")?;
    tauri::async_runtime::spawn_blocking(move || rx.recv_timeout(Duration::from_secs(30)).map_err(|_| "下载服务响应超时，请稍后重试".to_string())?)
        .await.map_err(|_| "下载服务响应失败".to_string())?
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadInfo { name: Option<String>, total: Option<u64>, from_server: bool }

#[tauri::command]
pub async fn downloads_inspect(url: String) -> Result<DownloadInfo, String> {
    let url = url.trim();
    validate_url(url)?;
    let client = reqwest::Client::builder().timeout(Duration::from_secs(15))
        .redirect(reqwest::redirect::Policy::limited(8)).build().map_err(|_| "无法初始化链接识别")?;
    let mut response = client.head(url).send().await.map_err(|_| "暂时无法识别链接，可填写文件名后直接下载")?;
    if matches!(response.status().as_u16(), 405 | 501) {
        response = client.get(url).header("Range", "bytes=0-0").send().await.map_err(|_| "暂时无法识别链接，可填写文件名后直接下载")?;
    }
    if !response.status().is_success() { return Err(format!("链接识别返回 HTTP {}，请检查链接是否有效", response.status().as_u16())); }
    let name = response.headers().get("content-disposition").and_then(|v| v.to_str().ok()).and_then(disposition_name);
    let total = response.headers().get("content-range").and_then(|v| v.to_str().ok())
        .and_then(|v| v.rsplit('/').next()).and_then(|v| v.parse().ok())
        .or_else(|| response.headers().get("content-length").and_then(|v| v.to_str().ok()).and_then(|v| v.parse().ok()));
    let from_server = name.is_some();
    Ok(DownloadInfo { name, total, from_server })
}

fn decode_percent(value: &str) -> Option<String> {
    let mut bytes = Vec::new();
    let input = value.as_bytes();
    let mut index = 0;
    while index < input.len() {
        if input[index] == b'%' {
            let hex = std::str::from_utf8(input.get(index + 1..index + 3)?).ok()?;
            bytes.push(u8::from_str_radix(hex, 16).ok()?); index += 3;
        } else { bytes.push(input[index]); index += 1; }
    }
    String::from_utf8(bytes).ok()
}

fn disposition_name(header: &str) -> Option<String> {
    let parts: Vec<&str> = header.split(';').map(str::trim).collect();
    let extended = parts.iter().find_map(|part| {
        let (key, value) = part.split_once('=')?;
        if !key.eq_ignore_ascii_case("filename*") { return None; }
        let (charset, rest) = value.split_once('\'')?;
        if !charset.eq_ignore_ascii_case("UTF-8") { return None; }
        decode_percent(rest.split_once('\'')?.1)
    });
    let plain = parts.iter().find_map(|part| {
        let (key, value) = part.split_once('=')?;
        if !key.eq_ignore_ascii_case("filename") { return None; }
        let value = value.trim_matches('"');
        Some(decode_percent(value).unwrap_or_else(|| value.to_string()))
    });
    let name = extended.or(plain)?;
    validate_name(&name).ok()?;
    Some(name)
}

struct Engine { child: Child, client: reqwest::Client, endpoint: String, secret: String }
impl Engine {
    fn rpc(&self, method: &str, args: Vec<Value>) -> Result<Value, String> {
        let mut params = vec![json!(format!("token:{}", self.secret))];
        params.extend(args);
        tauri::async_runtime::block_on(async {
            let response = self.client.post(&self.endpoint).header("Content-Type", "application/json")
                .body(json!({"jsonrpc":"2.0", "id":"projecttodo", "method":format!("aria2.{method}"), "params":params}).to_string())
                .send().await.map_err(|_| "无法连接下载引擎，请重试".to_string())?;
            let bytes = response.bytes().await.map_err(|_| "下载引擎响应异常".to_string())?;
            let result: Value = serde_json::from_slice(&bytes).map_err(|_| "下载引擎响应异常".to_string())?;
            if result.get("error").is_some() { return Err("下载引擎未能执行操作，请刷新后重试".to_string()); }
            result.get("result").cloned().ok_or_else(|| "下载引擎返回空结果".to_string())
        })
    }
}
impl Drop for Engine {
    fn drop(&mut self) { let _ = self.child.kill(); let _ = self.child.wait(); }
}

struct ManagerState { root: PathBuf, journal: Journal, engine: Option<Engine>, error: Option<String>, dirty: bool, pending_notifications: Vec<String> }
impl ManagerState {
    fn load() -> Result<Self, String> {
        let root = PathBuf::from(super::get_data_directory()?).join("downloads");
        let path = root.join("history.json");
        let journal = match fs::read(&path) {
            Ok(bytes) => serde_json::from_slice::<Journal>(&bytes).map_err(|_| "下载记录损坏，已保留原文件。请从备份恢复 downloads/history.json".to_string())?,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                let directory = if std::env::var_os("PROJECTTODO_TEST_DATA_DIR").is_some() { root.join("files") }
                    else { dirs::download_dir().unwrap_or(root.clone()).join("ProjectTodo") };
                Journal { version: 1, settings: Settings { directory: directory.to_string_lossy().into(), concurrent: 3, limit_kib: 0, notify: true }, tasks: vec![] }
            }
            Err(_) => return Err("下载记录无法读取，未修改原文件".into()),
        };
        if journal.version != 1 { return Err("下载记录来自更新的版本，请更新软件".into()); }
        validate_settings(&journal.settings)?;
        for task in &journal.tasks { validate_url(&task.url)?; validate_name(&task.name)?; validate_directory(&task.directory)?; }
        Ok(Self { root, journal, engine: None, error: None, dirty: false, pending_notifications: vec![] })
    }

    fn persist(&mut self) -> Result<(), String> {
        self.dirty = true;
        save_journal(&self.root, &self.journal)?;
        self.dirty = false;
        Ok(())
    }
    fn snapshot(&self) -> Snapshot {
        Snapshot { settings: self.journal.settings.clone(), tasks: self.journal.tasks.clone(), engine_version: ENGINE_VERSION, error: self.error.clone() }
    }
    fn start_engine(&mut self) -> Result<(), String> {
        if self.engine.is_some() { return Ok(()); }
        let folder = self.root.join(format!("engine-{ENGINE_VERSION}"));
        fs::create_dir_all(&folder).map_err(|_| "无法创建下载引擎目录")?;
        let binary = folder.join("aria2c.exe");
        if fs::read(&binary).ok().as_deref() != Some(ENGINE) {
            let temp = folder.join("aria2c.new");
            fs::write(&temp, ENGINE).and_then(|_| fs::rename(&temp, &binary)).map_err(|_| "无法准备下载引擎，请检查目录权限或安全软件")?;
        }
        fs::write(folder.join("COPYING.txt"), include_bytes!("../licenses/aria2-COPYING.txt"))
            .and_then(|_| fs::write(folder.join("NOTICE.txt"), include_bytes!("../licenses/aria2-NOTICE.txt")))
            .map_err(|_| "无法写入下载引擎许可说明")?;
        // The port is private and every RPC request additionally requires an OS-generated secret.
        let listener = TcpListener::bind("127.0.0.1:0").map_err(|_| "无法分配下载引擎端口")?;
        let port = listener.local_addr().map_err(|_| "无法读取下载引擎端口")?.port();
        let secret = random_hex(32)?;
        let client = reqwest::Client::builder().no_proxy().timeout(Duration::from_secs(2)).build().map_err(|_| "无法初始化下载服务")?;
        let mut command = Command::new(&binary);
        command.args(["--no-conf=true", "--no-netrc=true", "--enable-rpc=true", "--rpc-listen-all=false", "--rpc-allow-origin-all=false", "--quiet=true", "--console-log-level=error", "--auto-save-interval=1", "--allow-overwrite=false", "--auto-file-renaming=false", "--continue=true", "--file-allocation=none", "--enable-dht=false", "--enable-dht6=false", "--enable-peer-exchange=false", "--follow-torrent=false", "--follow-metalink=false", "--check-certificate=true", "--split=4", "--max-connection-per-server=4", "--max-tries=3", "--retry-wait=2", "--connect-timeout=15", "--timeout=30", "--max-download-result=10000"])
            .arg(format!("--rpc-listen-port={port}")).arg(format!("--rpc-secret={secret}"))
            .arg(format!("--stop-with-process={}", std::process::id()))
            .arg(format!("--max-concurrent-downloads={}", self.journal.settings.concurrent))
            .arg(format!("--max-overall-download-limit={}K", self.journal.settings.limit_kib))
            .stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
        #[cfg(windows)] { use std::os::windows::process::CommandExt; command.creation_flags(0x08000000); }
        drop(listener);
        let child = command.spawn().map_err(|_| "下载引擎无法启动，请检查安全软件是否拦截")?;
        let engine = Engine { child, client, endpoint: format!("http://127.0.0.1:{port}/jsonrpc"), secret };
        let mut ready = false;
        for _ in 0..15 {
            if engine.rpc("getVersion", vec![]).is_ok() { ready = true; break; }
            std::thread::sleep(Duration::from_millis(100));
        }
        if !ready { return Err("下载引擎启动失败，请检查安全软件或端口占用".into()); }
        self.engine = Some(engine);
        for index in 0..self.journal.tasks.len() {
            if matches!(self.journal.tasks[index].status.as_str(), "active" | "waiting" | "paused") {
                let paused = self.journal.tasks[index].status == "paused";
                if let Err(error) = self.enqueue(index, paused) {
                    self.journal.tasks[index].status = "error".into();
                    self.journal.tasks[index].error = error;
                }
            }
        }
        self.persist()?;
        self.error = None;
        Ok(())
    }
    fn rpc(&self, method: &str, args: Vec<Value>) -> Result<Value, String> {
        self.engine.as_ref().ok_or_else(|| "下载引擎未启动".to_string())?.rpc(method, args)
    }
    fn enqueue(&self, index: usize, paused: bool) -> Result<(), String> {
        let task = &self.journal.tasks[index];
        let path = Path::new(&task.directory).join(&task.name);
        // Never assume an existing ordinary file belongs to a recoverable download.
        if path.exists() && !PathBuf::from(format!("{}.aria2", path.display())).is_file() {
            return Err("目标文件已存在且没有续传记录，请更换文件名新建下载".into());
        }
        self.rpc("addUri", vec![json!([task.url]), json!({"gid": task.id, "dir": task.directory, "out": task.name, "pause": if paused {"true"} else {"false"}})])?;
        Ok(())
    }

    fn request(&mut self, request: Request) -> Result<(), String> {
        match request {
            Request::List => {},
            Request::Add { url, name, directory } => {
                let url = url.trim().to_string();
                let name = name.trim().to_string();
                validate_url(&url)?; validate_name(&name)?; validate_directory(&directory)?;
                fs::create_dir_all(&directory).map_err(|_| "保存目录不可写或磁盘不可用")?;
                let directory = fs::canonicalize(directory).map_err(|_| "保存目录不可用")?.to_string_lossy().into_owned();
                let path = Path::new(&directory).join(&name);
                if path.exists() || PathBuf::from(format!("{}.aria2", path.display())).exists()
                    || self.journal.tasks.iter().any(|t| t.directory.eq_ignore_ascii_case(&directory) && t.name.eq_ignore_ascii_case(&name)) {
                    return Err("此目录中已有同名文件或下载记录，请更换文件名".into());
                }
                self.start_engine()?;
                let task = Task { id: random_hex(8)?, url, name, directory, status: "waiting".into(), total: 0, completed: 0, speed: 0, error: String::new(), created_at: chrono::Utc::now().timestamp_millis(), finished_at: None };
                self.journal.tasks.push(task);
                if let Err(error) = self.persist() { self.journal.tasks.pop(); return Err(error); }
                let index = self.journal.tasks.len() - 1;
                if let Err(error) = self.enqueue(index, false) {
                    self.journal.tasks[index].status = "error".into();
                    self.journal.tasks[index].error = error.clone();
                    self.persist()?;
                    return Err(error);
                }
            }
            Request::Pause { id } => {
                let index = self.index(&id)?;
                if !matches!(self.journal.tasks[index].status.as_str(), "active" | "waiting") { return Ok(()); }
                if self.engine.is_some() { self.rpc("forcePause", vec![json!(id)])?; }
                self.journal.tasks[index].status = "paused".into();
                self.journal.tasks[index].speed = 0;
                self.persist()?;
            }
            Request::Resume { id } => {
                let index = self.index(&id)?;
                if self.journal.tasks[index].status == "complete" { return Err("此文件已下载完成".into()); }
                self.start_engine()?;
                if self.journal.tasks[index].status == "paused" {
                    self.rpc("unpause", vec![json!(id)])?;
                } else if self.journal.tasks[index].status == "error" {
                    let _ = self.rpc("removeDownloadResult", vec![json!(id)]);
                    self.enqueue(index, false)?;
                }
                self.journal.tasks[index].status = "waiting".into();
                self.journal.tasks[index].error.clear();
                if let Err(error) = self.persist() {
                    let _ = self.rpc("forcePause", vec![json!(self.journal.tasks[index].id)]);
                    self.journal.tasks[index].status = "paused".into();
                    return Err(error);
                }
            }
            Request::Remove { id } => {
                let index = self.index(&id)?;
                if self.engine.is_some() && matches!(self.journal.tasks[index].status.as_str(), "active" | "waiting") {
                    self.rpc("forcePause", vec![json!(id)])?;
                    self.journal.tasks[index].status = "paused".into();
                    self.journal.tasks[index].speed = 0;
                }
                let removed = self.journal.tasks.remove(index);
                if let Err(error) = self.persist() { self.journal.tasks.insert(index, removed); return Err(error); }
                if self.engine.is_some() {
                    let _ = self.rpc("forceRemove", vec![json!(id)]);
                    let _ = self.rpc("removeDownloadResult", vec![json!(id)]);
                }
            }
            Request::Settings { settings } => {
                validate_settings(&settings)?;
                let old = self.journal.settings.clone();
                self.journal.settings = settings;
                if let Err(error) = self.persist() { self.journal.settings = old; return Err(error); }
                if self.engine.is_some() {
                    if let Err(error) = self.rpc("changeGlobalOption", vec![json!({"max-concurrent-downloads":self.journal.settings.concurrent.to_string(), "max-overall-download-limit":format!("{}K",self.journal.settings.limit_kib)})]) {
                        self.journal.settings = old;
                        self.persist()?;
                        return Err(error);
                    }
                }
            }
            Request::Reveal { id } => {
                let task = &self.journal.tasks[self.index(&id)?];
                let directory = Path::new(&task.directory);
                if !directory.is_dir() { return Err("保存目录已移动或删除".into()); }
                Command::new("explorer.exe").arg(directory).spawn().map_err(|_| "无法打开保存目录")?;
            }
        }
        Ok(())
    }
    fn index(&self, id: &str) -> Result<usize, String> {
        self.journal.tasks.iter().position(|task| task.id == id).ok_or_else(|| "下载记录不存在".into())
    }
    fn refresh(&mut self, app: &tauri::AppHandle) -> Result<(), String> {
        let Some(engine) = &mut self.engine else { return Ok(()); };
        if engine.child.try_wait().map_err(|_| "无法读取下载引擎状态")?.is_some() {
            self.engine = None;
            for task in &mut self.journal.tasks {
                task.speed = 0;
                if matches!(task.status.as_str(), "active" | "waiting") { task.status = "error".into(); task.error = "下载引擎意外停止，点击重试以继续".into(); }
            }
            self.persist()?;
            return Err("下载引擎意外停止，已有文件和续传记录已保留".into());
        }
        let mut changed = false;
        for index in 0..self.journal.tasks.len() {
            if !matches!(self.journal.tasks[index].status.as_str(), "active" | "waiting" | "paused") { continue; }
            let status = self.rpc("tellStatus", vec![json!(self.journal.tasks[index].id), json!(["status","totalLength","completedLength","downloadSpeed","errorCode"])])?;
            let task = &mut self.journal.tasks[index];
            let next = status["status"].as_str().unwrap_or("error");
            if task.status != next {
                task.status = next.into(); changed = true;
                if next == "complete" { task.finished_at = Some(chrono::Utc::now().timestamp_millis()); self.pending_notifications.push(task.name.clone()); }
                if next == "error" { task.error = error_message(status["errorCode"].as_str().unwrap_or("1")); }
            }
            task.total = number(&status["totalLength"]);
            task.completed = number(&status["completedLength"]);
            task.speed = number(&status["downloadSpeed"]);
        }
        if changed || self.dirty { self.persist()?; }
        self.error = None;
        for name in self.pending_notifications.drain(..) {
            if self.journal.settings.notify {
                if let Err(error) = app.notification().builder().title("下载完成").body(name).show() { log::warn!("Download notification unavailable: {error}"); }
            }
        }
        Ok(())
    }
    fn stop(&mut self) {
        if let Some(engine) = self.engine.take() {
            let _ = engine.rpc("forcePauseAll", vec![]);
            let _ = self.persist();
            let _ = engine.rpc("forceShutdown", vec![]);
            // Allow aria2 to flush its control files before dropping the child handle.
            let mut engine = engine;
            for _ in 0..20 {
                if engine.child.try_wait().ok().flatten().is_some() { break; }
                std::thread::sleep(Duration::from_millis(100));
            }
        }
    }
}

fn save_journal(root: &Path, journal: &Journal) -> Result<(), String> {
    fs::create_dir_all(root).map_err(|_| "下载记录目录不可写")?;
    let bytes = serde_json::to_vec_pretty(journal).map_err(|_| "下载记录序列化失败")?;
    let temp = root.join("history.json.tmp");
    let mut file = fs::File::create(&temp).map_err(|_| "无法保存下载记录，请检查磁盘空间和权限")?;
    file.write_all(&bytes).and_then(|_| file.sync_all()).map_err(|_| "下载记录写入失败，原文件已保留")?;
    drop(file);
    fs::rename(temp, root.join("history.json")).map_err(|_| "无法替换下载记录，原文件已保留".into())
}
fn number(value: &Value) -> u64 { value.as_str().and_then(|v| v.parse().ok()).unwrap_or(0) }
fn validate_url(url: &str) -> Result<(), String> {
    let parsed = reqwest::Url::parse(url).map_err(|_| "请输入完整的 HTTP 或 HTTPS 下载链接")?;
    if !matches!(parsed.scheme(), "http" | "https") || parsed.host_str().is_none() { return Err("目前支持 HTTP / HTTPS 文件直链".into()); }
    if !parsed.username().is_empty() || parsed.password().is_some() { return Err("暂不支持在链接中包含账号密码".into()); }
    if url.len() > 16384 || url.chars().any(|ch| ch.is_control()) { return Err("下载链接无效或过长".into()); }
    Ok(())
}
fn validate_name(name: &str) -> Result<(), String> {
    let stem = name.split('.').next().unwrap_or("").to_ascii_uppercase();
    if name.is_empty() || name.len() > 180 || name.ends_with([' ', '.']) || name.starts_with('.')
        || name.chars().any(|ch| ch.is_control() || "<>:\"/\\|?*".contains(ch))
        || matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL" | "CLOCK$")
        || (stem.len() == 4 && (stem.starts_with("COM") || stem.starts_with("LPT")) && stem.as_bytes()[3].is_ascii_digit()) {
        return Err("文件名无效，请避免路径符号、特殊字符及 Windows 保留名称".into());
    }
    Ok(())
}
fn validate_directory(directory: &str) -> Result<(), String> {
    if !Path::new(directory).is_absolute() || directory.chars().any(|ch| ch.is_control()) { return Err("请选择有效的绝对保存路径".into()); }
    Ok(())
}
fn validate_settings(settings: &Settings) -> Result<(), String> {
    validate_directory(&settings.directory)?;
    if !(1..=8).contains(&settings.concurrent) || settings.limit_kib > 1_048_576 { return Err("同时下载数须为 1–8，限速须为 0–1048576 KiB/s".into()); }
    Ok(())
}
fn error_message(code: &str) -> String {
    match code {
        "2" => "连接超时，请检查网络后重试", "3" | "4" => "文件不存在或链接已失效",
        "8" => "服务器不支持断点续传，请用新文件名重新下载", "9" => "磁盘空间不足",
        "13" => "目标文件已存在，请更换文件名", "16" | "17" | "18" => "文件写入失败，请检查权限和磁盘",
        "19" => "无法解析服务器地址", "24" => "下载链接需要登录或已过期", "32" => "文件校验失败",
        _ => "下载失败，请检查链接和网络后重试",
    }.to_string()
}

#[cfg(windows)]
fn random_hex(length: usize) -> Result<String, String> {
    #[link(name = "bcrypt")]
    extern "system" { fn BCryptGenRandom(provider: *mut std::ffi::c_void, buffer: *mut u8, length: u32, flags: u32) -> i32; }
    let mut bytes = vec![0u8; length];
    if unsafe { BCryptGenRandom(std::ptr::null_mut(), bytes.as_mut_ptr(), length as u32, 2) } != 0 { return Err("无法生成安全的下载会话".into()); }
    Ok(bytes.iter().map(|byte| format!("{byte:02x}")).collect())
}
#[cfg(not(windows))]
fn random_hex(_length: usize) -> Result<String, String> { Err("下载中心当前仅支持 Windows".into()) }

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn rejects_unsafe_input() {
        for name in ["../other.exe", "C:\\other", "NUL.zip", "COM1", "bad:stream", "name.", "a\nb"] { assert!(validate_name(name).is_err(), "{name}"); }
        assert!(validate_name("中文文件 2026.zip").is_ok());
        for url in ["file:///C:/secret", "magnet:?x", "https://user:password@example.com", "https://example.com\n"] { assert!(validate_url(url).is_err()); }
        assert!(validate_url("https://example.com/file.zip?token=test").is_ok());
    }
    #[test] fn recognizes_server_filename_without_accepting_paths() {
        assert_eq!(disposition_name("attachment; filename=\"release.zip\""), Some("release.zip".into()));
        assert_eq!(disposition_name("attachment; filename=fallback.zip; filename*=UTF-8''%E4%B8%AD%E6%96%87.zip"), Some("中文.zip".into()));
        assert_eq!(disposition_name("attachment; filename=../escape.exe"), None);
        assert_eq!(disposition_name("attachment; filename*=UTF-8''%ZZ.zip"), None);
    }
    #[test] fn failed_replace_preserves_journal() {
        let root = std::env::temp_dir().join(format!("projecttodo-download-test-{}", random_hex(8).unwrap()));
        fs::create_dir_all(root.join("history.json.tmp")).unwrap();
        let previous = b"previous journal";
        fs::write(root.join("history.json"), previous).unwrap();
        let journal = Journal { version: 1, settings: Settings { directory: root.to_string_lossy().into(), concurrent: 3, limit_kib: 0, notify: false }, tasks: vec![] };
        assert!(save_journal(&root, &journal).is_err());
        assert_eq!(fs::read(root.join("history.json")).unwrap(), previous);
        fs::remove_dir_all(root).unwrap();
    }
}

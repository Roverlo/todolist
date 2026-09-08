use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::Duration;
use tauri::{Emitter, Manager, State, Window, WindowEvent};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};

#[derive(Default)]
pub struct CloseGuard {
    ready: AtomicBool,
    sequence: AtomicU64,
    pending: AtomicU64,
    dialog_open: AtomicBool,
}

#[tauri::command]
pub fn set_close_handler_ready(ready: bool, guard: State<'_, CloseGuard>) {
    guard.ready.store(ready, Ordering::SeqCst);
    if !ready {
        guard.pending.store(0, Ordering::SeqCst);
    }
}

#[tauri::command]
pub fn respond_to_close_request(request_id: u64, guard: State<'_, CloseGuard>) -> bool {
    request_id != 0
        && guard
            .pending
            .compare_exchange(request_id, 0, Ordering::SeqCst, Ordering::SeqCst)
            .is_ok()
}

pub fn on_window_event(window: &Window, event: &WindowEvent) {
    let WindowEvent::CloseRequested { api, .. } = event else {
        return;
    };
    if window.label() != "main" {
        return;
    }
    let guard = window.state::<CloseGuard>();
    // Before the frontend registers, keep Windows' normal close behavior.
    if !guard.ready.load(Ordering::SeqCst) {
        return;
    }
    api.prevent_close();
    if guard.dialog_open.load(Ordering::SeqCst) {
        return;
    }
    let request_id = guard.sequence.fetch_add(1, Ordering::SeqCst) + 1;
    if guard
        .pending
        .compare_exchange(0, request_id, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return;
    }
    log::info!(
        "Close request pid={} request={request_id}",
        std::process::id()
    );
    if let Err(error) = window.emit("projecttodo-close-requested", request_id) {
        log::warn!("Could not notify frontend of close request: {error}");
    }
    let app = window.app_handle().clone();
    let owner = window.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_secs(3));
        let guard = app.state::<CloseGuard>();
        if guard
            .pending
            .compare_exchange(request_id, 0, Ordering::SeqCst, Ordering::SeqCst)
            .is_err()
        {
            return;
        }
        // Invalidate the request before showing the native dialog: a late frontend
        // response must not exit after the user has chosen to keep waiting.
        if guard.dialog_open.swap(true, Ordering::SeqCst) {
            return;
        }
        log::warn!(
            "Frontend did not respond to close pid={} request={request_id}",
            std::process::id()
        );
        let response_app = app.clone();
        app.dialog()
            .message(
                "页面暂时没有响应。你可以退出程序后重新打开，或继续等待。尚未保存的修改可能丢失。",
            )
            .parent(&owner)
            .title("ProjectTodo - 页面未响应")
            .kind(MessageDialogKind::Warning)
            .buttons(MessageDialogButtons::OkCancelCustom(
                "退出程序".into(),
                "继续等待".into(),
            ))
            .show(move |should_exit| {
                response_app
                    .state::<CloseGuard>()
                    .dialog_open
                    .store(false, Ordering::SeqCst);
                if should_exit {
                    log::info!("User confirmed native exit pid={}", std::process::id());
                    response_app.exit(0);
                } else {
                    log::info!("User chose to wait pid={}", std::process::id());
                }
            });
    });
}

import { invoke } from '@tauri-apps/api/core';

const TARGET_ID = 'fatal-error-overlay';

const renderOverlay = (message: string, detail?: string) => {
  const existing = document.getElementById(TARGET_ID);
  const container =
    existing ??
    (() => {
      const el = document.createElement('div');
      el.id = TARGET_ID;
      document.body.appendChild(el);
      return el;
    })();
  container.innerHTML = `
    <div class="fatal-overlay">
      <h1>应用运行出错</h1>
      <p>请将以下信息反馈给开发者，并附上日志文件。</p>
      <pre>${message}</pre>
      ${detail ? `<pre>${detail}</pre>` : ''}
    </div>
  `;
};

const forwardToBackend = (level: 'error' | 'warn', message: string) => {
  invoke('frontend_log', { level, message }).catch(() => {
    // swallow logging failures
  });
};

export const installGlobalErrorHandlers = () => {
  if ((window as any).__APP_ERROR_HANDLERS_INSTALLED__) {
    return;
  }
  (window as any).__APP_ERROR_HANDLERS_INSTALLED__ = true;

  window.addEventListener('error', (event) => {
    const detail =
      event.error && event.error.stack
        ? String(event.error.stack)
        : `${event.filename ?? 'unknown'}:${event.lineno ?? 0}:${event.colno ?? 0}`;
    const message = `[window.error] ${event.message}`;
    renderOverlay(message, detail);
    forwardToBackend('error', `${message}\n${detail}`);
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
    const message = `[unhandledrejection] ${reason.message}`;
    renderOverlay(message, reason.stack ?? String(reason));
    forwardToBackend('error', `${message}\n${reason.stack ?? ''}`);
  });

  console.info('[GlobalErrorHandlers] installed');
};

import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { copyFile, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

// Invoked by test-portable.ps1, which backs up user data and provides isolated data/profile directories.
const arg = name => process.argv[process.argv.indexOf(name) + 1];
const executable = arg('--executable');
const output = arg('--output');
const originalPid = Number(arg('--pid'));
const endpoint = `http://127.0.0.1:${arg('--cdp')}`;
const children = [];
const run = promisify(execFile);
let browser;
let previousDebugger;
assert.ok(process.env.PROJECTTODO_TEST_DATA_DIR && process.env.WEBVIEW2_USER_DATA_FOLDER, 'Use isolated native test data');

const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };
const until = async (check, message, timeout = 10000) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        if (await check()) return;
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.fail(message);
};
const launch = (file = executable, env = process.env) => {
    const child = spawn(file, [], { cwd: dirname(executable), env, windowsHide: true, stdio: 'ignore' });
    children.push(child);
    return child;
};
const closeNativeWindow = async pid => {
    assert.ok(Number.isInteger(pid) && pid > 0);
    const { stdout } = await run('powershell.exe', ['-NoProfile', '-Command', `(Get-Process -Id ${pid} -ErrorAction Stop).CloseMainWindow()`], { windowsHide: true, timeout: 8000 });
    assert.equal(stdout.trim(), 'True', 'Windows must accept the title-bar close request');
};
const connect = async () => {
    await until(async () => {
        try {
            const version = await (await fetch(endpoint + '/json/version')).json();
            if (version.webSocketDebuggerUrl === previousDebugger) return false;
            browser = await chromium.connectOverCDP(endpoint);
            if (!browser.contexts()[0]?.pages().length) return false;
            previousDebugger = version.webSocketDebuggerUrl;
            return true;
        } catch { return false; }
    }, 'Native WebView debugging endpoint must start');
    return browser.contexts()[0].pages()[0];
};
const isVisible = page => page.evaluate(() => window.__TAURI_INTERNALS__.invoke('plugin:window|is_visible', { label: 'main' }));

try {
    let page = await connect();
    let currentPid = originalPid;
    const checkWorkArea = async () => {
        const bounds = await page.evaluate(async () => {
            const invoke = command => window.__TAURI_INTERNALS__.invoke('plugin:window|' + command, { label: 'main' });
            return { position: await invoke('outer_position'), size: await invoke('outer_size'), monitor: await invoke('current_monitor'), fullscreen: await invoke('is_fullscreen') };
        });
        console.log('Window work area:', JSON.stringify(bounds));
        assert.equal(bounds.fullscreen, false, 'Keep the Windows taskbar available');
        const { stdout } = await run('powershell.exe', ['-NoProfile', '-File', fileURLToPath(new URL('./inspect-window-bounds.ps1', import.meta.url)), '-ProcessId', String(currentPid)], { windowsHide: true });
        const nativeBounds = JSON.parse(stdout);
        console.log('Visible native bounds:', JSON.stringify(nativeBounds));
        assert.deepEqual(nativeBounds.visible, nativeBounds.work, 'Visible frame must meet the work-area edges without a gap');
        const contentBottom = nativeBounds.clientOrigin.y + nativeBounds.client.bottom;
        assert.ok(contentBottom <= nativeBounds.work.bottom && nativeBounds.work.bottom - contentBottom <= 2,
            'Content reaches the taskbar edge with only the native border, never a blank strip');
    };
    await checkWorkArea();
    const body = page.getByRole('textbox', { name: '随记正文', exact: true });
    await body.waitFor();
    const windowState = () => page.evaluate(async () => {
        const commands = ['is_maximized', 'is_minimized', 'is_maximizable', 'is_minimizable', 'is_decorated', 'is_resizable'];
        return Object.fromEntries(await Promise.all(commands.map(async command => [command, await window.__TAURI_INTERNALS__.invoke('plugin:window|' + command, { label: 'main' })])));
    });
    assert.deepEqual(await windowState(), { is_maximized: false, is_minimized: false, is_maximizable: false, is_minimizable: true, is_decorated: false, is_resizable: false });
    assert.equal(await page.getByRole('banner', { name: '窗口标题栏' }).getByRole('button').count(), 2, 'Only minimize and close are shown');
    await page.screenshot({ path: join(output, 'maximized-two-window-buttons.png') });
    await page.getByRole('button', { name: '最小化窗口', exact: true }).click();
    await until(async () => (await windowState()).is_minimized, 'Minimize must remain available');
    const minimizedWake = launch();
    await until(() => minimizedWake.exitCode !== null, 'A repeated launch restores the minimized instance');
    await until(async () => !(await windowState()).is_minimized, 'Repeated launch restores the window');
    await checkWorkArea();
    console.log('Passed: work-area startup, no restore button, native minimize and work-area wake-up');
    const originalContent = await body.innerHTML();
    await page.evaluate(() => localStorage.removeItem('closeAction'));
    await page.getByRole('button', { name: '关闭窗口', exact: true }).click();
    await page.getByRole('heading', { name: '关闭应用', exact: true }).waitFor();
    await page.getByLabel('记住我的选择', { exact: true }).check();
    await page.getByRole('button', { name: '最小化到托盘', exact: true }).click();
    await until(async () => !await isVisible(page), 'The first instance should hide to the tray');

    const renamed = join(dirname(executable), 'ProjectTodo-renamed-check.exe');
    await copyFile(executable, renamed);
    for (const file of [executable, executable, renamed]) {
        const duplicate = launch(file);
        await until(() => duplicate.exitCode !== null, 'A repeated launch must exit instead of opening another window');
        assert.equal(duplicate.exitCode, 0);
        assert.ok(alive(originalPid), 'The original instance must remain alive');
        await until(() => isVisible(page), 'A repeated launch must restore the original window');
        await checkWorkArea();
        assert.equal(await body.innerHTML(), originalContent, 'Restoring the window must preserve the current note');
        await closeNativeWindow(originalPid);
        await until(async () => !await isVisible(page), 'The remembered tray preference must still work');
    }
    console.log('Passed: tray restore, repeated launches and renamed executable reuse the original process');

    const wake = launch();
    await until(() => wake.exitCode !== null, 'Wake-up process should exit');
    await until(() => isVisible(page), 'Original window should be restored');
    await page.evaluate(() => localStorage.removeItem('closeAction'));
    await closeNativeWindow(originalPid);
    await page.getByRole('button', { name: '退出程序', exact: true }).click();
    await until(() => !alive(originalPid), 'Explicit exit must stop the original process');
    await browser.close().catch(() => {});

    const restarted = launch();
    currentPid = restarted.pid;
    page = await connect();
    await page.getByRole('textbox', { name: '随记正文', exact: true }).waitFor();
    await checkWorkArea();
    await page.evaluate(() => localStorage.setItem('closeAction', 'exit'));
    await closeNativeWindow(restarted.pid);
    await until(() => restarted.exitCode !== null, 'The remembered exit choice must stop the process');
    assert.equal(restarted.exitCode, 0);
    await browser.close().catch(() => {});
    console.log('Passed: explicit exit, restart after exit and remembered exit preference');

    const blank = launch(executable, {
        ...process.env,
        WEBVIEW2_USER_DATA_FOLDER: join(output, 'blank-webview'),
        WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: process.env.WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS + ' --blink-settings=scriptEnabled=false',
    });
    page = await connect();
    await page.locator('#root').waitFor({ state: 'attached' });
    assert.equal(await page.locator('#root').count(), 1, 'The blank-window check must load the real bundled page');
    assert.equal(await page.locator('#root').innerHTML(), '', 'Frontend scripts must be disabled to reproduce an uninitialized window');
    await page.screenshot({ path: join(output, 'uninitialized-window.png') });
    await closeNativeWindow(blank.pid);
    await until(() => blank.exitCode !== null, 'An uninitialized window must close without Task Manager');
    assert.equal(blank.exitCode, 0);
    const saved = JSON.parse(await readFile(join(process.env.PROJECTTODO_TEST_DATA_DIR, 'data.json'), 'utf8'));
    assert.match(saved.state.notes[0].content, /Packaged editor/);
    console.log('Passed: uninitialized window closes natively and persisted test notes remain intact');
} finally {
    await browser?.close().catch(() => {});
    for (const child of children) {
        if (child.exitCode === null && !child.killed) child.kill();
    }
}

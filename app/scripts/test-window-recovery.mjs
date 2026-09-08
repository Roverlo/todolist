import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';

// Run through test-portable.ps1 -WindowRecovery busy|crash. An operator or
// Computer Use clicks the native X and the requested native dialog button.
const arg = name => process.argv[process.argv.indexOf(name) + 1];
const pid = Number(arg('--pid'));
const fault = arg('--fault');
const output = arg('--output');
assert.ok(process.env.PROJECTTODO_TEST_DATA_DIR && process.env.WEBVIEW2_USER_DATA_FOLDER);
assert.ok(Number.isInteger(pid) && pid > 0 && ['busy', 'crash'].includes(fault));
const alive = () => { try { process.kill(pid, 0); return true; } catch { return false; } };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const until = async (check, message, timeout = 90000) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        if (await check()) return;
        await sleep(250);
    }
    assert.fail(message);
};
const browser = await chromium.connectOverCDP(`http://127.0.0.1:${arg('--cdp')}`);
const result = { fault, pid };
try {
    const page = browser.contexts()[0].pages()[0];
    const body = page.getByRole('textbox', { name: '随记正文', exact: true });
    await body.waitFor();
    const content = await body.innerHTML();
    await page.evaluate(() => localStorage.removeItem('closeAction'));
    await page.evaluate(() => window.__TAURI_INTERNALS__.invoke('plugin:window|close', { label: 'main' }));
    const heading = page.getByRole('heading', { name: '关闭应用', exact: true });
    await heading.waitFor();
    await page.locator('.overlay').filter({ has: heading }).click({ position: { x: 5, y: 5 } });
    await heading.waitFor({ state: 'hidden' });
    result.normalCloseDialogPassed = true;
    await page.evaluate(() => localStorage.setItem('closeAction', 'exit'));
    const session = await page.context().newCDPSession(page);
    let recovery;
    if (fault === 'crash') {
        const crashed = page.waitForEvent('crash');
        void session.send('Page.crash').catch(() => {});
        await crashed;
    } else {
        await session.send('Runtime.enable');
        const busyStarted = new Promise(resolve => session.on('Runtime.consoleAPICalled', event => {
            if (event.args.some(arg => arg.value === 'RECOVERY_TEST_BUSY')) resolve();
        }));
        recovery = session.send('Runtime.evaluate', { expression: "console.log('RECOVERY_TEST_BUSY'); { const end = Date.now() + 35000; while (Date.now() < end) {} }" });
        await busyStarted;
    }
    console.log(`NATIVE_ACTION_REQUIRED: click X, then ${fault === 'crash' ? '退出程序' : '继续等待'}; pid=${pid}`);
    const logPath = join(process.env.LOCALAPPDATA, 'com.projecttodo.manager', 'logs', 'ProjectTodo.log');
    await until(async () => (await readFile(logPath, 'utf8')).includes(`Frontend did not respond to close pid=${pid} request=`), 'The native close timeout must occur');
    result.nativeTimeoutObserved = true;
    if (fault === 'busy') {
        await recovery;
        await until(async () => (await readFile(logPath, 'utf8')).includes(`User chose to wait pid=${pid}`), 'Choose 继续等待 in the native dialog');
        await sleep(1000);
        assert.ok(alive(), 'A stale close response must not exit after choosing to wait');
        assert.equal(await body.innerHTML(), content, 'Recovered note content must remain unchanged');
        result.continueWaitingPassed = true;
        await page.evaluate(() => window.__TAURI_INTERNALS__.invoke('plugin:window|close', { label: 'main' })).catch(() => {});
    }
    await until(() => !alive(), 'The application must exit without terminating its process');
    result.exitPassed = true;
    if (fault === 'crash') {
        assert.ok((await readFile(logPath, 'utf8')).includes(`User confirmed native exit pid=${pid}`));
    }
    await writeFile(join(output, `recovery-${fault}.json`), JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ result: 'PASS', ...result }));
} finally {
    await browser.close().catch(() => {});
}

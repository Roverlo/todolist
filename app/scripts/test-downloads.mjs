import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rmdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const arg = name => process.argv[process.argv.indexOf(name) + 1];
const native = process.argv.includes('--cdp');
const output = path.resolve('ui-check.local', `downloads-${native ? 'native' : 'browser'}`);
await mkdir(output, { recursive: true });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const until = async (check, label, timeout = 25000) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { if (await check()) return; await sleep(200); }
  assert.fail(label);
};
const errors = [], ranges = [];
const bytes = Buffer.alloc(6 * 1024 * 1024);
for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 37 + Math.floor(i / 1031)) % 256;
const digest = data => createHash('sha256').update(data).digest('hex');
const mock = createServer((req, res) => {
  if (req.url === '/missing') { res.writeHead(404); res.end(); return; }
  const body = req.url === '/small.zip' ? bytes.subarray(0, 65536) : bytes;
  const range = req.headers.range?.match(/bytes=(\d+)-(\d*)/);
  const start = range ? Number(range[1]) : 0;
  const end = range?.[2] ? Math.min(Number(range[2]), body.length - 1) : body.length - 1;
  if (range) ranges.push({ start, end });
  const headers = { 'Content-Type': 'application/octet-stream', 'Content-Length': end - start + 1, 'Accept-Ranges': 'bytes', ETag: '"fixture-v1"' };
  if (req.url === '/small.zip') headers['Content-Disposition'] = "attachment; filename=fallback.zip; filename*=UTF-8''%E6%9C%8D%E5%8A%A1%E7%AB%AF.zip";
  if (range) headers['Content-Range'] = `bytes ${start}-${end}/${body.length}`;
  res.writeHead(range ? 206 : 200, headers);
  if (req.method === 'HEAD') { res.end(); return; }
  let offset = start;
  const timer = setInterval(() => {
    const next = Math.min(offset + 32768, end + 1);
    res.write(body.subarray(offset, next)); offset = next;
    if (offset > end) { clearInterval(timer); res.end(); }
  }, 15);
  res.on('close', () => clearInterval(timer));
});
await new Promise(resolve => mock.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${mock.address().port}`;
let browser, page, restarted;
const request = request => page.evaluate(request => window.__TAURI_INTERNALS__.invoke('downloads_request', { request }), request);
const snapshot = () => request({ action: 'list' });
const rejected = async (operation, pattern) => { let message = ''; try { await operation(); } catch (error) { message = String(error); } assert.match(message, pattern); };
const goDownloads = async () => {
  const reminder = page.getByRole('button', { name: '我知道了', exact: true });
  if (await reminder.isVisible()) await reminder.click();
  await page.getByRole('button', { name: '下载中心', exact: true }).click();
  await page.getByRole('heading', { name: '下载中心', exact: true }).waitFor();
};
try {
  if (native) {
    assert.ok(process.env.PROJECTTODO_TEST_DATA_DIR && path.resolve(arg('--data')).startsWith(path.resolve(process.env.PROJECTTODO_TEST_DATA_DIR) + path.sep));
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${arg('--cdp')}`); page = browser.contexts()[0].pages()[0];
  } else {
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    page = await browser.newPage({ viewport: { width: 1538, height: 840 }, timezoneId: 'Asia/Shanghai' });
    await page.goto('http://127.0.0.1:52923/');
  }
  page.on('pageerror', error => errors.push(error.message));
  await goDownloads();
  if (!native) {
    await page.getByRole('button', { name: '新建下载', exact: true }).first().click();
    const add = page.getByRole('dialog', { name: '新建下载' });
    await add.getByPlaceholder('粘贴 HTTP / HTTPS 文件链接').fill('https://example.com/中文资料.zip');
    assert.equal(await add.getByLabel('文件名', { exact: true }).inputValue(), '中文资料.zip');
    assert.equal(await add.getByRole('button', { name: '开始下载' }).isDisabled(), true);
    await add.screenshot({ path: path.join(output, 'add.png') });
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '下载设置', exact: true }).click();
    await page.getByRole('dialog', { name: '下载设置' }).screenshot({ path: path.join(output, 'settings.png') });
    await page.keyboard.press('Escape');
    for (const theme of ['blue', 'green', 'purple', 'orange', 'mono', 'sky', 'rose', 'indigo']) {
      await page.evaluate(async theme => { const { useAppStore } = await import('/src/state/appStore.ts'); useAppStore.getState().setSettings({ colorScheme: theme }); }, theme);
      const colors = await page.evaluate(() => ({ primary: getComputedStyle(document.documentElement).getPropertyValue('--primary').trim(), button: getComputedStyle(document.querySelector('.download-primary')).backgroundColor }));
      assert.ok(colors.primary && colors.button !== 'rgba(0, 0, 0, 0)');
      await page.screenshot({ path: path.join(output, `${theme}.png`) });
    }
    for (const width of [900, 1100, 1280, 1538, 1920]) {
      await page.setViewportSize({ width, height: 840 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `No overflow at ${width}`);
      const tabs = await page.locator('.view-switch-item').evaluateAll(nodes => nodes.map(node => ({ text: node.textContent, fits: node.scrollWidth <= node.clientWidth })));
      assert.ok(tabs.every(tab => tab.fits), JSON.stringify(tabs));
    }
    await page.getByRole('button', { name: '待办事项', exact: true }).click();
    await page.getByText('任务看板', { exact: true }).waitFor();
    await page.getByRole('button', { name: '随记中心', exact: true }).click();
    await page.locator('.notes-main-root').waitFor();
    console.log('PASS: browser preview guard, 8 themes, 5 widths, dialogs, three-way navigation');
  } else {
    await until(async () => !(await page.getByRole('button', { name: '新建下载', exact: true }).first().isDisabled()), 'Native ready');
    let state = await snapshot();
    const directory = state.settings.directory;
    const root = path.join(process.env.PROJECTTODO_TEST_DATA_DIR, 'downloads');
    const settings = { ...state.settings, concurrent: 1, limitKib: 256, notify: false };
    const info = await page.evaluate(url => window.__TAURI_INTERNALS__.invoke('downloads_inspect', { url }), `${base}/small.zip`);
    assert.equal(info.name, '服务端.zip'); assert.equal(info.total, 65536); assert.equal(info.fromServer, true);
    await request({ action: 'settings', settings });
    const beforeNotes = JSON.parse(await readFile(arg('--data'), 'utf8')).state.notes;
    await page.getByRole('button', { name: '新建下载', exact: true }).first().click();
    const add = page.getByRole('dialog', { name: '新建下载' });
    await add.getByPlaceholder('粘贴 HTTP / HTTPS 文件链接').fill(`${base}/small.zip`);
    await add.getByPlaceholder('粘贴 HTTP / HTTPS 文件链接').press('Tab');
    await until(async () => (await add.getByLabel('文件名', { exact: true }).inputValue()) === '服务端.zip', 'Server filename recognized in native UI');
    await add.getByPlaceholder('粘贴 HTTP / HTTPS 文件链接').fill(`${base}/large.zip`);
    await add.getByLabel('文件名', { exact: true }).fill('中文资料.zip');
    await add.getByRole('button', { name: '开始下载', exact: true }).click();
    await add.waitFor({ state: 'hidden' });
    state = await snapshot(); const id = state.tasks[0].id;
    await until(async () => (await snapshot()).tasks.find(t => t.id === id).completed > 262144, 'Actual bytes arrive');
    await request({ action: 'add', url: `${base}/small.zip`, name: 'queue.zip', directory });
    await until(async () => (await snapshot()).tasks.find(t => t.name === 'queue.zip')?.status === 'waiting', 'Concurrency queues second file');
    await page.screenshot({ path: path.join(output, 'active.png') });
    await page.getByRole('button', { name: '暂停 中文资料.zip', exact: true }).click();
    await until(async () => (await snapshot()).tasks.find(t => t.id === id).status === 'paused', 'Pause applied');
    await until(async () => (await snapshot()).tasks.find(t => t.name === 'queue.zip').status === 'complete', 'Queue continues after pause');
    const pausedAt = (await snapshot()).tasks.find(t => t.id === id).completed;
    await sleep(1500); assert.equal((await snapshot()).tasks.find(t => t.id === id).completed, pausedAt);
    await page.getByRole('button', { name: '继续 中文资料.zip', exact: true }).click();
    await page.getByRole('button', { name: '随记中心', exact: true }).click();
    await until(async () => (await snapshot()).tasks.find(t => t.id === id).completed > pausedAt, 'Download continues while viewing notes');
    await request({ action: 'pause', id }); await sleep(1500);
    if (process.argv.includes('--executable')) {
      const rangeCount = ranges.length;
      await Promise.race([page.evaluate(() => window.__TAURI_INTERNALS__.invoke('plugin:process|exit', { code: 0 })).catch(() => {}), sleep(3000)]);
      await browser.close().catch(() => {}); await sleep(3000);
      restarted = spawn(path.resolve(arg('--executable')), [], { cwd: path.dirname(path.resolve(arg('--executable'))), env: process.env, windowsHide: true, stdio: 'ignore' });
      await until(async () => { try { return (await fetch(`http://127.0.0.1:${arg('--cdp')}/json/version`)).ok; } catch { return false; } }, 'Native restart', 30000);
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${arg('--cdp')}`); page = browser.contexts()[0].pages()[0];
      await page.waitForFunction(() => Boolean(window.__TAURI_INTERNALS__));
      await until(async () => (await snapshot()).tasks.length === 2, 'History restored');
      assert.equal((await snapshot()).tasks.find(t => t.id === id).status, 'paused');
      assert.equal((await snapshot()).settings.limitKib, 256);
      await request({ action: 'resume', id });
      await until(() => ranges.length > rangeCount && ranges.slice(rangeCount).some(range => range.start > 0), 'Restart uses Range resume');
    }
    await request({ action: 'settings', settings: { ...settings, limitKib: 0 } });
    await until(async () => (await snapshot()).tasks.find(t => t.id === id).status === 'complete', 'Download completes', 45000);
    assert.equal(digest(await readFile(path.join(directory, '中文资料.zip'))), digest(bytes));
    assert.equal(digest(await readFile(path.join(directory, 'queue.zip'))), digest(bytes.subarray(0, 65536)));
    await request({ action: 'add', url: `${base}/missing`, name: 'missing.zip', directory });
    await until(async () => (await snapshot()).tasks.find(t => t.name === 'missing.zip').status === 'error', '404 visible failure');
    await request({ action: 'add', url: 'https://raw.githubusercontent.com/motrixapp/aria2/v1.37.0-motrix.16/COPYING', name: 'https-copying.txt', directory });
    await until(async () => (await snapshot()).tasks.find(t => t.name === 'https-copying.txt').status === 'complete', 'HTTPS download with certificate validation', 45000);
    assert.equal(digest(await readFile(path.join(directory, 'https-copying.txt'))), digest(await readFile('src-tauri/licenses/aria2-COPYING.txt')));
    await rejected(() => request({ action: 'add', url: 'file:///C:/invalid', name: 'unsafe.zip', directory }), /HTTP/);
    await rejected(() => request({ action: 'add', url: `${base}/small.zip`, name: '../escape.zip', directory }), /文件名/);
    await rejected(() => request({ action: 'add', url: `${base}/small.zip`, name: '中文资料.zip', directory }), /同名/);
    await rejected(() => request({ action: 'settings', settings: { ...settings, concurrent: 0 } }), /1–8/);
    const history = await readFile(path.join(root, 'history.json'));
    await mkdir(path.join(root, 'history.json.tmp'));
    await rejected(() => request({ action: 'settings', settings: { ...settings, concurrent: 7 } }), /保存/);
    assert.deepEqual(await readFile(path.join(root, 'history.json')), history);
    await rmdir(path.join(root, 'history.json.tmp'));
    await request({ action: 'settings', settings: { ...settings, limitKib: 0 } });
    await goDownloads();
    await page.getByRole('button', { name: '移除 中文资料.zip', exact: true }).click();
    await page.getByRole('dialog', { name: '移除下载记录' }).getByRole('button', { name: '移除记录', exact: true }).click();
    await until(async () => !(await snapshot()).tasks.some(t => t.id === id), 'Remove only record');
    assert.equal((await stat(path.join(directory, '中文资料.zip'))).size, bytes.length);
    assert.deepEqual(JSON.parse(await readFile(arg('--data'), 'utf8')).state.notes, beforeNotes);
    await page.screenshot({ path: path.join(output, 'complete.png') });
    console.log('PASS: HTTP/HTTPS bytes/SHA-256, concurrency, pause/resume, native restart/Range, background, 404, invalid input, overwrite guard, save failure, record-only removal, notes untouched');
  }
  assert.deepEqual(errors, []);
  await writeFile(path.join(output, 'result.json'), JSON.stringify({ result: 'PASS', native, ranges, errors }, null, 2));
} finally {
  if (restarted) {
    try { await Promise.race([page.evaluate(() => window.__TAURI_INTERNALS__.invoke('plugin:process|exit', { code: 0 })).catch(() => {}), sleep(3000)]); } catch { /* already closed */ }
    await sleep(2500); if (restarted.exitCode === null) restarted.kill();
  }
  await browser?.close().catch(() => {});
  mock.closeAllConnections(); await new Promise(resolve => mock.close(resolve));
}

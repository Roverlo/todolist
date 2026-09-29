import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rmdir, stat, unlink } from 'node:fs/promises';
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
let largeActive = 0, largePeak = 0;
const bytes = Buffer.alloc(6 * 1024 * 1024);
for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 37 + Math.floor(i / 1031)) % 256;
const digest = data => createHash('sha256').update(data).digest('hex');
const mock = createServer((req, res) => {
  if (req.url === '/missing') { res.writeHead(404); res.end(); return; }
  if (req.url === '/redirect') { res.writeHead(302, { Location: '/redirected.zip' }); res.end(); return; }
  if (req.url === '/no-head.zip' && req.method === 'HEAD') { res.writeHead(405); res.end(); return; }
  if (req.url === '/head-fails.zip' && req.method === 'HEAD') { res.writeHead(500); res.end(); return; }
  if (req.url === '/slow-old' && req.method === 'HEAD') {
    setTimeout(() => { res.writeHead(200, { 'Content-Disposition': 'attachment; filename=stale.zip', 'Content-Length': 65536 }); res.end(); }, 1200); return;
  }
  const body = ['/large.zip', '/connections.zip'].includes(req.url) ? bytes : bytes.subarray(0, 65536);
  const large = req.url === '/connections.zip';
  const length = large ? 160 * 1024 * 1024 : body.length;
  const range = req.headers.range?.match(/bytes=(\d+)-(\d*)/);
  const start = range ? Number(range[1]) : 0;
  const end = range?.[2] ? Math.min(Number(range[2]), length - 1) : length - 1;
  if (range) ranges.push({ start, end });
  const headers = { 'Content-Type': 'application/octet-stream', 'Content-Length': end - start + 1, 'Accept-Ranges': 'bytes', ETag: '"fixture-v1"' };
  if (req.url === '/small.zip') headers['Content-Disposition'] = "attachment; filename=fallback.zip; filename*=UTF-8''%E6%9C%8D%E5%8A%A1%E7%AB%AF.zip";
  if (req.url === '/opaque?code=fixture') headers['Content-Disposition'] = req.method === 'HEAD' ? 'attachment' : "attachment; filename*=UTF-8''%E8%87%AA%E5%8A%A8%E8%AF%86%E5%88%AB.zip";
  if (req.url === '/unsafe-header') headers['Content-Disposition'] = 'attachment; filename=../escape.exe';
  if (range) headers['Content-Range'] = `bytes ${start}-${end}/${length}`;
  res.writeHead(range ? 206 : 200, headers);
  if (req.method === 'HEAD') { res.end(); return; }
  if (large) { largeActive++; largePeak = Math.max(largePeak, largeActive); }
  let offset = start;
  const timer = setInterval(() => {
    const next = Math.min(offset + 32768, end + 1);
    if (res.writableNeedDrain) return;
    res.write(large ? body.subarray(0, next - offset) : body.subarray(offset, next)); offset = next;
    if (offset > end) { clearInterval(timer); res.end(); }
  }, 15);
  res.on('close', () => { clearInterval(timer); if (large) largeActive--; });
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
    assert.equal(await add.getByRole('textbox', { name: '另存为（可选）', exact: true }).count(), 0);
    assert.equal(await add.getByRole('button', { name: '识别文件', exact: true }).count(), 0);
    await add.getByPlaceholder('粘贴 HTTP / HTTPS 文件链接').fill('https://example.com/中文资料.zip');
    await add.getByText('中文资料.zip', { exact: true }).waitFor();
    await add.getByRole('button', { name: '重命名', exact: true }).click();
    const customName = add.getByRole('textbox', { name: '另存为（可选）', exact: true });
    assert.equal(await customName.getAttribute('required'), null);
    await customName.fill('自定义.zip');
    await add.getByPlaceholder('粘贴 HTTP / HTTPS 文件链接').fill('https://example.com/another.zip');
    assert.equal(await customName.inputValue(), '自定义.zip');
    await add.getByRole('button', { name: '使用原名', exact: true }).click();
    assert.equal(await customName.count(), 0);
    await add.getByPlaceholder('粘贴 HTTP / HTTPS 文件链接').fill('');
    assert.equal(await add.getByRole('button', { name: '开始下载' }).isDisabled(), true);
    await add.screenshot({ path: path.join(output, 'add.png') });
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '下载设置', exact: true }).click();
    const preferences = page.getByRole('dialog', { name: '下载设置' });
    const connections = preferences.getByRole('combobox', { name: '单文件连接数', exact: true });
    assert.equal(await connections.inputValue(), '4');
    assert.deepEqual(await connections.locator('option').evaluateAll(options => options.map(option => option.value)), ['1', '4', '8', '16', '32', '64']);
    await connections.selectOption('64');
    assert.equal(await preferences.getByRole('combobox', { name: '同时下载数', exact: true }).inputValue(), '3');
    await preferences.screenshot({ path: path.join(output, 'settings.png') });
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
    assert.equal(state.settings.connections, 4);
    await page.getByRole('button', { name: '下载设置', exact: true }).click();
    const preferences = page.getByRole('dialog', { name: '下载设置' });
    await preferences.getByRole('combobox', { name: '单文件连接数', exact: true }).selectOption('32');
    await preferences.getByRole('button', { name: '保存设置', exact: true }).click();
    await preferences.waitFor({ state: 'hidden' });
    assert.equal((await snapshot()).settings.connections, 32);
    const settings = { ...state.settings, connections: 32, concurrent: 1, limitKib: 256, notify: false };
    const info = await page.evaluate(url => window.__TAURI_INTERNALS__.invoke('downloads_inspect', { url }), `${base}/small.zip`);
    assert.equal(info.name, '服务端.zip'); assert.equal(info.total, 65536); assert.equal(info.fromServer, true);
    await request({ action: 'settings', settings });
    const beforeNotes = JSON.parse(await readFile(arg('--data'), 'utf8')).state.notes;
    await page.getByRole('button', { name: '新建下载', exact: true }).first().click();
    const add = page.getByRole('dialog', { name: '新建下载' });
    await add.getByPlaceholder('粘贴 HTTP / HTTPS 文件链接').fill(`${base}/slow-old`);
    await sleep(600);
    await add.getByPlaceholder('粘贴 HTTP / HTTPS 文件链接').fill(`${base}/small.zip`);
    await add.getByText('服务端.zip', { exact: true }).waitFor();
    await sleep(1000);
    assert.equal(await add.getByText('stale.zip', { exact: true }).count(), 0);
    await add.getByRole('button', { name: '重命名', exact: true }).click();
    await add.getByRole('textbox', { name: '另存为（可选）', exact: true }).fill('中文资料.zip');
    await add.getByPlaceholder('粘贴 HTTP / HTTPS 文件链接').fill(`${base}/large.zip`);
    await sleep(700);
    assert.equal(await add.getByRole('textbox', { name: '另存为（可选）', exact: true }).inputValue(), '中文资料.zip');
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
      page.on('pageerror', error => errors.push(error.message));
      await page.waitForFunction(() => Boolean(window.__TAURI_INTERNALS__));
      await until(async () => (await snapshot()).tasks.length === 2, 'History restored');
      assert.equal((await snapshot()).tasks.find(t => t.id === id).status, 'paused');
      assert.equal((await snapshot()).settings.limitKib, 256);
      assert.equal((await snapshot()).settings.connections, 32);
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
    for (const connections of [0, 3, 65]) await rejected(() => request({ action: 'settings', settings: { ...settings, connections } }), /单文件连接数/);
    const history = await readFile(path.join(root, 'history.json'));
    await mkdir(path.join(root, 'history.json.tmp'));
    await rejected(() => request({ action: 'settings', settings: { ...settings, connections: 64, concurrent: 7 } }), /保存/);
    const taskCountBeforeFailure = (await snapshot()).tasks.length;
    await rejected(() => request({ action: 'add', url: `${base}/opaque?code=fixture`, directory }), /保存/);
    assert.equal((await snapshot()).tasks.length, taskCountBeforeFailure);
    await assert.rejects(stat(path.join(directory, '自动识别.zip')), { code: 'ENOENT' });
    assert.deepEqual(await readFile(path.join(root, 'history.json')), history);
    assert.equal((await snapshot()).settings.connections, 32);
    await rmdir(path.join(root, 'history.json.tmp'));
    await request({ action: 'settings', settings: { ...settings, limitKib: 0 } });
    await goDownloads();
    await page.getByRole('button', { name: '移除 中文资料.zip', exact: true }).click();
    await page.getByRole('dialog', { name: '移除下载记录' }).getByRole('button', { name: '移除记录', exact: true }).click();
    await until(async () => !(await snapshot()).tasks.some(t => t.id === id), 'Remove only record');
    assert.equal((await stat(path.join(directory, '中文资料.zip'))).size, bytes.length);
    await request({ action: 'settings', settings: { ...settings, connections: 8, limitKib: 512 } });
    const added = await request({ action: 'add', url: `${base}/connections.zip`, name: 'connections-fixture.zip', directory });
    const largeId = added.tasks.find(t => t.name === 'connections-fixture.zip').id;
    await until(() => largePeak === 8, 'Eight simultaneous connections reach Range server');
    await request({ action: 'pause', id: largeId });
    await until(() => largeActive === 0, 'All range connections paused');
    await request({ action: 'settings', settings: { ...settings, connections: 1, limitKib: 512 } });
    largePeak = 0;
    await request({ action: 'resume', id: largeId });
    await until(() => largeActive === 1, 'Resumed with one connection');
    await sleep(2000);
    assert.equal(largePeak, 1);
    await request({ action: 'remove', id: largeId });
    await until(() => largeActive === 0, 'Connection fixture stopped');
    // Only remove the two known files created by this isolated test.
    await unlink(path.join(directory, 'connections-fixture.zip'));
    await unlink(path.join(directory, 'connections-fixture.zip.aria2'));
    await request({ action: 'settings', settings: { ...settings, limitKib: 0 } });
    await page.getByRole('button', { name: '新建下载', exact: true }).first().click();
    const automaticAdd = page.getByRole('dialog', { name: '新建下载' });
    await automaticAdd.getByPlaceholder('粘贴 HTTP / HTTPS 文件链接').fill(`${base}/opaque?code=fixture`);
    // Submit immediately, before the debounced preview has identified anything.
    await automaticAdd.getByRole('button', { name: '开始下载', exact: true }).click();
    await automaticAdd.waitFor({ state: 'hidden' });
    await until(async () => (await snapshot()).tasks.some(t => t.name === '自动识别.zip' && t.status === 'complete'), 'Paste and start without entering a name');
    await writeFile(path.join(directory, 'existing.zip'), 'keep this existing file');
    const automatic = [
      ['/opaque?code=fixture', '自动识别 (1).zip'],
      ['/existing.zip', 'existing (1).zip'],
      ['/redirect', 'redirected.zip'],
      ['/no-head.zip', 'no-head.zip'],
      ['/head-fails.zip', 'head-fails.zip'],
      ['/', 'download.bin'],
      ['/unsafe-header', 'unsafe-header'],
    ];
    for (const [endpoint, expectedName] of automatic) {
      const result = await request({ action: 'add', url: `${base}${endpoint}`, directory });
      assert.equal(result.tasks.at(-1).name, expectedName);
      await until(async () => (await snapshot()).tasks.some(t => t.name === expectedName && t.status === 'complete'), `Automatic filename: ${expectedName}`);
      assert.equal(digest(await readFile(path.join(directory, expectedName))), digest(bytes.subarray(0, 65536)));
    }
    assert.equal(digest(await readFile(path.join(directory, '自动识别.zip'))), digest(bytes.subarray(0, 65536)));
    assert.equal(await readFile(path.join(directory, 'existing.zip'), 'utf8'), 'keep this existing file');
    assert.deepEqual(JSON.parse(await readFile(arg('--data'), 'utf8')).state.notes, beforeNotes);
    await page.screenshot({ path: path.join(output, 'complete.png') });
    console.log('PASS: automatic/optional filenames, stale metadata, GET-only filename, redirects, HEAD failure, safe fallback, duplicate suffix/no overwrite, HTTP/HTTPS SHA-256, 8 connections, pause/resume, settings UI/restart/rollback, background, 404, invalid input, save failure, record-only removal, notes untouched');
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

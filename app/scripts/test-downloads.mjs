import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rmdir, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import JSZip from 'jszip';

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
let failBatchSave = false;
const mock = createServer(async (req, res) => {
  if (req.url === '/batch-fails.zip' && req.method === 'HEAD' && failBatchSave) {
    failBatchSave = false; await mkdir(path.join(process.env.PROJECTTODO_TEST_DATA_DIR, 'downloads', 'history.json.tmp'));
  }
  if (req.url === '/stop-first.zip' && req.method === 'HEAD') await sleep(1200);
  if (req.url === '/missing') { res.writeHead(404); res.end(); return; }
  if (req.url === '/redirect') { res.writeHead(302, { Location: '/redirected.zip' }); res.end(); return; }
  if (req.url === '/no-head.zip' && req.method === 'HEAD') { res.writeHead(405); res.end(); return; }
  if (req.url === '/head-fails.zip' && req.method === 'HEAD') { res.writeHead(500); res.end(); return; }
  const body = ['/large.zip', '/connections.zip'].includes(req.url) ? bytes : bytes.subarray(0, 65536);
  const large = req.url === '/connections.zip';
  const length = large ? 160 * 1024 * 1024 : body.length;
  const range = req.headers.range?.match(/bytes=(\d+)-(\d*)/);
  const start = range ? Number(range[1]) : 0;
  const end = range?.[2] ? Math.min(Number(range[2]), length - 1) : length - 1;
  if (range) ranges.push({ start, end });
  const headers = { 'Content-Type': 'application/octet-stream', 'Content-Length': end - start + 1, 'Accept-Ranges': 'bytes', ETag: '"fixture-v1"' };
  if (req.url === '/large.zip') headers['Content-Disposition'] = "attachment; filename*=UTF-8''%E4%B8%AD%E6%96%87%E8%B5%84%E6%96%99.zip";
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
const xmlEscape = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
async function workbook(prefix) {
  const zip = new JSZip();
  const main = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const relationships = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  zip.file('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>');
  zip.file('xl/workbook.xml', `<workbook xmlns="${main}" xmlns:r="${relationships}"><sheets><sheet name="链接" sheetId="1" r:id="rId1"/><sheet name="第二页" sheetId="2" r:id="rId2"/></sheets></workbook>`);
  zip.file('xl/sharedStrings.xml', `<sst xmlns="${main}"><si><t>${prefix}/unused.zip</t></si><si><t>${prefix}/shared.zip</t></si></sst>`);
  zip.file('xl/worksheets/sheet1.xml', `<worksheet xmlns="${main}" xmlns:r="${relationships}"><sheetData><row r="1"><c r="A1" t="s"><v>1</v></c><c r="B1" t="inlineStr"><is><r><t>${prefix}/</t></r><r><t>inline.zip</t></r></is></c><c r="C1" t="str"><f>HYPERLINK("${prefix}/formula.zip","下载")</f><v>下载</v></c><c r="D1" t="str"><v>点击下载</v></c><c r="E1"><f>WEBSERVICE("${prefix}/do-not-fetch")</f></c></row></sheetData><hyperlinks><hyperlink ref="D1" r:id="rIdLink"/></hyperlinks></worksheet>`);
  zip.file('xl/worksheets/_rels/sheet1.xml.rels', `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdLink" Type="${relationships}/hyperlink" Target="${xmlEscape(`${prefix}/hyperlink.zip?sig=A%2FB%3D&parts=1,2;3`)}" TargetMode="External"/></Relationships>`);
  zip.file('xl/worksheets/sheet2.xml', `<worksheet xmlns="${main}"><sheetData><row><c t="inlineStr"><is><t>${prefix}/second.zip</t></is></c></row></sheetData></worksheet>`);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
async function testImportForm(add) {
  const input = add.getByRole('textbox', { name: '下载链接', exact: true });
  const a = 'https://example.com/a.zip', b = 'https://example.com/b.zip';
  const signed = 'https://example.com/download?sig=AA%2FB%3D&parts=1,2;3&next=https://example.com/nested';
  for (const separator of [' ', '\n', '\t', ',', ';', '|', '，', '；', '、', ', ', ';\n']) {
    await input.fill(`下载这些：${a}${separator}${b} ${signed} ${a}`);
    await add.getByText('已识别 3 个链接 · 去重 1 项', { exact: true }).waitFor();
  }
  await input.fill('');
  const picker = add.getByLabel('导入链接文件');
  await picker.setInputFiles({ name: '整段.txt', mimeType: 'text/plain', buffer: Buffer.from(`（${a}），[下载](${b})；签名链接：<${signed}> https://user:password@example.com/invalid.zip https://example.com/${')'.repeat(20000)}`) });
  await until(async () => (await input.inputValue()) === [a, b, signed].join('\n'), 'Punctuation wrappers, signed query preserved, invalid URLs skipped');
  await input.fill('');
  await picker.setInputFiles([{ name: '清单.txt', mimeType: 'text/plain', buffer: Buffer.from(`说明 ${a} ${b}`) }, { name: '链接.csv', mimeType: 'text/csv', buffer: Buffer.from(`名称,链接\n下载,"${signed}"\n重复,${a}`) }]);
  await until(async () => (await input.inputValue()) === [a, b, signed].join('\n'), 'TXT/CSV merge, exact signed URL and deduplication');
  await picker.setInputFiles({ name: 'unicode.txt', mimeType: 'text/plain', buffer: Buffer.concat([Buffer.from([255, 254]), Buffer.from(`${a}\nhttps://example.com/utf16.zip`, 'utf16le')]) });
  await until(async () => (await input.inputValue()).includes('/utf16.zip'), 'UTF-16 text imported');
  const xlsx = await workbook('https://example.com');
  await picker.setInputFiles({ name: '链接.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: xlsx });
  await until(async () => (await input.inputValue()).includes('/second.zip'), 'Multi-sheet Excel import');
  const imported = (await input.inputValue()).split('\n');
  for (const name of ['shared.zip', 'inline.zip', 'formula.zip', 'hyperlink.zip?sig=A%2FB%3D&parts=1,2;3', 'second.zip']) assert.ok(imported.includes(`https://example.com/${name}`));
  assert.ok(!imported.some(url => url.includes('unused.zip') || url.includes('do-not-fetch')));
  const beforeBad = await input.inputValue();
  for (const [name, buffer, message] of [['bad.xlsx', Buffer.from('broken'), /Excel 文件/], ['legacy.xls', Buffer.from('legacy'), /旧版 .xls/], ['empty.txt', Buffer.from('没有链接'), /未找到/]]) {
    await picker.setInputFiles({ name, mimeType: 'application/octet-stream', buffer });
    await until(async () => message.test(await add.getByRole('alert').innerText()), name);
    assert.equal(await input.inputValue(), beforeBad);
  }
  const bomb = new JSZip(); bomb.file('xl/workbook.xml', '<workbook/>'); bomb.file('xl/sharedStrings.xml', 'x'.repeat(21 * 1024 * 1024));
  await picker.setInputFiles({ name: 'oversized.xlsx', mimeType: 'application/octet-stream', buffer: await bomb.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }) });
  await until(async () => /解压内容过大/.test(await add.getByRole('alert').innerText()), 'Bounded XLSX decompression');
  assert.equal(await input.inputValue(), beforeBad);
  const transfer = await page.evaluateHandle(() => { const data = new DataTransfer(); data.items.add(new File(['https://example.com/drop.zip'], 'drop.txt', { type: 'text/plain' })); return data; });
  await add.locator('.download-link-drop').dispatchEvent('drop', { dataTransfer: transfer }); await transfer.dispose();
  await until(async () => (await input.inputValue()).includes('/drop.zip'), 'File drop');
  await input.fill(Array.from({ length: 501 }, (_, index) => `https://example.com/${index}.zip`).join(' '));
  await add.getByText(/一次最多添加 500/).waitFor();
  await input.fill('');
}
async function testNativeBatch(directory) {
  await page.getByRole('button', { name: '新建下载', exact: true }).first().click();
  const add = page.getByRole('dialog', { name: '新建下载' });
  const input = add.getByRole('textbox', { name: '下载链接', exact: true });
  await testImportForm(add);
  await add.getByLabel('导入链接文件').setInputFiles({ name: 'downloads.xlsx', mimeType: 'application/octet-stream', buffer: await workbook(base) });
  await add.getByText('已识别 5 个链接', { exact: true }).waitFor();
  await add.getByRole('button', { name: '开始下载（5）', exact: true }).click();
  await add.waitFor({ state: 'hidden' });
  await until(async () => { const tasks = (await snapshot()).tasks.filter(t => ['shared.zip', 'inline.zip', 'formula.zip', 'hyperlink.zip', 'second.zip'].includes(t.name)); return tasks.length === 5 && tasks.every(t => t.status === 'complete'); }, 'Excel batch completes');
  for (const name of ['shared.zip', 'inline.zip', 'formula.zip', 'hyperlink.zip', 'second.zip']) assert.equal(digest(await readFile(path.join(directory, name))), digest(bytes.subarray(0, 65536)));
  await page.getByRole('button', { name: '新建下载', exact: true }).first().click();
  await input.fill(`${base}/batch-ok.zip,${base}/batch-fails.zip`);
  failBatchSave = true;
  await add.getByRole('button', { name: '开始下载（2）', exact: true }).click();
  await add.getByText(/已加入 1 项，输入框保留 1 项未添加链接/).waitFor();
  assert.equal(await input.inputValue(), `${base}/batch-fails.zip`);
  await rmdir(path.join(process.env.PROJECTTODO_TEST_DATA_DIR, 'downloads', 'history.json.tmp'));
  await add.getByRole('button', { name: '开始下载', exact: true }).click();
  await add.waitFor({ state: 'hidden' });
  assert.equal((await snapshot()).tasks.filter(t => t.name === 'batch-ok.zip').length, 1);
  await page.getByRole('button', { name: '新建下载', exact: true }).first().click();
  await input.fill(`${base}/stop-first.zip；${base}/stop-second.zip`);
  await add.getByRole('button', { name: '开始下载（2）', exact: true }).click();
  await add.getByRole('button', { name: '停止添加', exact: true }).click();
  await add.getByText(/已加入 1 项，输入框保留 1 项未添加链接/).waitFor();
  assert.equal(await input.inputValue(), `${base}/stop-second.zip`);
  assert.equal((await snapshot()).tasks.some(t => t.name === 'stop-second.zip'), false);
  await add.getByRole('button', { name: '取消', exact: true }).click();
}
async function testDownloadSelectors(preferences) {
  for (const [label, values] of [['同时下载数', ['1','2','3','4','5','6','7','8']], ['单文件分片数', ['1','4','8','16','32','64']]]) {
    const trigger = preferences.getByRole('combobox', { name: label, exact: true });
    await trigger.click();
    const menu = preferences.getByRole('listbox', { name: label, exact: true });
    await menu.waitFor();
    assert.deepEqual(await menu.getByRole('option').evaluateAll(items => items.map(item => item.dataset.value)), values);
    assert.equal(await menu.evaluate(node => node.closest('dialog')?.open), true, 'Menu is inside the modal top layer');
    for (const option of await menu.getByRole('option').all()) {
      await option.scrollIntoViewIfNeeded();
      assert.equal(await option.evaluate(node => { const rect = node.getBoundingClientRect(); return node.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)); }), true, `${label} option is not covered or clipped`);
    }
    await page.screenshot({ path: path.join(output, label === '同时下载数' ? 'concurrent-open.png' : 'split-open.png') });
    await trigger.press('Escape');
    await menu.waitFor({ state: 'hidden' });
    assert.equal(await preferences.isVisible(), true, 'Escape only closes the menu');
  }
  const connections = preferences.getByRole('combobox', { name: '单文件分片数', exact: true });
  const concurrent = preferences.getByRole('combobox', { name: '同时下载数', exact: true });
  await connections.click();
  await preferences.getByRole('option', { name: '64 分片', exact: true }).click();
  assert.equal(await connections.innerText(), '64 分片');
  assert.equal(await concurrent.innerText(), '3 个文件');
  await connections.press('ArrowDown');
  await preferences.getByRole('listbox', { name: '单文件分片数', exact: true }).waitFor();
  await connections.press('Home');
  await until(async () => (await connections.getAttribute('aria-activedescendant'))?.endsWith('-0'), 'Home activates the first split option');
  await connections.press('Enter');
  await until(async () => (await connections.innerText()) === '1（不分片）', 'Keyboard selection is rendered');
  await connections.click();
  await concurrent.click();
  assert.equal(await preferences.getByRole('listbox', { name: '单文件分片数', exact: true }).count(), 0);
  await preferences.getByRole('option', { name: '8 个文件', exact: true }).click();
  assert.equal(await concurrent.innerText(), '8 个文件');
  await concurrent.click(); await concurrent.press('Tab');
  assert.equal(await preferences.getByRole('listbox').count(), 0, 'Tab closes menu');
  await connections.click(); await preferences.getByRole('spinbutton').click();
  assert.equal(await preferences.getByRole('listbox').count(), 0, 'Outside click closes menu');
  await concurrent.click(); await preferences.getByRole('option', { name: '3 个文件', exact: true }).click();
  await connections.click(); await preferences.getByRole('option', { name: '4 分片', exact: true }).click();
}
try {
  if (native) {
    assert.ok(process.env.PROJECTTODO_TEST_DATA_DIR && path.resolve(arg('--data')).startsWith(path.resolve(process.env.PROJECTTODO_TEST_DATA_DIR) + path.sep));
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${arg('--cdp')}`); page = browser.contexts()[0].pages()[0];
  } else {
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    page = await browser.newPage({ viewport: { width: 1538, height: 840 }, timezoneId: 'Asia/Shanghai' });
    await page.addInitScript(() => localStorage.setItem('project-todo-app', JSON.stringify({ version: 12, state: { settings: { updateCheck: { checkOnStartup: false, autoCheck: false, checkInterval: 60 } } } })));
    await page.goto('http://127.0.0.1:52923/');
  }
  page.on('pageerror', error => errors.push(error.message));
  await goDownloads();
  if (!native) {
    await page.getByRole('button', { name: '新建下载', exact: true }).first().click();
    const add = page.getByRole('dialog', { name: '新建下载' });
    assert.equal(await add.getByRole('textbox', { name: '另存为（可选）', exact: true }).count(), 0);
    assert.equal(await add.getByRole('button', { name: '识别文件', exact: true }).count(), 0);
    assert.equal(await add.getByRole('button', { name: '重命名', exact: true }).count(), 0);
    await testImportForm(add);
    assert.equal(await add.getByRole('button', { name: '开始下载' }).isDisabled(), true);
    await add.screenshot({ path: path.join(output, 'add.png') });
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '下载设置', exact: true }).click();
    const preferences = page.getByRole('dialog', { name: '下载设置' });
    await testDownloadSelectors(preferences);
    for (const height of [668, 500]) {
      await page.setViewportSize({ width: 1480, height });
      const trigger = preferences.getByRole('combobox', { name: '同时下载数', exact: true });
      await trigger.click();
      const menu = preferences.getByRole('listbox', { name: '同时下载数', exact: true });
      await until(async () => menu.evaluate(node => { const r = node.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && r.width > 0; }), `Menu stays inside ${height}px viewport`);
      await preferences.getByRole('option', { name: '8 个文件', exact: true }).click();
      await trigger.click(); await preferences.getByRole('option', { name: '3 个文件', exact: true }).click();
    }
    await page.setViewportSize({ width: 1538, height: 840 });
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
    await page.getByRole('button', { name: '展开/收起筛选', exact: true }).click();
    const priority = page.getByRole('combobox', { name: '筛选优先级', exact: true });
    await priority.click();
    const priorityMenu = page.getByRole('listbox', { name: '筛选优先级', exact: true });
    assert.equal(await priorityMenu.evaluate(node => node.parentElement === document.body), true, 'Non-modal menus still use the body portal');
    await priorityMenu.getByRole('option', { name: '高', exact: true }).click();
    assert.equal(await priority.innerText(), '高');
    await page.getByRole('button', { name: '清空筛选', exact: true }).click();
    await page.getByRole('button', { name: '随记中心', exact: true }).click();
    await page.locator('.notes-main-root').waitFor();
    console.log('PASS: selector pointer/keyboard/Escape/Tab/outside dismissal, 668/500px menu bounds, modal and body portals, browser preview guard, 8 themes, 5 widths, dialogs, three-way navigation');
  } else {
    await until(async () => !(await page.getByRole('button', { name: '新建下载', exact: true }).first().isDisabled()), 'Native ready');
    let state = await snapshot();
    const directory = state.settings.directory;
    const root = path.join(process.env.PROJECTTODO_TEST_DATA_DIR, 'downloads');
    assert.equal(state.settings.connections, 4);
    await page.getByRole('button', { name: '下载设置', exact: true }).click();
    const preferences = page.getByRole('dialog', { name: '下载设置' });
    await testDownloadSelectors(preferences);
    await preferences.getByRole('combobox', { name: '单文件分片数', exact: true }).click();
    await preferences.getByRole('option', { name: '32 分片', exact: true }).click();
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
    await add.getByRole('textbox', { name: '下载链接', exact: true }).fill(`${base}/large.zip`);
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
    for (let sample = 0; sample < 4; sample++) {
      const paused = (await snapshot()).tasks.find(t => t.id === largeId);
      assert.equal(paused.status, 'paused');
      assert.equal(paused.speed, 0, 'Paused tasks never contribute a stale speed to the total');
      await sleep(500);
    }
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
    await automaticAdd.getByRole('textbox', { name: '下载链接', exact: true }).fill(`${base}/opaque?code=fixture`);
    // Submit directly without any filename field.
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
    await testNativeBatch(directory);
    assert.deepEqual(JSON.parse(await readFile(arg('--data'), 'utf8')).state.notes, beforeNotes);
    await page.screenshot({ path: path.join(output, 'complete.png') });
    console.log('PASS: batch paste/file import/retry/stop, automatic filenames, GET-only filename, redirects, HEAD failure, safe fallback, duplicate suffix/no overwrite, HTTP/HTTPS SHA-256, 8 connections, pause/resume, settings UI/restart/rollback, background, 404, invalid input, save failure, record-only removal, notes untouched');
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

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
let previewStorageFallbacks = 0;
const captureConsole = message => {
  if (message.type() !== 'error') return;
  const text = message.text();
  // Existing browser-only portable-save fallback in appStore; native runs must never emit it.
  if (!native && text.startsWith("Failed to save portable data TypeError: Cannot read properties of undefined (reading 'invoke')") && text.includes('/src/state/appStore.ts')) { previewStorageFallbacks++; return; }
  errors.push(text);
};
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
async function testFavoriteDirectories(directory) {
  const favorites = [path.join(directory, '常用 资料'), path.join(directory, '软件安装包')];
  const history = path.join(process.env.PROJECTTODO_TEST_DATA_DIR, 'downloads', 'history.json');
  await page.getByRole('button', { name: '新建下载', exact: true }).first().click();
  const add = page.getByRole('dialog', { name: '新建下载' });
  const input = add.getByRole('textbox', { name: '保存到', exact: true });
  for (const favorite of favorites) {
    await input.fill(favorite);
    await add.getByRole('button', { name: '记为常用', exact: true }).click();
    await add.getByRole('button', { name: '已记为常用', exact: true }).waitFor();
    assert.equal((await snapshot()).settings.directory, directory, 'Remembering does not change the default');
  }
  await add.getByRole('button', { name: `使用常用目录 ${favorites[0]}`, exact: true }).click();
  assert.equal(await input.inputValue(), favorites[0]);
  await request({ action: 'favoriteDirectory', directory: favorites[0].toUpperCase().replaceAll('\\', '/') + '/', favorite: true });
  assert.deepEqual((await snapshot()).favoriteDirectories, favorites, 'Duplicate paths are ignored');
  const before = await readFile(history);
  await mkdir(`${history}.tmp`);
  await input.fill(path.join(directory, '写入失败'));
  await add.getByRole('button', { name: '记为常用', exact: true }).click();
  await add.getByRole('alert').filter({ hasText: '保存' }).waitFor();
  assert.deepEqual((await snapshot()).favoriteDirectories, favorites);
  assert.deepEqual(await readFile(history), before);
  await add.getByRole('button', { name: `移除常用目录 ${favorites[0]}`, exact: true }).click();
  await add.getByRole('alert').filter({ hasText: '保存' }).waitFor();
  assert.deepEqual((await snapshot()).favoriteDirectories, favorites);
  await rmdir(`${history}.tmp`);
  await input.fill('relative/path');
  await add.getByRole('button', { name: '记为常用', exact: true }).click();
  await add.getByRole('alert').filter({ hasText: '绝对' }).waitFor();
  await add.getByRole('button', { name: `移除常用目录 ${favorites[1]}`, exact: true }).click();
  await until(async () => (await snapshot()).favoriteDirectories.length === 1, 'Remove favorite');
  await input.fill(favorites[1]);
  await add.getByRole('button', { name: '记为常用', exact: true }).click();
  await add.getByRole('button', { name: '已记为常用', exact: true }).waitFor();
  await add.screenshot({ path: path.join(output, 'favorite-directories.png') });
  await add.getByRole('button', { name: '取消', exact: true }).click();
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('tab', { name: '下载', exact: true }).click();
  const preferences = page.getByRole('dialog', { name: '设置', exact: true });
  await preferences.getByRole('button', { name: `使用常用目录 ${favorites[0]}`, exact: true }).click();
  assert.equal(await preferences.getByRole('textbox', { name: '默认保存目录', exact: true }).inputValue(), favorites[0]);
  await preferences.getByRole('button', { name: '关闭设置', exact: true }).click();
  assert.equal((await snapshot()).settings.directory, directory);
  return favorites;
}
async function testBatchControls(directory) {
  const settings = (await snapshot()).settings;
  const history = path.join(process.env.PROJECTTODO_TEST_DATA_DIR, 'downloads', 'history.json');
  const addTask = async (endpoint, name) => (await request({ action: 'add', url: `${base}/${endpoint}`, name, directory })).tasks.find(task => task.name === name);
  await request({ action: 'settings', settings: { ...settings, limitKib: 0 } });
  const complete = await addTask('small.zip', '批量操作-完成.zip');
  await until(async () => (await snapshot()).tasks.find(task => task.id === complete.id)?.status === 'complete', 'Completed fixture');
  await request({ action: 'settings', settings: { ...settings, concurrent: 1, limitKib: 32 } });
  const first = await addTask('large.zip', '批量操作-第一项.zip');
  const second = await addTask('large.zip', '批量操作-第二项.zip');
  const untouched = await addTask('large.zip', '不选中的任务.zip');
  await until(async () => (await snapshot()).tasks.find(task => task.id === first.id)?.completed > 0, 'First batch file has real bytes');
  const search = page.getByRole('textbox', { name: '搜索下载文件', exact: true });
  await search.fill('批量操作-');
  const all = page.getByRole('checkbox', { name: '全选当前列表', exact: true });
  await page.getByRole('checkbox', { name: `选择 ${first.name}`, exact: true }).check();
  assert.equal(await all.evaluate(node => node.indeterminate), true);
  await all.check();
  await page.getByRole('button', { name: '批量暂停', exact: true }).click();
  await page.getByText('暂停成功 2 项', { exact: true }).waitFor();
  let tasks = (await snapshot()).tasks;
  assert.ok([first, second].every(item => tasks.find(task => task.id === item.id).status === 'paused'));
  assert.ok(['active', 'waiting'].includes(tasks.find(task => task.id === untouched.id).status), 'Unselected task keeps running');
  assert.equal(tasks.find(task => task.id === complete.id).status, 'complete');
  await request({ action: 'pause', id: untouched.id });
  const failed = await addTask('missing', '批量操作-失败.zip');
  await until(async () => (await snapshot()).tasks.find(task => task.id === failed.id)?.status === 'error', 'Failed fixture');
  await page.getByRole('checkbox', { name: `选择 ${first.name}`, exact: true }).check();
  await page.getByRole('navigation', { name: '下载分类' }).getByRole('button', { name: /^已暂停/ }).click();
  await page.getByText('已选 0 项', { exact: true }).waitFor();
  await page.getByRole('navigation', { name: '下载分类' }).getByRole('button', { name: /^全部下载/ }).click();
  await page.getByRole('checkbox', { name: `选择 ${failed.name}`, exact: true }).waitFor();
  await all.check();
  await page.getByText('已选 4 项', { exact: true }).waitFor();
  // Make one resume fail safely, while another selected task can still start.
  // A failed record without a control file exercises the native retry guard.
  await writeFile(path.join(directory, failed.name), 'keep failed target');
  await page.getByRole('button', { name: '批量开始', exact: true }).click();
  await page.getByText('开始成功 2 项 · 失败 1 项，可重新操作', { exact: true }).waitFor();
  await page.getByText('查看失败原因', { exact: true }).click();
  await page.getByText(/批量操作-失败.zip：.*目标文件已存在/).waitFor();
  assert.equal(await page.getByRole('checkbox', { name: `选择 ${failed.name}`, exact: true }).isChecked(), true);
  assert.equal(await readFile(path.join(directory, failed.name), 'utf8'), 'keep failed target');
  // Pause again before exercising failed and cancelled removals.
  await all.check();
  await page.getByRole('button', { name: '批量暂停', exact: true }).click();
  await page.getByText('暂停成功 2 项', { exact: true }).waitFor();
  await all.check();
  await page.screenshot({ path: path.join(output, 'batch-selected.png') });
  await page.getByRole('button', { name: '批量删除', exact: true }).click();
  const remove = page.getByRole('dialog', { name: '批量删除下载记录', exact: true });
  await remove.getByText(/已下载的文件和续传文件会保留/).waitFor();
  await remove.getByRole('button', { name: '取消', exact: true }).click();
  assert.ok((await snapshot()).tasks.some(task => task.id === first.id));
  const savedHistory = await readFile(history);
  await mkdir(`${history}.tmp`);
  await page.getByRole('button', { name: '批量删除', exact: true }).click();
  await remove.getByRole('button', { name: '删除 4 项记录', exact: true }).click();
  await page.getByText('删除记录成功 0 项 · 失败 4 项，可重新操作', { exact: true }).waitFor();
  assert.deepEqual(await readFile(history), savedHistory);
  tasks = (await snapshot()).tasks;
  assert.ok([first, second, complete, failed].every(item => tasks.some(task => task.id === item.id)));
  await rmdir(`${history}.tmp`);
  const preserved = [path.join(directory, first.name), path.join(directory, `${first.name}.aria2`), path.join(directory, complete.name), path.join(directory, failed.name)];
  const hashes = await Promise.all(preserved.map(async file => digest(await readFile(file))));
  await page.getByRole('button', { name: '批量删除', exact: true }).click();
  await remove.getByRole('button', { name: '删除 4 项记录', exact: true }).click();
  await page.getByText('删除记录成功 4 项', { exact: true }).waitFor();
  tasks = (await snapshot()).tasks;
  assert.ok([first, second, complete, failed].every(item => !tasks.some(task => task.id === item.id)));
  assert.ok(tasks.some(task => task.id === untouched.id));
  assert.deepEqual(await Promise.all(preserved.map(async file => digest(await readFile(file)))), hashes, 'Completed files, partial files and resume controls survive deletion');
  await search.fill('');
  await request({ action: 'remove', id: untouched.id });
  await request({ action: 'settings', settings });
}
async function testDownloadSelectors(preferences) {
  for (const [label, values] of [['同时下载数', ['1','2','3','4','5','6','7','8']], ['单文件分片数', ['1','4','8','16','32','64']]]) {
    const trigger = preferences.getByRole('combobox', { name: label, exact: true });
    await trigger.click();
    const menu = preferences.getByRole('listbox', { name: label, exact: true });
    await menu.waitFor();
    assert.deepEqual(await menu.getByRole('option').evaluateAll(items => items.map(item => item.dataset.value)), values);
    assert.equal(await menu.evaluate(node => !!node.closest('dialog[open], [role=dialog]')), true, 'Menu is inside the modal top layer');
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
  // Keep the pointer off the reopened menu while testing keyboard-only selection.
  await page.mouse.move(0, 0);
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
  page.on('console', captureConsole);
  await goDownloads();
  assert.equal(await page.title(), 'app');
  assert.equal(await page.locator('vite-error-overlay').count(), 0);
  if (!native) {
    assert.equal(page.url(), 'http://127.0.0.1:52923/');
    await page.evaluate(async () => {
      const { useDownloadStore } = await import('/src/state/downloadStore.ts');
      useDownloadStore.setState({ favoriteDirectories: ['C:\\下载\\项目资料', 'D:\\安装包', 'D:\\下载\\一个用于验证长目录名称能够完整悬停查看且不会挤压操作按钮的常用资料目录'],
        tasks: ['active', 'waiting', 'paused', 'error', 'complete'].map((status, index) => ({ id: `layout-${index}`, url: 'https://example.com/fixture.zip', name: `界面检查-${status}.zip`, directory: 'C:\\下载\\项目资料', status, total: 1048576, completed: 524288, speed: status === 'active' ? 32768 : 0, error: '', createdAt: 0, finishedAt: null })) });
    });
    const batchBounds = () => page.locator('.download-batch-toolbar, .download-batch-actions > button, .download-list').evaluateAll(nodes => nodes.map(node => {
      const { x, y, width, height } = node.getBoundingClientRect(); return { x, y, width, height };
    }));
    for (const width of [900, 1100, 1280, 1538, 1920]) {
      await page.setViewportSize({ width, height: 840 });
      const beforeSelection = await batchBounds();
      await page.getByRole('checkbox', { name: '选择 界面检查-active.zip', exact: true }).check();
      assert.deepEqual(await batchBounds(), beforeSelection, `Single selection must not shift layout at ${width}`);
      await page.getByRole('checkbox', { name: '全选当前列表', exact: true }).check();
      assert.deepEqual(await batchBounds(), beforeSelection, `Select all must not shift layout at ${width}`);
      await page.getByRole('checkbox', { name: '全选当前列表', exact: true }).uncheck();
      assert.deepEqual(await batchBounds(), beforeSelection, `Deselect must not shift layout at ${width}`);
    }
    await page.setViewportSize({ width: 1538, height: 840 });
    await page.getByRole('checkbox', { name: '选择 界面检查-active.zip', exact: true }).check();
    assert.equal(await page.getByRole('checkbox', { name: '全选当前列表', exact: true }).evaluate(node => node.indeterminate), true);
    await page.getByRole('checkbox', { name: '全选当前列表', exact: true }).check();
    await page.getByText('已选 5 项', { exact: true }).waitFor();
    await page.getByRole('button', { name: '批量开始', exact: true }).waitFor();
    await page.getByRole('button', { name: '批量暂停', exact: true }).waitFor();
    await page.screenshot({ path: path.join(output, 'batch-selected.png') });
    await page.getByRole('textbox', { name: '搜索下载文件' }).fill('active');
    await page.getByText('已选 0 项', { exact: true }).waitFor();
    await page.getByRole('checkbox', { name: '全选当前列表', exact: true }).check();
    await page.getByText('已选 1 项', { exact: true }).waitFor();
    await page.getByRole('textbox', { name: '搜索下载文件' }).fill('');
    await page.getByRole('button', { name: '新建下载', exact: true }).first().click();
    const add = page.getByRole('dialog', { name: '新建下载' });
    await add.getByRole('button', { name: '使用常用目录 D:\\安装包', exact: true }).click();
    assert.equal(await add.getByRole('textbox', { name: '保存到', exact: true }).inputValue(), 'D:\\安装包');
    await add.getByRole('button', { name: '已记为常用', exact: true }).waitFor();
    await add.screenshot({ path: path.join(output, 'favorite-directories.png') });
    assert.equal(await add.getByRole('textbox', { name: '另存为（可选）', exact: true }).count(), 0);
    assert.equal(await add.getByRole('button', { name: '识别文件', exact: true }).count(), 0);
    assert.equal(await add.getByRole('button', { name: '重命名', exact: true }).count(), 0);
    await testImportForm(add);
    assert.equal(await add.getByRole('button', { name: '开始下载' }).isDisabled(), true);
    await add.screenshot({ path: path.join(output, 'add.png') });
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('tab', { name: '下载', exact: true }).click();
    const preferences = page.getByRole('dialog', { name: '设置', exact: true });
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
      assert.equal(await page.locator('.download-batch-toolbar').evaluate(node => node.scrollWidth <= node.clientWidth), true, `Batch toolbar fits ${width}`);
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
    console.log('PASS: favorites quick selection, mixed-status selection counts, search-scoped selection, selector pointer/keyboard/Escape/Tab/outside dismissal, 668/500px menu bounds, modal and body portals, browser preview guard, 8 themes, 5 widths, dialogs, three-way navigation');
  } else {
    await until(async () => !(await page.getByRole('button', { name: '新建下载', exact: true }).first().isDisabled()), 'Native ready');
    let state = await snapshot();
    const directory = state.settings.directory;
    const root = path.join(process.env.PROJECTTODO_TEST_DATA_DIR, 'downloads');
    const favorites = await testFavoriteDirectories(directory);
    assert.equal(state.settings.connections, 4);
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('tab', { name: '下载', exact: true }).click();
    const preferences = page.getByRole('dialog', { name: '设置', exact: true });
    await testDownloadSelectors(preferences);
    await preferences.getByRole('combobox', { name: '单文件分片数', exact: true }).click();
    await preferences.getByRole('option', { name: '32 分片', exact: true }).click();
    await preferences.getByRole('button', { name: '保存设置', exact: true }).click();
    const savedToast = page.locator('.toast-item').filter({ hasText: '下载设置已保存' });
    await savedToast.waitFor();
    await savedToast.evaluate(node => Promise.all(node.getAnimations().map(animation => animation.finished)));
    const toastBounds = await savedToast.evaluate(node => {
      const rect = node.getBoundingClientRect();
      const titleBottom = document.querySelector('.desktop-titlebar').getBoundingClientRect().bottom;
      return { top: rect.top, bottom: rect.bottom, titleBottom, viewport: innerHeight,
        topVisible: node.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + 2)) };
    });
    await page.screenshot({ path: path.join(output, 'settings-saved-toast.png') });
    await writeFile(path.join(output, 'settings-saved-toast.json'), JSON.stringify(toastBounds));
    assert.ok(toastBounds.top >= toastBounds.titleBottom + 12 && toastBounds.bottom <= toastBounds.viewport && toastBounds.topVisible, 'Saved toast is fully visible below desktop controls');
    await sleep(3200);
    assert.equal(await savedToast.isVisible(), true, 'Saved message remains readable after three seconds');
    await savedToast.waitFor({ state: 'hidden', timeout: 3000 });
    await preferences.getByRole('button', { name: '关闭设置', exact: true }).click();
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
      // Seed the old release's failed-task format only after the isolated EXE exits.
      // This is intentionally still a verbatim Windows path in history.json.
      const legacyDirectory = path.join(directory, '历史下载 中文 空格');
      await mkdir(legacyDirectory);
      const legacyId = 'fedcba9876543210', legacyName = 'legacy-retry.zip';
      const savedHistory = JSON.parse(await readFile(path.join(root, 'history.json'), 'utf8'));
      assert.equal(savedHistory.tasks.some(task => task.id === legacyId), false);
      savedHistory.tasks.push({ id: legacyId, name: legacyName, url: `${base}/small.zip`,
        directory: path.toNamespacedPath(legacyDirectory), status: 'error', total: 65536,
        completed: 0, speed: 0, error: '文件写入失败，请检查权限和磁盘', createdAt: Date.now(), finishedAt: null });
      await writeFile(path.join(root, 'history.json'), JSON.stringify(savedHistory));
      restarted = spawn(path.resolve(arg('--executable')), [], { cwd: path.dirname(path.resolve(arg('--executable'))), env: process.env, windowsHide: true, stdio: 'ignore' });
      await until(async () => { try { return (await fetch(`http://127.0.0.1:${arg('--cdp')}/json/version`)).ok; } catch { return false; } }, 'Native restart', 30000);
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${arg('--cdp')}`); page = browser.contexts()[0].pages()[0];
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', captureConsole);
      await page.waitForFunction(() => Boolean(window.__TAURI_INTERNALS__));
      await until(async () => (await snapshot()).tasks.length === 3, 'History restored');
      assert.deepEqual((await snapshot()).favoriteDirectories, favorites, 'Favorites survive native restart');
      assert.equal((await snapshot()).tasks.find(t => t.id === id).status, 'paused');
      assert.equal((await snapshot()).settings.limitKib, 256);
      assert.equal((await snapshot()).settings.connections, 32);
      assert.equal((await snapshot()).tasks.find(task => task.id === legacyId).status, 'error');
      await goDownloads();
      await page.getByRole('button', { name: `重试 ${legacyName}`, exact: true }).click();
      await until(async () => (await snapshot()).tasks.find(task => task.id === legacyId).status === 'complete', 'Legacy verbatim-path record retries in place');
      assert.equal(digest(await readFile(path.join(legacyDirectory, legacyName))), digest(bytes.subarray(0, 65536)));
      assert.equal((await snapshot()).tasks.find(task => task.id === legacyId).directory, path.toNamespacedPath(legacyDirectory));
      await page.screenshot({ path: path.join(output, 'legacy-path-retry.png') });
      await rejected(() => request({ action: 'add', url: `${base}/small.zip`, name: legacyName, directory: legacyDirectory }), /同名/);
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
    await testBatchControls(directory);
    await page.getByRole('button', { name: '新建下载', exact: true }).first().click();
    const favoriteAdd = page.getByRole('dialog', { name: '新建下载', exact: true });
    await favoriteAdd.getByRole('textbox', { name: '下载链接', exact: true }).fill(`${base}/favorite-destination.zip`);
    await favoriteAdd.getByRole('button', { name: `使用常用目录 ${favorites[0]}`, exact: true }).click();
    await favoriteAdd.getByRole('button', { name: '开始下载', exact: true }).click();
    await favoriteAdd.waitFor({ state: 'hidden' });
    await until(async () => (await snapshot()).tasks.some(task => task.name === 'favorite-destination.zip' && task.status === 'complete'), 'Download into favorite directory');
    assert.equal(digest(await readFile(path.join(favorites[0], 'favorite-destination.zip'))), digest(bytes.subarray(0, 65536)));
    assert.deepEqual(JSON.parse(await readFile(arg('--data'), 'utf8')).state.notes, beforeNotes);
    await page.screenshot({ path: path.join(output, 'complete.png') });
    console.log('PASS: legacy verbatim-path retry/hash/no overwrite, batch paste/file import/retry/stop, automatic filenames, GET-only filename, redirects, HEAD failure, safe fallback, duplicate suffix/no overwrite, HTTP/HTTPS SHA-256, 8 connections, pause/resume, settings UI/restart/rollback, background, 404, invalid input, save failure, record-only removal, notes untouched');
  }
  assert.deepEqual(errors, []);
  await writeFile(path.join(output, 'result.json'), JSON.stringify({ result: 'PASS', native, ranges, errors, previewStorageFallbacks }, null, 2));
} catch (error) {
  await page?.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
  throw error;
} finally {
  if (restarted) {
    try { await Promise.race([page.evaluate(() => window.__TAURI_INTERNALS__.invoke('plugin:process|exit', { code: 0 })).catch(() => {}), sleep(3000)]); } catch { /* already closed */ }
    await sleep(2500); if (restarted.exitCode === null) restarted.kill();
  }
  await browser?.close().catch(() => {});
  mock.closeAllConnections(); await new Promise(resolve => mock.close(resolve));
}

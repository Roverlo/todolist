import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, readdir, rename, rmdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { chromium } from 'playwright';

const arg = name => process.argv[process.argv.indexOf(name) + 1];
const port = arg('--cdp'), data = resolve(arg('--data')), target = resolve(arg('--executable'));
const version = arg('--version'), root = dirname(target);
assert.equal(dirname(data), resolve(process.env.PROJECTTODO_TEST_DATA_DIR), 'Use the isolated test-portable.ps1 wrapper');
const next = await readFile(arg('--candidate'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const originalHash = hash(await readFile(target));
const invalidPe = Buffer.alloc(512); invalidPe.write('MZ'); invalidPe.writeUInt32LE(64, 60); invalidPe.write('PE\0\0', 64); invalidPe.writeUInt16LE(0x8664, 68);
const transfer = Buffer.alloc(8 * 1024 * 1024, 87);
const ranges = [];
let mode = 'good';
const fixture = createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.url === '/transfer.bin') {
        const range = /bytes=(\d+)-(\d*)/.exec(req.headers.range ?? '');
        const start = range ? Number(range[1]) : 0, end = range?.[2] ? Number(range[2]) : transfer.length - 1;
        if (range) { ranges.push(start); res.statusCode = 206; res.setHeader('Content-Range', `bytes ${start}-${end}/${transfer.length}`); }
        res.setHeader('Accept-Ranges', 'bytes'); res.setHeader('Content-Length', end - start + 1);
        return res.end(req.method === 'HEAD' ? undefined : transfer.subarray(start, end + 1));
    }
    if (req.url === '/versions.json') {
        const release = { version, releaseDate: '2026-09-30', downloadUrl: '/update.exe', releaseNotes: '隔离测试：便携版应用内升级', mandatory: false,
            sha256: mode === 'hash' ? '0'.repeat(64) : hash(mode === 'invalid-pe' ? invalidPe : next), size: mode === 'invalid-pe' ? invalidPe.length : next.length };
        if (mode === 'missing') delete release.sha256;
        res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ latest: version, versions: [release] }));
    }
    if (req.url !== '/update.exe' || mode === 'http') { res.statusCode = 503; return res.end(); }
    const bytes = mode === 'invalid-pe' ? invalidPe : mode === 'size' ? next.subarray(0, 512) : next;
    res.setHeader('Content-Length', bytes.length);
    if (mode === 'slow') {
        let offset = 0;
        const timer = setInterval(() => { res.write(bytes.subarray(offset, offset + 8192)); offset += 8192; if (offset >= bytes.length) { clearInterval(timer); res.end(); } }, 40);
        res.on('close', () => clearInterval(timer)); return;
    }
    res.end(bytes);
});
await new Promise(resolve => fixture.listen(0, '127.0.0.1', resolve));
const serverUrl = `http://127.0.0.1:${fixture.address().port}`;
let browser, page;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, timeout = 15000) {
    const end = Date.now() + timeout;
    for (;;) { try { await check(); return; } catch (error) { if (Date.now() >= end) throw error; } await wait(100); }
}
async function connect() {
    await until(async () => {
        browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 2500 });
        page = browser.contexts()[0].pages()[0]; assert.ok(page);
        await page.getByTitle('切换到待办事项', { exact: true }).waitFor({ timeout: 3000 });
    }, 45000);
}
const call = (name, args = {}) => page.evaluate(({ name, args }) => window.__TAURI_INTERNALS__.invoke(name, args), { name, args });
const prepare = () => page.evaluate(async ({ serverUrl, version }) => {
    const id = window.__TAURI_INTERNALS__.transformCallback(() => {});
    try { await window.__TAURI_INTERNALS__.invoke('prepare_portable_update', { serverUrl, version, progress: `__CHANNEL__:${id}` }); return 'ready'; }
    catch (error) { return String(error); }
    finally { window.__TAURI_INTERNALS__.unregisterCallback(id); }
}, { serverUrl, version });
const stages = () => readdir(root).then(names => names.filter(name => name.startsWith('.projecttodo-update-')));
const results = [];
try {
    await connect();
    for (const [failure, expected] of [['missing', '缺少'], ['hash', '校验不通过'], ['size', '大小'], ['http', '503']]) {
        mode = failure; assert.ok((await prepare()).includes(expected), failure);
        assert.equal(hash(await readFile(target)), originalHash); assert.deepEqual(await stages(), []);
        results.push(`${failure}: rejected before replacing executable`);
    }
    console.log('PASS: missing checksum, corrupt file, wrong size, HTTP failure');
    mode = 'slow'; const cancelled = prepare();
    await until(async () => assert.equal((await stages()).length, 1));
    await call('cancel_portable_update'); assert.ok((await cancelled).includes('取消'));
    assert.deepEqual(await stages(), []); results.push('cancel: staging removed, executable unchanged');

    // A checksum-valid non-runnable PE exercises actual replacement and rollback.
    mode = 'invalid-pe'; assert.equal(await prepare(), 'ready');
    const failedStage = join(root, (await stages())[0]);
    await call('install_portable_update').catch(() => {});
    await until(async () => assert.match(await readFile(join(failedStage, 'result.txt'), 'utf8'), /已恢复旧版/), 45000);
    await browser.close(); await connect();
    assert.equal(hash(await readFile(target)), originalHash);
    assert.equal(hash(await readFile(join(failedStage, 'previous.exe'))), originalHash);
    const rollbackBackup = (await readFile(join(failedStage, 'data-backup.txt'), 'utf8')).trim();
    assert.equal(JSON.parse(await readFile(join(rollbackBackup, 'data.json'), 'utf8')).state.notes[0].id, 'portable-check');
    results.push('launch failure: old executable restored and actually restarted, data backup verified');

    console.log('PASS: actual replacement, failed launch, rollback and restart');
    // Normal UI entry, including the failed-save guard before restart.
    mode = 'good';
    const reminder = page.getByRole('button', { name: '我知道了', exact: true }); if (await reminder.isVisible()) await reminder.click();
    await page.getByTitle('切换到待办事项', { exact: true }).click();
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('button', { name: 'ℹ️ 关于', exact: true }).click();
    await page.getByLabel('服务器地址', { exact: true }).fill(serverUrl);
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await until(async () => assert.match(await page.locator('#update-server-feedback').innerText(), /地址已保存/));
    await page.getByRole('button', { name: '检查更新', exact: true }).click();
    let modal = page.getByRole('dialog', { name: '软件更新', exact: true });
    await modal.getByRole('button', { name: '下载更新', exact: true }).click();
    await modal.getByRole('button', { name: '重启更新', exact: true }).waitFor();
    await page.screenshot({ path: join(root, 'ready.png') });
    await rename(data, data + '.before-write-fault'); await mkdir(data);
    try {
        await modal.getByRole('button', { name: '重启更新', exact: true }).click();
        await until(async () => assert.match(await modal.getByRole('alert').innerText(), /无法写入数据/));
        assert.equal(hash(await readFile(target)), originalHash);
    } finally { await rmdir(data); await rename(data + '.before-write-fault', data); }
    results.push('save failure: restart blocked, old process and executable retained');
    await modal.getByRole('button', { name: '暂不更新', exact: true }).click();
    await page.getByRole('switch', { name: '启动时检查更新', exact: true }).check();
    await page.keyboard.press('Escape');
    await page.getByTitle('切换到随记中心', { exact: true }).click();
    await wait(300); await page.reload();
    await page.locator('.tiptap').waitFor();
    await page.clock.install(); await page.clock.pauseAt(Date.now() + 100);
    await page.locator('.tiptap').fill('最后一刻保存的随记草稿');
    await page.clock.fastForward(3100);
    modal = page.getByRole('dialog', { name: '软件更新', exact: true });
    await modal.waitFor();
    await modal.getByRole('button', { name: '下载更新', exact: true }).click();
    await modal.getByRole('button', { name: '重启更新', exact: true }).waitFor();
    // A real editor input with debounce held pending exercises the restart flush.
    await page.locator('.tiptap').focus(); await page.keyboard.insertText('，重启前新增');
    const request = request => call('downloads_request', { request });
    const output = join(root, '下载 文件'); await mkdir(output);
    const downloadSettings = { directory: output, concurrent: 1, connections: 1, limitKib: 256, notify: false };
    await request({ action: 'settings', settings: downloadSettings });
    await request({ action: 'add', url: serverUrl + '/transfer.bin', name: '升级中下载.bin', directory: output });
    await until(async () => assert.ok((await request({ action: 'list' })).tasks[0]?.completed > 1048576));
    const rangeCount = ranges.length;
    const attachmentDir = join(dirname(data), 'attachments'); await mkdir(attachmentDir, { recursive: true });
    await writeFile(join(attachmentDir, 'test-preserved.txt'), '虚构附件：升级保留');
    const successStage = join(root, (await stages()).find(name => join(root, name) !== failedStage));
    await modal.getByRole('button', { name: '重启更新', exact: true }).click();
    await until(async () => assert.equal(await readFile(join(successStage, 'boot-ok'), 'utf8'), 'ready'), 60000);
    await browser.close(); await connect();
    assert.equal(hash(await readFile(target)), hash(next));
    await until(async () => assert.match(await page.locator('.tiptap').innerText(), /重启前新增/));
    const saved = JSON.parse(await readFile(data, 'utf8'));
    assert.ok(saved.state.notes[0].content.includes('最后一刻保存的随记草稿'));
    assert.ok(saved.state.notes[0].content.includes('重启前新增'));
    const backup = (await readFile(join(successStage, 'data-backup.txt'), 'utf8')).trim();
    const backedUp = JSON.parse(await readFile(join(backup, 'data.json'), 'utf8'));
    assert.equal(backedUp.state.notes[0].content, saved.state.notes[0].content);
    assert.equal(hash(await readFile(join(successStage, 'previous.exe'))), originalHash);
    assert.ok((await readFile(join(backup, 'RESTORE.ps1'), 'utf8')).includes('Copy-Item'));
    assert.equal(await readFile(join(backup, 'attachments', 'test-preserved.txt'), 'utf8'), '虚构附件：升级保留');
    await until(async () => {
        const resumed = (await request({ action: 'list' })).tasks[0];
        assert.ok(['active', 'complete'].includes(resumed.status)); assert.ok(resumed.completed > 0);
    });
    await request({ action: 'settings', settings: { ...downloadSettings, limitKib: 0 } });
    await until(async () => assert.equal((await request({ action: 'list' })).tasks[0].status, 'complete'), 30000);
    assert.ok(ranges.slice(rangeCount).some(start => start > 0));
    assert.equal(hash(await readFile(join(output, '升级中下载.bin'))), hash(transfer));
    results.push('active download: automatically resumed after upgrade with Range and matching hash; attachment backup preserved');
    results.push('success: same Chinese EXE path replaced, new build boot acknowledged, latest draft and verified backups retained');
    await page.screenshot({ path: join(root, 'updated.png') });
    await writeFile(join(root, 'portable-update-result.json'), JSON.stringify({ result: 'PASS', version, sha256: hash(next), tests: results }, null, 2));
    console.log(JSON.stringify({ result: 'PASS', version, tests: results }, null, 2));
} catch (error) {
    console.error({ completed: results, error: String(error) });
    if (page && !page.isClosed()) await page.screenshot({ path: join(root, 'failure.png') }).catch(() => {});
    throw error;
} finally {
    if (page && !page.isClosed()) await call('plugin:process|exit', { code: 0 }).catch(() => {});
    await browser?.close(); fixture.closeAllConnections(); await new Promise(resolve => fixture.close(resolve));
}

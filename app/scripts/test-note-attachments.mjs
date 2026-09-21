import assert from 'node:assert/strict';
import { mkdir, readFile, readdir, rename, rmdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join, resolve, relative } from 'node:path';
import { chromium } from 'playwright';
import { createServer, preview } from 'vite';
const native = process.argv.includes('--cdp');
const production = process.argv.includes('--production');
const arg = flag => process.argv[process.argv.indexOf(flag) + 1];
const dataPath = native ? resolve(arg('--data')) : null;
const output = 'ui-check.local/attachments-' + (native ? 'native' : 'browser');
await mkdir(output, { recursive: true });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=', 'base64');
const image = Buffer.alloc((native ? 12 : 3) * 1024 * 1024); png.copy(image);
const files = [
    { name: '交付说明.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7\nQA attachment\n%%EOF') },
    { name: '表格.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from('PK\x03\x04QA spreadsheet bytes') },
    { name: '备份.zip', mimeType: 'application/zip', buffer: Buffer.from('PK\x03\x04QA archive bytes') },
    { name: '空文件.txt', mimeType: 'text/plain', buffer: Buffer.alloc(0) },
    { name: '未知格式.custom', mimeType: '', buffer: Buffer.from([0, 255, 10, 42]) },
    { name: '图示.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><text>QA</text></svg>') },
];
let server, browser, page;
const errors = [];
try {
    if (native) {
        assert.ok(dataPath.includes('ProjectTodo-native-check-'), 'Native test must use isolated data');
        browser = await chromium.connectOverCDP(`http://127.0.0.1:${arg('--cdp')}`);
        page = browser.contexts()[0].pages()[0];
        await page.evaluate(async path => {
            const value = JSON.parse(localStorage.getItem('project-todo-app'));
            value.state.settings.autoBackup = { ...value.state.settings.autoBackup, enabled: false, customPath: path };
            await window.__TAURI_INTERNALS__.invoke('save_data', { data: JSON.stringify(value) });
        }, join(dirname(dataPath), 'backups'));
        await page.reload();
    } else {
        server = production
            ? await preview({ logLevel: 'error', preview: { host: '127.0.0.1', port: 0 } })
            : await createServer({ cacheDir: 'node_modules/.vite-test-attachments', logLevel: 'error', server: { host: '127.0.0.1', port: 0 } });
        if (!production) await server.listen();
        browser = await chromium.launch({ channel: 'msedge', headless: true });
        page = await browser.newPage({ viewport: { width: 1280, height: 840 } });
        await page.goto(server.resolvedUrls.local[0], { waitUntil: 'domcontentloaded', timeout: 90000 });
    }
    page.setDefaultTimeout(30000);
    page.on('pageerror', error => errors.push(error.message));
    await page.getByTitle('切换到随记中心', { exact: true }).waitFor();
    const reminder = page.getByRole('button', { name: '我知道了' });
    if (await reminder.isVisible()) await reminder.click();
    const body = page.getByRole('textbox', { name: '随记正文', exact: true });
    if (!native && !await body.isVisible()) {
        await page.getByTitle('切换到随记中心', { exact: true }).click();
        await page.getByRole('button', { name: '创建新随记' }).click();
    }
    await body.waitFor();
    if (native) {
        await page.waitForFunction(() => document.querySelector('.ProseMirror img')?.naturalWidth === 1);
        assert.match(await body.locator('img').first().getAttribute('src'), /^http:\/\/attachment.localhost\//);
        const migrationBackup = (await readFile(join(dirname(dataPath), 'attachment-migration-backup.txt'), 'utf8')).trim();
        assert.ok((await readFile(join(migrationBackup, 'data.json'), 'utf8')).includes('data:image/png;base64,'));
        assert.ok(await readFile(join(migrationBackup, 'RESTORE.ps1'), 'utf8'));
        console.log('PASS: legacy embedded image migrated after a verified complete backup; image still renders');
    }
    await page.getByPlaceholder('标题（可选）').fill('统一附件验收');
    await body.press('Control+End');
    await page.getByLabel('选择附件', { exact: true }).setInputFiles(files);
    await page.waitForFunction(() => document.querySelectorAll('.note-attachment').length === 6);
    for (const file of files) assert.equal(await body.getByRole('button', { name: `另存附件 ${file.name}`, exact: true }).count(), 1);
    await body.press('Control+End');
    const beforeImages = await body.locator('img').count();
    await body.evaluate((root, base64) => {
        const transfer = new DataTransfer();
        transfer.items.add(new File([Uint8Array.from(atob(base64), c => c.charCodeAt(0))], '大图.png', { type: 'image/png' }));
        transfer.setData('text/html', '<img src="file:///missing.png">');
        root.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }));
    }, image.toString('base64'));
    await page.waitForFunction(count => document.querySelectorAll('.ProseMirror img').length === count, beforeImages + 1);
    await page.waitForFunction(() => Array.from(document.querySelectorAll('.ProseMirror img')).every(img => img.complete && img.naturalWidth === 1));
    console.log(`PASS: ${(image.length / 1024 / 1024)} MB PNG with simultaneous HTML clipboard data renders`);
    await body.press('Control+End');
    await body.evaluate((root, base64) => {
        const transfer = new DataTransfer();
        transfer.setData('text/html', `<p><strong>富文本图片</strong></p><img src="data:image/png;base64,${base64}">`);
        root.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }));
    }, png.toString('base64'));
    await page.waitForFunction(count => document.querySelectorAll('.ProseMirror img').length === count, beforeImages + 2);
    assert.equal(await body.locator('strong').filter({ hasText: '富文本图片' }).count(), 1);
    if (native) assert.equal(await body.locator('img[src^="data:"]').count(), 0);
    console.log('PASS: HTML-only clipboard images preserve text formatting' + (native ? ' and use the attachment directory' : ''));
    await body.press('Control+End');
    await body.evaluate(root => {
        const data = new DataTransfer();
        data.items.add(new File(['clipboard document'], '粘贴.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
        root.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
    });
    await page.waitForFunction(() => document.querySelectorAll('.note-attachment').length === 7);
    await body.press('Control+End');
    await body.evaluate(root => {
        const data = new DataTransfer(); data.items.add(new File(['dragged bytes'], '拖入.bin'));
        const rect = root.getBoundingClientRect();
        root.dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true, clientX: rect.left + 30, clientY: rect.top + 30 }));
    });
    await page.waitForFunction(() => document.querySelectorAll('.note-attachment').length === 8);
    await body.press('Control+z');
    await page.waitForFunction(() => document.querySelectorAll('.note-attachment').length === 7);
    await body.press('Control+Shift+z');
    await page.waitForFunction(() => document.querySelectorAll('.note-attachment').length === 8);
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await page.waitForTimeout(700);
    await page.reload();
    await body.waitFor();
    await page.waitForFunction(() => document.querySelectorAll('.note-attachment').length === 8);
    await page.waitForFunction(() => Array.from(document.querySelectorAll('.ProseMirror img')).every(img => img.complete && img.naturalWidth === 1));
    console.log('PASS: all-format files, zero-byte file, paste/drop, undo/redo, save/reload');
    const downloaded = page.waitForEvent('download');
    await page.getByTitle('导出为 HTML', { exact: true }).click();
    const html = await readFile(await (await downloaded).path(), 'utf8');
    assert.ok(!html.includes('http://attachment.localhost/'));
    const exported = await page.evaluate(html => {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        return [...doc.querySelectorAll('a[data-type="attachment"]')].map(a => ({ name: a.getAttribute('download'), source: a.getAttribute('href') }));
    }, html);
    for (const file of files) assert.equal(hash(Buffer.from(exported.find(item => item.name === file.name).source.split(',')[1], 'base64')), hash(file.buffer));
    console.log('PASS: exported HTML contains byte-identical attachments without local-only references');
    if (native) {
        const stored = JSON.parse(await readFile(dataPath, 'utf8'));
        const content = stored.state.notes.find(n => n.title === '统一附件验收').content;
        assert.ok(content.length < 15000, 'data.json must contain references instead of binary payloads');
        assert.ok(!content.includes('data:image'));
        const directory = join(dirname(dataPath), 'attachments');
        assert.ok((await readdir(directory)).length >= 10);
        // A real missing file must produce an error, never a success-looking incomplete export.
        const reference = content.match(/http:\/\/attachment.localhost\/([a-f0-9]{64}\.pdf)/)[1];
        const original = join(directory, reference), held = original + '.qa-held';
        assert.ok(!relative(dirname(dataPath), resolve(original)).startsWith('..'));
        await rename(original, held);
        try {
            await page.getByTitle('导出为 HTML', { exact: true }).click();
            await page.getByText(/导出失败：.*附件不存在或无法读取/).waitFor();
        } finally { await rename(held, original); }
        // Fail an actual write with a directory at the content-addressed filename.
        const failureBytes = Buffer.from('new-failed-attachment');
        const blocked = join(directory, `${hash(failureBytes)}.bin`);
        await mkdir(blocked);
        try {
            await page.getByLabel('选择附件', { exact: true }).setInputFiles({ name: '写入失败.bin', mimeType: '', buffer: failureBytes });
            await page.getByText(/写入失败.bin：.*附件保存失败/).waitFor();
            assert.equal(await body.locator('.note-attachment').count(), 8);
        } finally { await rmdir(blocked); }
        console.log('PASS: real disk storage, small data.json, missing-file export failure, failed write leaves note unchanged');
        await page.getByTitle('切换到待办事项', { exact: true }).click();
        await page.getByRole('button', { name: '设置', exact: true }).click();
        await page.getByRole('button', { name: '💾 数据', exact: true }).click();
        await page.getByText('附件存储位置', { exact: true }).waitFor();
        await page.screenshot({ path: join(output, 'settings.png') });
        await page.getByText('本地备份', { exact: true }).click();
        console.log('NATIVE SAVE DIALOG: ' + join(dirname(dataPath), 'roundtrip-backup.json'));
        await page.getByRole('button', { name: '导出', exact: true }).click();
        await page.getByText(/备份成功/).waitFor({ timeout: 180000 });
        const backupPath = join(dirname(dataPath), 'roundtrip-backup.json');
        const backup = JSON.parse(await readFile(backupPath, 'utf8'));
        assert.ok(!JSON.stringify(backup).includes('http://attachment.localhost/'));
        assert.ok(JSON.stringify(backup).includes('data:image/png;base64,'));
        console.log('PASS: native backup embeds attachments and reports success only after writing');
        await page.getByRole('button', { name: '完成', exact: true }).click();
        await page.getByTitle('关闭', { exact: true }).click();
        await page.getByTitle('切换到随记中心', { exact: true }).click();
        await body.evaluate(root => root.editor.commands.setContent('<p>恢复目标空随记</p>'));
        await page.getByRole('button', { name: '保存', exact: true }).click();
        await page.waitForTimeout(700);
        const archived = join(dirname(dataPath), 'attachments-before-restore');
        assert.ok(!relative(dirname(dataPath), archived).startsWith('..'));
        await rename(directory, archived);
        await mkdir(directory);
        await page.getByTitle('切换到待办事项', { exact: true }).click();
        await page.getByRole('button', { name: '设置', exact: true }).click();
        await page.getByRole('button', { name: '💾 数据', exact: true }).click();
        await page.getByText('本地备份', { exact: true }).click();
        console.log('NATIVE OPEN DIALOG: ' + backupPath);
        await page.getByRole('button', { name: '导入', exact: true }).click();
        await page.getByText('⚠️ 确认恢复数据', { exact: true }).waitFor({ timeout: 180000 });
        await page.getByLabel('我已了解恢复操作将覆盖当前数据，并确认要继续').check();
        await page.getByRole('button', { name: /确认恢复/ }).click();
        await page.getByText(/恢复成功/).waitFor();
        await page.getByRole('button', { name: '完成', exact: true }).click();
        await page.getByTitle('关闭', { exact: true }).click();
        await page.getByTitle('切换到随记中心', { exact: true }).click();
        await page.reload();
        await body.waitFor();
        await page.waitForFunction(() => document.querySelectorAll('.note-attachment').length === 8);
        await page.waitForFunction(() => Array.from(document.querySelectorAll('.ProseMirror img')).every(img => img.complete && img.naturalWidth === 1));
        for (const name of await readdir(archived)) assert.equal(hash(await readFile(join(directory, name))), hash(await readFile(join(archived, name))));
        // Save-as goes through the native dialog and filesystem, with byte-level verification.
        const savedCopy = join(dirname(dataPath), 'saved-copy.pdf');
        console.log('NATIVE SAVE AS DIALOG: ' + savedCopy);
        await body.getByRole('button', { name: '另存附件 交付说明.pdf', exact: true }).click();
        for (let attempts = 0; attempts < 360; attempts++) {
            try { if (hash(await readFile(savedCopy)) === hash(files[0].buffer)) break; } catch { /* dialog pending */ }
            await page.waitForTimeout(500);
        }
        assert.equal(hash(await readFile(savedCopy)), hash(files[0].buffer));
        await writeFile(join(dirname(dataPath), 'verification.json'), JSON.stringify({ count: 8, images: beforeImages + 2 }));
        console.log('PASS: restore into an empty attachment directory, reopen, file hashes, and native save-as');

    }
    await page.screenshot({ path: join(output, 'result.png') });
    assert.deepEqual(errors, []);
    console.log('PASS: no page runtime errors');
} catch (error) {
    await page?.screenshot({ path: join(output, 'failure.png') }).catch(() => {});
    console.error('QA failure', error, errors);
    throw error;
} finally {
    await browser?.close();
    if (server) {
        if (production) await new Promise(resolve => server.httpServer.close(resolve));
        else await server.close();
    }
}

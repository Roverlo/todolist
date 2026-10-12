import assert from 'node:assert/strict';
import { mkdir, readFile, rmdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const arg = name => process.argv[process.argv.indexOf(name) + 1];
const native = process.argv.includes('--cdp');
const output = resolve('ui-check.local', `note-merge-${native ? 'native' : 'browser'}`);
const dataPath = native ? arg('--data') : null;
await mkdir(output, { recursive: true });
if (native) assert.equal(resolve(dataPath), resolve(process.env.PROJECTTODO_TEST_DATA_DIR, 'data.json'));
const now = new Date('2026-10-12T12:00:00Z').getTime();
const note = (id, title, createdAt, content, extra = {}) => ({ id, title, createdAt, updatedAt: createdAt, content, date: '2026-10-12', tags: [], ...extra });
const fixture = { version: 12, state: {
    activeView: 'notes', selectedNoteId: 'early', noteCalendarMonth: '2026-10', selectedNoteDate: '2026-10-12',
    noteTreeExpandedState: { 'year-2026': true, 'month-2026-10': true },
    settings: { colorScheme: 'purple', dueReminderEnabled: false, updateCheck: { checkOnStartup: false, autoCheck: false, checkInterval: 60 } },
    notes: [
        note('late', '随记三', now + 3000, '<p>第三篇正文</p>', { tags: ['第三篇'] }),
        note('target', '目标随记', now + 2000, '<p><strong>目标正文</strong></p><table><tbody><tr><td><p>表格内容</p></td></tr></tbody></table>'
            + '<p><time data-type="noteDate" datetime="2028-02-29">2028-02-29</time></p>', { tags: ['目标标签'] }),
        note('early', '随记一', now + 1000, '<p>最早正文  对齐空格</p><ul data-type="taskList"><li data-type="taskItem" data-checked="true" data-created-at="2026-10-11T12:00:00Z" data-completed-at="2026-10-12T12:00:00Z"><p>已完成待办</p></li></ul>'
            + '<a data-type="attachment" href="data:text/plain;base64,aGVsbG8=" download="虚构附件.txt" data-size="5" data-mime="text/plain">虚构附件.txt</a><p>末尾正文</p>', { tags: ['来源标签'] }),
        note('trash', '回收站测试', now, '<p>不应汇总的删除内容</p>', { deletedAt: now }),
    ],
} };
let server, browser, page, restarted;
const errors = [];
const until = async (check, label) => { for (let i = 0; i < 100; i++) { if (await check()) return; await new Promise(resolve => setTimeout(resolve, 100)); } assert.fail(label); };
try {
    if (native) {
        browser = await chromium.connectOverCDP(`http://127.0.0.1:${arg('--cdp')}`);
        page = browser.contexts()[0].pages()[0];
        await page.evaluate(async fixture => {
            await window.__TAURI_INTERNALS__.invoke('save_data', { data: JSON.stringify(fixture) });
            localStorage.setItem('project-todo-app', JSON.stringify(fixture));
        }, fixture);
        await page.reload();
    } else {
        server = await createServer({ logLevel: 'error', server: { host: '127.0.0.1', port: 0 }, cacheDir: 'node_modules/.vite-merge' });
        await server.listen();
        browser = await chromium.launch({ channel: 'msedge', headless: true });
        page = await browser.newPage({ viewport: { width: 1538, height: 900 } });
        await page.addInitScript(fixture => { if (!localStorage.getItem('project-todo-app')) localStorage.setItem('project-todo-app', JSON.stringify(fixture)); }, fixture);
        await page.goto(server.resolvedUrls.local[0], { waitUntil: 'domcontentloaded', timeout: 90000 });
    }
    page.on('pageerror', error => errors.push(error.message));
    const state = () => page.evaluate(() => JSON.parse(localStorage.getItem('project-todo-app')).state);
    const saved = async () => native ? JSON.parse(await readFile(dataPath, 'utf8')).state : await state();
    const body = page.getByRole('textbox', { name: '随记正文', exact: true });
    const overview = page.getByRole('button', { name: /全部随记汇总/ });
    const row = id => page.locator(`[data-node-id="note-${id}"]`);
    const append = async (text, paragraph = false) => {
        await body.focus();
        await page.waitForFunction(() => document.querySelector('.ProseMirror').editor.view.hasFocus());
        await page.evaluate(() => new Promise(requestAnimationFrame));
        await body.press('Control+End');
        await page.waitForFunction(() => {
            const { selection, doc } = document.querySelector('.ProseMirror').editor.state;
            return selection.empty && selection.to === doc.content.size - 1;
        });
        if (paragraph) {
            const size = await body.evaluate(root => root.editor.state.doc.content.size);
            await body.press('Enter');
            await page.waitForFunction(size => document.querySelector('.ProseMirror').editor.state.doc.content.size > size, size);
        }
        await body.pressSequentially(text);
        await page.waitForFunction(text => document.querySelector('.ProseMirror').editor.state.doc.textContent.endsWith(text), text);
    };
    const drag = async (from, into) => {
        await row(from).scrollIntoViewIfNeeded();
        await row(into).scrollIntoViewIfNeeded();
        await row(from).dragTo(row(into));
    };
    await body.waitFor({ timeout: 90000 });
    assert.equal(await page.title(), 'app');
    assert.equal(await page.locator('vite-error-overlay').count(), 0);
    await overview.click();
    assert.deepEqual(await page.locator('.notes-overview-note h2').allTextContents(), ['随记一', '目标随记', '随记三']);
    assert.equal(await page.locator('.notes-overview-note strong').innerText(), '目标正文');
    assert.ok((await page.getByRole('article', { name: '随记一', exact: true }).textContent()).includes('最早正文  对齐空格'), 'Overview preserves alignment spaces');
    assert.equal(await page.locator('.notes-overview-note table').count(), 1);
    assert.equal(await page.locator('.notes-overview-note [data-type="attachment"]').count(), 1);
    assert.equal(await page.locator('.notes-overview-note .ProseMirror[contenteditable=true]').count(), 0);
    const original = (await state()).notes;
    assert.equal(await page.locator('.notes-overview-note input[type=checkbox]').isDisabled(), true);
    assert.deepEqual((await state()).notes, original, 'Summary cannot modify source tasks');
    await page.getByPlaceholder('搜索随记...（支持标题和内容）').fill('不存在的筛选');
    assert.equal(await page.locator('.notes-overview-note').count(), 3, 'Overview is independent of sidebar filters');
    await page.getByRole('article', { name: '随记一', exact: true }).getByRole('button', { name: '打开随记', exact: true }).click();
    await append('draft-before-overview', true);
    await overview.click();
    await page.getByRole('article', { name: '随记一', exact: true }).getByText('draft-before-overview', { exact: true }).waitFor();
    await page.screenshot({ path: join(output, 'overview.png') });
    await page.getByRole('article', { name: '随记一', exact: true }).getByRole('button', { name: '打开随记', exact: true }).click();
    await append('-source-draft');
    await drag('early', 'target');
    await until(async () => (await saved()).notes.find(n => n.id === 'early').deletedAt, 'Source moved only after merge save');
    await page.getByRole('textbox', { name: '随记标题', exact: true }).inputValue().then(value => assert.equal(value, '目标随记'));
    let merged = (await saved()).notes.find(n => n.id === 'target');
    assert.ok(merged.content.indexOf('最早正文') < merged.content.indexOf('目标正文'));
    assert.match(merged.content, /draft-before-overview-source-draft/);
    assert.match(merged.content, /data-completed-at="2026-10-12T12:00:00Z"/);
    assert.match(merged.content, /data-type="attachment"/);
    assert.deepEqual([...merged.tags].sort(), ['来源标签', '目标标签']);
    assert.equal(merged.createdAt, now + 2000, 'Target identity stays unchanged');
    await append('target-unsaved-draft', true);
    await drag('late', 'target');
    await until(async () => (await saved()).notes.find(n => n.id === 'late').deletedAt, 'Second merge');
    await until(async () => (await body.innerText()).includes('第三篇正文'), 'Active target editor reloads merged content');
    merged = (await saved()).notes.find(n => n.id === 'target');
    assert.ok(merged.content.indexOf('target-unsaved-draft') < merged.content.indexOf('第三篇正文'));
    assert.match(merged.content, /<strong>目标正文<\/strong>/);
    assert.match(merged.content, /datetime="2028-02-29"/);
    const beforeSelf = (await saved()).notes;
    await drag('target', 'target');
    assert.deepEqual((await saved()).notes, beforeSelf, 'Self drop is a no-op');
    // Restore the original source to exercise a failed merge and an immediate retry.
    await page.getByRole('button', { name: /回收站/ }).click();
    await page.locator('.recycle-bin-table .rb-note-title').getByText('随记一', { exact: true }).click();
    await page.getByRole('button', { name: '还原', exact: true }).click();
    await row('target').click();
    await until(async () => !(await saved()).notes.find(n => n.id === 'early').deletedAt, 'Restored source');
    const beforeFailure = (await saved()).notes;
    const sourceBox = await row('early').boundingBox(), targetBox = await row('target').boundingBox();
    const startPointerDrag = async (x, y) => {
        await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
        await page.mouse.down();
        await page.mouse.move(x, y, { steps: 1 });
    };
    await startPointerDrag(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2);
    await page.keyboard.press('Escape');
    await page.mouse.up();
    assert.deepEqual((await saved()).notes, beforeFailure, 'Escape cancels an in-progress drag');
    await startPointerDrag((await page.evaluate(() => innerWidth)) / 2, 10);
    await page.mouse.up();
    assert.deepEqual((await saved()).notes, beforeFailure, 'Releasing outside note rows changes nothing');
    const blocker = dataPath && dataPath.replace(/\.json$/, '.json.tmp');
    if (native) {
        await page.exposeFunction('__blockMergeWrite', () => mkdir(blocker));
        await page.evaluate(() => {
            window.__originalFetch = window.fetch;
            let blocked = false;
            window.fetch = async (input, options) => {
                if (!blocked && String(input).endsWith('/save_data')
                    && JSON.parse(JSON.parse(options.body).data).state.notes.find(n => n.id === 'early').deletedAt) {
                    blocked = true;
                    await window.__blockMergeWrite();
                    window.__mergeWriteBlocked = true;
                }
                return window.__originalFetch.call(window, input, options);
            };
        });
    }
    else await page.evaluate(() => { window.__originalStorageSet = Storage.prototype.setItem; Storage.prototype.setItem = function (key, value) { if (key === 'project-todo-app' && JSON.parse(value).state.notes.find(n => n.id === 'early').deletedAt) throw new Error('simulated quota failure'); return window.__originalStorageSet.call(this, key, value); }; });
    try {
        await drag('early', 'target');
        await page.getByText(/合并失败，两篇原文已保留/).waitFor();
        if (native) assert.equal(await page.evaluate(() => window.__mergeWriteBlocked), true, 'Real native disk failure was injected');
        assert.deepEqual((await saved()).notes, beforeFailure, 'Save failure preserves originals');
        assert.equal(await row('early').isVisible(), true);
    } finally {
        if (native) {
            await page.evaluate(() => { window.fetch = window.__originalFetch; });
            await rmdir(blocker).catch(error => { if (error.code !== 'ENOENT') throw error; });
        }
        else await page.evaluate(() => { Storage.prototype.setItem = window.__originalStorageSet; });
    }
    // The menu offers the same merge path to keyboard users; cancelling changes nothing.
    const openMergeMenu = async () => {
        await row('early').getByRole('button', { name: /随记操作/ }).click();
        await page.locator('.context-menu').getByRole('button', { name: '合并到其他随记…', exact: true }).click();
        const dialog = page.getByRole('dialog', { name: '合并随记', exact: true });
        await dialog.waitFor();
        await dialog.getByRole('combobox', { name: '合并到', exact: true }).selectOption('target');
        return dialog;
    };
    const choice = await openMergeMenu();
    await choice.getByRole('button', { name: '取消', exact: true }).click();
    assert.deepEqual((await saved()).notes, beforeFailure, 'Menu cancellation leaves both notes unchanged');
    await (await openMergeMenu()).getByRole('button', { name: '合并', exact: true }).click();
    await until(async () => (await saved()).notes.find(n => n.id === 'early').deletedAt, 'Immediate retry succeeds');
    await overview.click();
    assert.equal(await page.locator('.notes-overview-note').count(), 1);
    await page.getByRole('article', { name: '目标随记', exact: true }).getByRole('button', { name: '打开随记', exact: true }).click();
    await page.screenshot({ path: join(output, 'merged.png') });
    const expected = (await saved()).notes;
    await page.reload();
    await body.waitFor();
    assert.deepEqual((await saved()).notes, expected, 'Reload keeps content, trash originals and metadata');
    assert.ok((await body.innerText()).includes('第三篇正文'));
    if (native) {
        const executable = arg('--executable');
        assert.ok(executable?.endsWith('.exe'));
        await page.evaluate(() => window.__TAURI_INTERNALS__.invoke('plugin:process|exit', { code: 0 })).catch(() => {});
        await browser.close();
        await new Promise(resolve => setTimeout(resolve, 800));
        restarted = spawn(executable, [], { cwd: dirname(executable), env: process.env, windowsHide: true, stdio: 'ignore' });
        await until(async () => { try { return (await fetch(`http://127.0.0.1:${arg('--cdp')}/json/version`)).ok; } catch { return false; } }, 'Restarted EXE');
        browser = await chromium.connectOverCDP(`http://127.0.0.1:${arg('--cdp')}`);
        page = browser.contexts()[0].pages()[0];
        await page.getByRole('textbox', { name: '随记正文', exact: true }).waitFor();
        assert.deepEqual((await saved()).notes, expected, 'Full native restart retains merged and recycled notes');
        assert.ok((await page.getByRole('textbox', { name: '随记正文', exact: true }).innerText()).includes('第三篇正文'));
    }
    assert.deepEqual(errors, []);
    await writeFile(join(output, 'result.json'), JSON.stringify({ result: 'PASS', native, checks: ['read-only chronological overview', 'independent filters', 'source and target drafts', 'rich text / attachment / task metadata', 'self-drop', 'Escape / outside cancels drag', 'restore', 'failure preserves originals', 'menu cancellation and merge', 'retry', 'reload', ...(native ? ['full EXE restart'] : [])], errors }, null, 2));
    console.log(`PASS: note overview / drag merge / drafts / rich text / failure / retry / reload (${native ? 'native' : 'browser'})`);
} catch (error) {
    await page?.screenshot({ path: join(output, 'failure.png') }).catch(() => {});
    console.error(error);
    throw error;
} finally {
    if (native && restarted) await page?.evaluate(() => window.__TAURI_INTERNALS__.invoke('plugin:process|exit', { code: 0 })).catch(() => {});
    await browser?.close();
    if (restarted && restarted.exitCode === null) restarted.kill();
    await server?.close();
}

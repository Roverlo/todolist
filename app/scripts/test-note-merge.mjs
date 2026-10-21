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
    const overview = page.locator('.notes-overview-entry').getByText('汇总日记', { exact: true });
    const journal = page.getByRole('region', { name: '汇总日记', exact: true });
    const summary = journal.locator('.notes-overview-body .ProseMirror');
    const back = journal.locator('header').getByRole('button', { name: '返回随记', exact: true });
    const row = id => page.locator(`[data-node-id="note-${id}"]`);
    const preview = page.locator('.notes-drag-preview');
    const assertJournal = async titles => {
        await summary.waitFor();
        assert.equal(await journal.count(), 1);
        assert.equal(await page.locator('.ProseMirror').count(), 1, 'Journal has exactly one editor');
        assert.equal(await summary.getAttribute('contenteditable'), 'false');
        assert.equal(await summary.evaluate(root => root.editor.isEditable), false);
        assert.deepEqual(await summary.locator('h2').allTextContents(), titles);
        assert.equal(await journal.getByRole('button', { name: '打开随记', exact: true }).count(), 0);
    };
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
    const startPointerDrag = async (from, into) => {
        await row(from).scrollIntoViewIfNeeded();
        await row(into).scrollIntoViewIfNeeded();
        const sourceBox = await row(from).boundingBox(), targetBox = await row(into).boundingBox();
        assert.ok(sourceBox && targetBox, 'Both drag rows are visible');
        const point = { x: targetBox.x + targetBox.width / 2, y: targetBox.y + targetBox.height / 2 };
        await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
        await page.mouse.down();
        await page.mouse.move(point.x, point.y, { steps: 3 });
        return { sourceBox, targetBox, point };
    };
    const drag = async (from, into) => {
        await startPointerDrag(from, into);
        await page.mouse.up();
    };
    const assertPreview = async (point, target = true) => {
        await preview.waitFor();
        assert.equal(await preview.evaluate(root => getComputedStyle(root).position), 'fixed');
        assert.equal(await preview.evaluate(root => getComputedStyle(root).pointerEvents), 'none');
        await until(async () => {
            const text = await preview.innerText();
            return text.includes('随记一') && (target ? /松开，合并到/.test(text) && text.includes('目标随记') : /拖到另一篇随记，松开合并/.test(text));
        }, 'Preview identifies the source and the current drop instruction');
        await until(async () => {
            const box = await preview.boundingBox();
            return box && Math.abs(box.x - point.x - 16) <= 1 && Math.abs(box.y - point.y - 16) <= 1;
        }, 'Preview follows the pointer with a 16px offset');
    };
    const assertDropHint = async ({ sourceBox, targetBox }) => {
        await until(async () => await row('target').getAttribute('data-merge-target') === 'true', 'Target is marked while holding the pointer');
        assert.equal(await row('early').getAttribute('data-dragging'), 'true');
        const hint = await row('target').evaluate(root => {
            const style = getComputedStyle(root);
            return { outline: style.outlineStyle, width: parseFloat(style.outlineWidth), color: style.outlineColor };
        });
        assert.notEqual(hint.outline, 'none', 'Drop target has a visible outline');
        assert.ok(hint.width > 0 && hint.color !== 'rgba(0, 0, 0, 0)', 'Drop hint does not depend on animation');
        assert.deepEqual(await row('early').boundingBox(), sourceBox, 'Source row stays in place during drag');
        assert.deepEqual(await row('target').boundingBox(), targetBox, 'Target row stays in place during drag');
    };
    const assertDragCleared = async () => {
        await preview.waitFor({ state: 'detached' });
        assert.equal(await page.locator('.notes-tree [data-dragging], .notes-tree [data-merge-target]').count(), 0);
    };
    await body.waitFor({ timeout: 90000 });
    assert.equal(await page.title(), 'app');
    assert.equal(await page.locator('vite-error-overlay').count(), 0);
    const original = (await saved()).notes;
    await overview.click();
    const titles = ['随记一', '目标随记', '随记三'];
    await assertJournal(titles);
    assert.equal(await summary.locator('strong').innerText(), '目标正文');
    const summaryText = await summary.textContent();
    assert.ok(summaryText.includes('最早正文  对齐空格'), 'Journal preserves alignment spaces');
    assert.ok(summaryText.indexOf('最早正文') < summaryText.indexOf('目标正文') && summaryText.indexOf('目标正文') < summaryText.indexOf('第三篇正文'), 'Full bodies follow creation order');
    for (const text of ['已完成待办', '虚构附件.txt', '末尾正文', '表格内容', '2028-02-29', '第三篇正文']) assert.ok(summaryText.includes(text), `Journal retains ${text}`);
    assert.ok(!summaryText.includes('不应汇总的删除内容'), 'Journal excludes deleted notes');
    assert.equal(await summary.locator('table').count(), 1);
    assert.equal(await summary.locator('[data-type="attachment"]').count(), 1);
    assert.equal(await summary.locator('time[datetime="2028-02-29"]').count(), 1);
    const checkbox = summary.locator('input[type=checkbox]');
    assert.equal(await checkbox.isDisabled(), true);
    assert.equal(await checkbox.isChecked(), true);
    assert.deepEqual((await saved()).notes, original, 'Opening the journal never creates or changes records');
    const summaryHtml = await summary.evaluate(root => root.editor.getHTML());
    // Navigation can persist view state; interacting with the read-only document must not write.
    await page.evaluate(async () => {
        window.__overviewWrites = [];
        window.__overviewSetItem = Storage.prototype.setItem;
        window.__overviewFetch = window.fetch;
        Storage.prototype.setItem = function (key, value) {
            if (key === 'project-todo-app') window.__overviewWrites.push(key);
            return window.__overviewSetItem.call(this, key, value);
        };
        window.fetch = function (input, options) {
            if (String(input).endsWith('/save_data')) window.__overviewWrites.push('save_data');
            return window.__overviewFetch.call(this, input, options);
        };
        // Let queued navigation saves settle before counting document interactions.
        let count = -1;
        while (count !== window.__overviewWrites.length) {
            count = window.__overviewWrites.length;
            await new Promise(resolve => setTimeout(resolve, 400));
        }
        window.__overviewWrites = [];
    });
    try {
        await summary.pressSequentially('journal-must-stay-readonly');
        await summary.press('Control+b');
        await checkbox.click({ force: true });
        await page.waitForTimeout(3200); // Exceed the existing editor's 3s autosave debounce.
        assert.equal(await summary.evaluate(root => root.editor.getHTML()), summaryHtml);
        assert.deepEqual(await page.evaluate(() => window.__overviewWrites), [], 'Read-only interactions never write storage');
        assert.deepEqual((await saved()).notes, original, 'Summary cannot modify source tasks or records');
    } finally {
        await page.evaluate(() => { Storage.prototype.setItem = window.__overviewSetItem; window.fetch = window.__overviewFetch; });
    }
    await page.getByPlaceholder('搜索随记...（支持标题和内容）').fill('不存在的筛选');
    await until(async () => await page.locator('.notes-tree [data-note-id]').count() === 0, 'Search filters sidebar rows');
    await assertJournal(titles);
    assert.equal(await summary.evaluate(root => root.editor.getHTML()), summaryHtml, 'Search never filters journal content');
    await page.getByPlaceholder('搜索随记...（支持标题和内容）').fill('');
    await page.locator('.notes-tags-header').click();
    await page.locator('.notes-tags-list').getByRole('button', { name: /未分类/ }).click();
    await until(async () => await page.locator('.notes-tree [data-note-id]').count() === 0, 'Tag filters sidebar rows');
    await assertJournal(titles);
    assert.equal(await summary.evaluate(root => root.editor.getHTML()), summaryHtml, 'Tags never filter journal content');
    assert.deepEqual((await saved()).notes, original, 'Filters never persist a duplicate journal record');
    await page.locator('.notes-tags-header').click();
    await back.click();
    await body.waitFor();
    assert.equal(await page.getByRole('textbox', { name: '随记标题', exact: true }).inputValue(), '随记一', 'Return reopens the selected note');
    await append('draft-before-overview', true);
    await overview.click();
    await assertJournal(titles);
    await summary.getByText('draft-before-overview', { exact: true }).waitFor();
    await page.screenshot({ path: join(output, 'overview.png') });
    await back.click();
    await append('-source-draft');
    const held = await startPointerDrag('early', 'target');
    await assertPreview(held.point);
    await assertDropHint(held);
    const moved = { x: held.point.x + 8, y: held.point.y + 2 };
    await page.mouse.move(moved.x, moved.y);
    await assertPreview(moved);
    await assertDropHint(held);
    await page.mouse.up();
    const completed = page.locator('[data-node-id="note-target"][data-merge-complete="true"]');
    await completed.waitFor();
    await assertDragCleared();
    await until(async () => (await saved()).notes.find(n => n.id === 'early').deletedAt, 'Source moved only after merge save');
    await page.getByRole('textbox', { name: '随记标题', exact: true }).inputValue().then(value => assert.equal(value, '目标随记'));
    let merged = (await saved()).notes.find(n => n.id === 'target');
    assert.ok(merged.content.indexOf('最早正文') < merged.content.indexOf('目标正文'));
    assert.match(merged.content, /draft-before-overview-source-draft/);
    assert.match(merged.content, /data-completed-at="2026-10-12T12:00:00Z"/);
    assert.match(merged.content, /data-type="attachment"/);
    assert.deepEqual([...merged.tags].sort(), ['来源标签', '目标标签']);
    assert.equal(merged.createdAt, now + 2000, 'Target identity stays unchanged');
    await completed.waitFor({ state: 'detached' });
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
    await page.emulateMedia({ reducedMotion: 'reduce' });
    try {
        assert.equal(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), true);
        const reduced = await startPointerDrag('early', 'target');
        await assertPreview(reduced.point);
        await assertDropHint(reduced);
        await page.keyboard.press('Escape');
        await assertDragCleared();
    } finally {
        await page.mouse.up();
        await page.emulateMedia({ reducedMotion: null });
    }
    assert.deepEqual((await saved()).notes, beforeFailure, 'Escape cancels an in-progress drag');
    const leaving = await startPointerDrag('early', 'target');
    await assertPreview(leaving.point);
    const outside = { x: (await page.evaluate(() => innerWidth)) / 2, y: 10 };
    await page.mouse.move(outside.x, outside.y);
    await assertPreview(outside, false);
    assert.equal(await page.locator('.notes-tree [data-merge-target]').count(), 0, 'Outside drag clears target highlight');
    await page.mouse.up();
    await assertDragCleared();
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
    await assertJournal(['目标随记']);
    assert.ok((await summary.textContent()).includes('第三篇正文'));
    await back.click();
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
    await writeFile(join(output, 'result.json'), JSON.stringify({ result: 'PASS', native, checks: ['single read-only chronological journal', 'read-only interactions never write storage', 'independent search and tag filters', 'source and target drafts', 'rich text / attachment / task metadata', 'floating preview follows pointer', 'drop hint and stable row bounds', 'temporary merge completion highlight', 'self-drop', 'Escape / outside clears preview', 'reduced-motion drop hint', 'restore', 'failure preserves originals', 'menu cancellation and merge', 'retry', 'reload', ...(native ? ['full EXE restart'] : [])], errors }, null, 2));
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

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer as createTcpServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer as createViteServer } from 'vite';

const source = name => readFile(fileURLToPath(new URL(name, import.meta.url)), 'utf8');
const [appSource, closeModalSource] = await Promise.all([
    source('../src/App.tsx'),
    source('../src/components/ui/CloseConfirmModal.tsx'),
]);

for (const text of [appSource, closeModalSource]) {
    assert.doesNotMatch(text, /\.destroy\(/, '退出程序不能只销毁窗口');
    assert.match(text, /exit\(0\)/, '退出程序必须结束 Tauri 进程');
}

const port = await new Promise((resolve, reject) => {
    const probe = createTcpServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
        const address = probe.address();
        probe.close(error => error ? reject(error) : resolve(address.port));
    });
});
const server = await createViteServer({
    logLevel: 'silent',
    server: { host: '127.0.0.1', port, strictPort: true },
});
let browser;

try {
    await server.listen();
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage({ viewport: { width: 1500, height: 900 }, timezoneId: 'Asia/Shanghai' });
    await page.clock.setFixedTime(new Date('2026-09-05T04:00:00Z'));
    await page.goto(server.resolvedUrls.local[0]);
    await page.waitForTimeout(700);

    const dismissReminder = page.getByRole('button', { name: '我知道了' });
    if (await dismissReminder.isVisible()) await dismissReminder.click();

    await page.locator('[title="切换到随记中心"]').click();
    await page.getByRole('button', { name: '创建新随记' }).click();

    const editor = page.locator('.ProseMirror');
    await editor.fill('颜色回归测试');
    await editor.press('Control+A');
    await page.getByRole('button', { name: '字体颜色菜单' }).click();
    await page.getByRole('menuitem', { name: '字体颜色：绿色' }).click();
    assert.match(await editor.locator('span').getAttribute('style'), /112, 173, 71/);

    await editor.press('Control+A');
    await page.getByRole('button', { name: '背景颜色菜单' }).click();
    await page.getByRole('menuitem', { name: '背景颜色：黄色' }).click();
    await editor.press('Control+A');
    await page.getByRole('button', { name: '应用背景颜色' }).click();
    assert.equal(await editor.locator('mark').count(), 1, '重复应用背景色不应取消高亮');
    assert.equal(await editor.locator('mark').getAttribute('data-color'), '#fff200');

    await editor.press('Control+A');
    await page.getByRole('button', { name: '背景颜色菜单' }).click();
    await page.getByRole('menuitem', { name: '无颜色' }).click();
    assert.equal(await editor.locator('mark').count(), 0);

    await page.getByRole('button', { name: '保存', exact: true }).click();

    // All data below lives in this fresh browser context, never the desktop user's storage.
    const storedNotes = () => page.evaluate(() => JSON.parse(localStorage.getItem('project-todo-app')).state.notes);
    const createOnDate = async (date, title) => {
        await page.getByRole('button', { name: date, exact: true }).click();
        await page.getByRole('button', { name: `${date} 新建随记`, exact: true }).click();
        assert.equal(await page.getByLabel('所属日期', { exact: true }).inputValue(), date);
        await page.getByPlaceholder('标题（可选）').fill(title);
        await editor.fill(`${title}正文`);
        await page.getByRole('button', { name: '保存', exact: true }).click();
        await page.waitForFunction(title => JSON.parse(localStorage.getItem('project-todo-app')).state.notes
            .some(n => n.title === title && n.content.includes(`${title}正文`)), title);
        const note = (await storedNotes()).find(n => n.title === title);
        assert.equal(note.date, date);
        assert.equal(note.createdAt, Date.parse('2026-09-05T04:00:00Z'));
        assert.equal(await page.locator(`[data-node-id="note-${note.id}"]`).count(), 1);
        assert.match(await page.getByRole('button', { name: date, exact: true }).getAttribute('class'), /has-notes/);
        return note;
    };

    await page.getByTitle('上个月', { exact: true }).click();
    const past = await createOnDate('2026-08-31', '补记过去事项');
    await page.getByTitle('下个月', { exact: true }).click();
    await page.getByTitle('下个月', { exact: true }).click();
    const future = await createOnDate('2026-10-18', '未来安排');
    await createOnDate('2026-10-18', '同日第二条事项');

    // Changing the date while typing must preserve the unsaved title and body.
    await page.getByPlaceholder('标题（可选）').fill('跨年安排');
    await editor.fill('跨年日期调整后的正文');
    await page.getByLabel('所属日期', { exact: true }).fill('2027-01-15');
    assert.equal(await page.locator('.notes-calendar-title').innerText(), '2027年1月');
    assert.equal(await page.getByPlaceholder('标题（可选）').inputValue(), '跨年安排');
    assert.equal(await editor.innerText(), '跨年日期调整后的正文');
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('project-todo-app')).state.notes
        .some(n => n.title === '跨年安排' && n.date === '2027-01-15' && n.content.includes('跨年日期调整后的正文')));
    await page.reload();
    await page.getByLabel('所属日期', { exact: true }).waitFor();
    assert.equal(await page.getByLabel('所属日期', { exact: true }).inputValue(), '2027-01-15');
    assert.equal((await storedNotes()).find(n => n.id === past.id).date, '2026-08-31');
    assert.equal((await storedNotes()).find(n => n.id === future.id).date, '2026-10-18');

    await page.getByTitle('在列表中定位当前笔记', { exact: true }).click();
    assert.equal(await page.getByRole('button', { name: '2027-01-15', exact: true }).getAttribute('aria-pressed'), 'true');
    const beforeToday = await storedNotes();
    await page.getByRole('button', { name: '新增当日随记', exact: true }).click();
    assert.equal(await page.getByLabel('所属日期', { exact: true }).inputValue(), '2026-09-05');
    assert.equal(await page.locator('.notes-calendar-title').innerText(), '2026年9月');
    assert.equal(await page.getByPlaceholder('标题（可选）').inputValue(), '随记01');
    const afterToday = await storedNotes();
    assert.equal(afterToday.length, beforeToday.length + 1);
    for (const note of beforeToday) assert.deepEqual(afterToday.find(n => n.id === note.id), note);

    // Legacy notes retain their original day through every timestamp-changing action.
    const legacyDates = await page.evaluate(async () => {
        const { useAppStore } = await import('/src/state/appStore.ts');
        const { getNoteDate } = await import('/src/utils/noteDate.ts');
        const store = useAppStore.getState();
        const original = { id: 'legacy-date', title: '旧笔记', content: '', createdAt: Date.parse('2025-12-01T04:00:00Z'), updatedAt: Date.parse('2025-12-31T23:30:00+08:00') };
        const operations = [
            () => store.updateNote(original.id, { content: '修改旧笔记' }),
            () => store.toggleNotePin(original.id),
            () => store.deleteNote(original.id),
            () => store.restoreNote(original.id),
            () => store.restoreNotes([original.id]),
        ];
        const dates = operations.map(operation => {
            useAppStore.setState({ notes: [original] });
            operation();
            return getNoteDate(useAppStore.getState().notes[0]);
        });
        for (const date of ['2026-02-30', '2026-2-3', '', 'invalid']) {
            for (const operation of [() => store.addNote({ content: '', date }), () => store.updateNote(original.id, { date })]) {
                let rejected = false;
                try { operation(); } catch { rejected = true; }
                if (!rejected) throw new Error(`Accepted invalid date: ${date}`);
            }
        }
        store.setSelectedNoteDate('2025-12-31');
        store.deleteNote(original.id);
        return dates;
    });
    assert.deepEqual(legacyDates, Array(5).fill('2025-12-31'));
    assert.doesNotMatch(await page.getByRole('button', { name: '2025-12-31', exact: true }).getAttribute('class'), /has-notes/);
    await page.getByRole('button', { name: '回收站', exact: false }).click();
    await page.locator('.recycle-bin-table tbody tr').dblclick();
    await page.getByTitle('返回随记列表', { exact: true }).click();
    assert.match(await page.getByRole('button', { name: '2025-12-31', exact: true }).getAttribute('class'), /has-notes/);
    assert.equal(await page.getByText('31日 - 旧笔记', { exact: true }).count(), 1);

    await page.locator('[data-node-id="month-2025-12"]').click({ button: 'right' });
    await page.getByRole('button', { name: '导出为 Markdown', exact: true }).click();
    assert.equal(await page.locator('.create-dialog-subtitle').innerText(), '选择要导出的笔记，共 1 条');
    page.once('dialog', dialog => dialog.dismiss());
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: '导出 (1)', exact: true }).click();
    const download = await downloadPromise;
    assert.match(await readFile(await download.path(), 'utf8'), /所属日期: 2025-12-31/);

    // With no entry for today, the shortcut must create today rather than the selected old day.
    await page.getByRole('button', { name: '新增当日随记', exact: true }).click();
    assert.equal(await page.getByLabel('所属日期', { exact: true }).inputValue(), '2026-09-05');
    assert.equal(await page.getByPlaceholder('标题（可选）').inputValue(), '随记');
    assert.equal((await storedNotes()).length, 2);

    for (let number = 1; number <= 10; number++) {
        await page.getByRole('button', { name: '新增当日随记', exact: true }).click();
        await page.waitForFunction(title => document.querySelector('.note-editor-title')?.value === title, `随记${String(number).padStart(2, '0')}`);
    }
    const todayTitles = (await storedNotes()).filter(n => n.date === '2026-09-05').map(n => n.title).sort();
    assert.deepEqual(todayTitles, ['随记', ...Array.from({ length: 10 }, (_, i) => `随记${String(i + 1).padStart(2, '0')}`)]);
    await page.reload();
    await page.getByRole('button', { name: '新增当日随记', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.note-editor-title')?.value === '随记11');
    const toolbarFits = await page.locator('.notes-toolbar').evaluate(el => {
        const bounds = el.getBoundingClientRect();
        return [...el.querySelectorAll('button')].every(button => {
            const rect = button.getBoundingClientRect();
            return rect.left >= bounds.left && rect.right <= bounds.right;
        });
    });
    assert.ok(toolbarFits, '新增按钮和原有导航按钮均应完整显示');

    const numberedNotes = await page.evaluate(async () => {
        const { useAppStore } = await import('/src/state/appStore.ts');
        const store = useAppStore.getState();
        const custom = store.addNote({ date: '2028-01-01', title: '项目会议', content: '保留原内容' });
        const firstNumbered = store.addNote({ date: '2028-01-01', content: '' });
        store.addNote({ date: '2028-01-01', title: '随记99', content: '' });
        const afterExistingNumber = store.addNote({ date: '2028-01-01', content: '' });
        const otherDay = store.addNote({ date: '2028-01-02', content: '' });
        return [custom, firstNumbered, afterExistingNumber, otherDay].map(n => n.title);
    });
    assert.deepEqual(numberedNotes, ['项目会议', '随记01', '随记100', '随记']);

    console.log('UI color, process-exit, past/future dates, autosave/reload, legacy dates, validation, trash, dated export and daily numbered creation regression checks passed');
} finally {
    await browser?.close();
    await server.close();
}

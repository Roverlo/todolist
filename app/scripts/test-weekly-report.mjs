import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, rename, rmdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createServer as createViteServer } from 'vite';
import { chromium } from 'playwright';

const native = process.argv.includes('--cdp');
const arg = name => process.argv[process.argv.indexOf(name) + 1];
const dataPath = native ? arg('--data') : null;
const output = `ui-check.local/weekly-report-${native ? 'native' : 'browser'}`;
await mkdir(output, { recursive: true });
const requests = [], replies = [], errors = [];
const example = '本周完成\n完成接口回归测试。\n\n工作进展\n部署方案正在确认。\n\n问题及风险\n随记中未记录。\n\n下周计划\n周一提交验收资料。';
const mock = createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Headers', '*');
    if (req.method === 'OPTIONS') { res.end(); return; }
    let body = ''; for await (const chunk of req) body += chunk;
    requests.push(JSON.parse(body)); const reply = replies.shift() || { status: 500 };
    const timer = setTimeout(() => {
        res.writeHead(reply.status || 200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(reply.status ? { error: 'mock service unavailable' } : { choices: [{ finish_reason: reply.finish || 'stop', message: { content: JSON.stringify(reply.payload || { report: example }) } }] }));
    }, reply.delay || 10);
    res.on('close', () => clearTimeout(timer));
});
await new Promise(resolve => mock.listen(0, '127.0.0.1', resolve));
const endpoint = `http://127.0.0.1:${mock.address().port}/v1`;
const until = async (check, label) => {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) { if (await check()) return; await new Promise(resolve => setTimeout(resolve, 50)); }
    assert.fail(label);
};
let server, browser, page;
try {
    if (native) {
        assert.ok(process.env.PROJECTTODO_TEST_DATA_DIR && dataPath.startsWith(process.env.PROJECTTODO_TEST_DATA_DIR));
        browser = await chromium.connectOverCDP(`http://127.0.0.1:${arg('--cdp')}`); page = browser.contexts()[0].pages()[0];
    } else {
        server = await createViteServer({ cacheDir: 'node_modules/.vite-weekly-report', logLevel: 'error', server: { host: '127.0.0.1', port: 0, strictPort: false },
            plugins: [{ name: 'mock-native-http-in-browser', enforce: 'pre', transform(code, id) {
                if (id.replaceAll('\\', '/').endsWith('/src/services/ai/index.ts')) return code.replace("import { fetch } from '@tauri-apps/plugin-http';", 'const fetch = globalThis.fetch.bind(globalThis);');
            } }] });
        await server.listen(); browser = await chromium.launch({ channel: 'msedge', headless: true });
        page = await browser.newPage({ viewport: { width: 1538, height: 840 }, timezoneId: 'Asia/Shanghai' });
        await page.goto(server.resolvedUrls.local[0], { waitUntil: 'domcontentloaded', timeout: 60000 });
        const reminder = page.getByRole('button', { name: '我知道了' }); if (await reminder.isVisible()) await reminder.click();
    }
    page.on('pageerror', error => errors.push(error.message));
    const store = () => page.evaluate(() => JSON.parse(localStorage.getItem('project-todo-app')).state);
    await until(async () => Boolean(await page.evaluate(() => localStorage.getItem('project-todo-app'))), 'App storage ready');
    if (!native) {
        const unit = await page.evaluate(async () => {
            const { collectWeeklyNotes, reportAsHtml } = await import('/src/utils/weeklyReport.ts');
            const now = new Date('2026-09-27T23:59:59.999+08:00').getTime();
            const note = (id, time, extra = {}) => ({ id, title: id, content: '<p>文字</p>', createdAt: 0, updatedAt: new Date(time).getTime(), ...extra });
            const notes = [note('monday', '2026-09-21T00:00:00+08:00'), note('sunday', '2026-09-27T23:59:59.999+08:00'),
                note('previous', '2026-09-20T23:59:59.999+08:00'), note('next', '2026-09-28T00:00:00+08:00'),
                note('trash', '2026-09-22', { deletedAt: now }), note('report', '2026-09-22', { kind: 'weekly-report' }), note('invalid', 'bad'),
                note('image', '2026-09-22', { content: '<img src="data:image/png;base64,PRIVATE"><div data-type="attachment">PRIVATE FILE</div>' }),
                note('old archive', '2026-09-22', { date: '2025-01-01', content: '<ul data-type="taskList"><li data-type="taskItem" data-checked="true" data-completed-at="2026-09-20T20:00:00+08:00"><p>旧父项</p><ul data-type="taskList"><li data-type="taskItem" data-checked="true" data-completed-at="2026-09-22T12:00:00+08:00"><p>新子项</p></li></ul></li><li data-type="taskItem" data-checked="true"><p>未知时间</p></li></ul>' })];
            const source = collectWeeklyNotes(notes, null, now);
            return { source, clean: collectWeeklyNotes(notes, { id: 'previous', title: 'previous', content: '<p>文字</p>' }, now).sources.map(n => n.id),
                dirty: collectWeeklyNotes(notes, { id: 'previous', title: 'previous', content: '<p>当前未保存草稿</p>' }, now).sources.map(n => n.id),
                mondayStart: collectWeeklyNotes([], null, new Date('2026-09-21T00:00:00+08:00').getTime()).start,
                html: reportAsHtml('<script>bad</script> & text\nnext') };
        });
        assert.deepEqual(unit.source.sources.map(n => n.id), ['monday', 'old archive', 'sunday']);
        assert.equal(unit.source.start, '2026-09-21'); assert.equal(unit.source.end, '2026-09-27'); assert.equal(unit.mondayStart, '2026-09-21');
        assert.equal(unit.source.completed, 1); assert.equal(unit.source.undatedCompleted, 1);
        assert.match(unit.source.sources[1].text, /非本周完成/); assert.match(unit.source.sources[1].text, /本周完成/);
        assert.ok(!unit.clean.includes('previous')); assert.ok(unit.dirty.includes('previous'));
        assert.equal(unit.html, '<p>&lt;script&gt;bad&lt;/script&gt; &amp; text</p><p>next</p>');
        console.log('Passed: local week boundaries, edited date, draft overlay, exclusions, independent completion dates and escaped output');
    }
    const now = Date.now(); const monday = new Date(now); monday.setHours(0, 0, 0, 0); monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7);
    const makeNote = (id, content, extra = {}) => ({ id, title: id, content, date: '2025-01-01', createdAt: monday.getTime() - 86400000, updatedAt: now - 1000, tags: [], ...extra });
    const fixtures = [makeNote('本周随记', '<p>正在确认部署方案，下周一提交验收资料。</p><ul data-type="taskList"><li data-type="taskItem" data-checked="true" data-completed-at="' + new Date(now - 1000).toISOString() + '"><p>完成接口回归测试</p></li></ul>'),
        makeNote('本周补充', '<p>本周补充内容</p>'), makeNote('上周未修改', '<p>不应发送上周内容</p>', { updatedAt: monday.getTime() - 1 }),
        makeNote('回收站内容', '<p>不应发送回收站</p>', { deletedAt: now }), makeNote('已生成周报', '<p>不应反馈周报</p>', { kind: 'weekly-report' })];
    const seed = async (notes = fixtures, configured = true) => {
        const value = await page.evaluate(() => JSON.parse(localStorage.getItem('project-todo-app')));
        Object.assign(value.state, { activeView: 'notes', notes, selectedNoteId: notes[0]?.id ?? null, noteViewMode: 'tree', noteSearchText: '', activeNoteTagId: 'all' });
        value.state.settings.ai = configured ? { activeProviderId: 'custom-weekly', providers: [{ id: 'custom-weekly', type: 'custom', name: '测试接口', model: 'test-weekly', apiEndpoint: endpoint, apiKey: 'test-only-not-a-real-key' }] } : { providers: [] };
        const raw = JSON.stringify(value);
        if (native) await writeFile(dataPath, raw); else await page.evaluate(raw => localStorage.setItem('project-todo-app', raw), raw);
        await page.reload(); await page.getByRole('button', { name: '一键生成周报', exact: true }).waitFor();
    };
    const panel = page.getByRole('region', { name: '本周周报', exact: true });
    const open = async () => { await page.getByRole('button', { name: '一键生成周报', exact: true }).click(); await panel.waitFor(); };
    const close = () => page.getByRole('button', { name: '返回待办', exact: true }).click();
    const content = page.getByRole('textbox', { name: '周报正文', exact: true });
    await seed(); const editorBounds = await page.getByRole('region', { name: '随记编辑区' }).boundingBox();
    replies.push({}); const before = requests.length; await open();
    await until(async () => await content.inputValue() === example, 'One-click report should generate');
    assert.equal(requests.length, before + 1);
    const sent = JSON.parse(requests.at(-1).messages.at(-1).content);
    assert.deepEqual(sent.notes.map(n => n.title), ['本周随记', '本周补充']); assert.match(sent.notes[0].content, /本周完成/);
    await page.screenshot({ path: `${output}/report.png` });
    assert.deepEqual(await page.getByRole('region', { name: '随记编辑区' }).boundingBox(), editorBounds);
    assert.equal(await page.getByRole('dialog', { name: '本周周报' }).count(), 0);
    assert.equal(await page.locator('.notes-center-ai-panel .weekly-report-panel').count(), 1);
    await page.getByRole('button', { name: '一键生成周报', exact: true }).click();
    assert.equal(requests.length, before + 1, 'Reopening the active panel must not duplicate generation');
    await content.fill(example + '\n补充编辑 <script>not code</script> & 已核对');
    await page.evaluate(() => { Object.defineProperty(navigator.clipboard, 'writeText', { configurable: true, value: async text => { window.__weeklyCopied = text; } }); });
    await page.getByRole('button', { name: '复制周报' }).click(); assert.match(await page.evaluate(() => window.__weeklyCopied), /补充编辑/);
    const notesBeforeSave = (await store()).notes.length;
    if (native) {
        const backup = dataPath + '.weekly-save-check'; await rename(dataPath, backup); await mkdir(dataPath);
        try { await page.getByRole('button', { name: '保存为随记' }).click(); await page.getByRole('alert').filter({ hasText: '无法写入数据' }).waitFor(); assert.match(await content.inputValue(), /补充编辑/); }
        finally { await rmdir(dataPath); await rename(backup, dataPath); }
    }
    await page.getByRole('button', { name: '保存为随记' }).click(); await page.getByText('已保存为随记', { exact: true }).waitFor();
    assert.equal(await panel.isVisible(), true);
    await until(async () => (await store()).notes.length === notesBeforeSave + 1, 'Save report once');
    if (native) await until(async () => JSON.parse(await readFile(dataPath, 'utf8')).state.notes.length === notesBeforeSave + 1, 'Native report persisted');
    await page.reload(); await page.getByRole('textbox', { name: '随记正文', exact: true }).waitFor();
    const saved = (await store()).notes[0]; assert.equal(saved.kind, 'weekly-report'); assert.match(saved.content, /&lt;script&gt;/);
    assert.equal((await store()).notes.find(n => n.id === fixtures[0].id).content, fixtures[0].content);
    replies.push({}); await open(); await until(async () => await content.inputValue() === example, 'Regenerate excluding report');
    assert.equal(JSON.parse(requests.at(-1).messages.at(-1).content).notes.length, 2);
    replies.push({ delay: 5000, payload: { report: 'cancelled result' } }); const count = requests.length;
    await page.getByRole('button', { name: '重新生成' }).click(); await until(() => requests.length > count, 'Delayed request began');
    await page.getByRole('button', { name: '取消生成' }).click(); assert.equal(await content.inputValue(), example);
    for (const [reply, message] of [[{ payload: { bad: true } }, '没有返回有效'], [{ status: 500 }, '500'], [{ finish: 'length' }, '截断']]) {
        replies.push(reply); await page.getByRole('button', { name: '重新生成' }).click(); await page.getByRole('alert').filter({ hasText: message }).waitFor(); assert.equal(await content.inputValue(), example);
    }
    await close(); await seed(fixtures, false); const unconfiguredCount = requests.length; await open();
    await panel.getByRole('button', { name: '配置 AI', exact: true }).waitFor(); assert.equal(requests.length, unconfiguredCount);
    await panel.getByRole('button', { name: '配置 AI', exact: true }).click(); await page.locator('#ai-provider-name').waitFor();
    await page.locator('.ai-settings-close-btn').click(); await page.locator('#ai-provider-name').waitFor({ state: 'hidden' });
    await close(); await seed([], true); await open(); await page.getByText('本周还没有可汇总的随记', { exact: true }).waitFor(); assert.equal(requests.length, unconfiguredCount); await close();
    await seed(); const body = page.getByRole('textbox', { name: '随记正文', exact: true });
    await body.click(); await body.press('Control+End'); await page.keyboard.type('LIVE-DRAFT-WEEKLY');
    replies.push({}); await open(); await until(async () => await content.inputValue() === example, 'Draft report generated'); assert.match(requests.at(-1).messages.at(-1).content, /LIVE-DRAFT-WEEKLY/);
    for (const width of [1100, 1186, 1538, 1920]) {
        await page.setViewportSize({ width, height: 700 }); const bounds = await panel.boundingBox();
        assert.ok(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= width && bounds.y + bounds.height <= 700);
        const saveBounds = await page.getByRole('button', { name: '保存为随记' }).boundingBox();
        assert.ok(saveBounds.y + saveBounds.height <= 700, 'Save action remains visible without scrolling');
    }
    await page.screenshot({ path: `${output}/report-wide.png` });
    replies.push({ delay: 180000 }); const timeoutCount = requests.length;
    await page.clock.install(); await page.getByRole('button', { name: '重新生成' }).click();
    await until(() => requests.length > timeoutCount, 'Timeout request started');
    await page.clock.fastForward(121000); await page.getByRole('alert').filter({ hasText: '生成超时' }).waitFor();
    assert.equal(await content.inputValue(), example); await page.clock.resume();
    replies.push({ delay: 5000, payload: { report: 'stale closed dialog' } }); const closingCount = requests.length;
    await page.getByRole('button', { name: '重新生成' }).click(); await until(() => requests.length > closingCount, 'Close request started'); await close();
    replies.push({}); await open(); await until(async () => await content.inputValue() === example, 'Reopened dialog uses its own request');
    await close(); assert.deepEqual(errors, []);
    console.log('Passed: generation, source scope, live draft, edit/copy/save/reload, cancel, errors/truncation, setup/empty states and reused side panel layout');
} catch (error) { if (page) await page.screenshot({ path: `${output}/failure.png` }).catch(() => {}); throw error; }
finally { if (browser) await browser.close(); if (server) await server.close(); mock.closeAllConnections(); await new Promise(resolve => mock.close(resolve)); }

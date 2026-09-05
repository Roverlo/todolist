import assert from 'node:assert/strict';
import { mkdir, readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { chromium } from 'playwright';
import { createServer as createViteServer } from 'vite';

// Fresh browser storage, or the explicitly isolated data directory from test-portable.ps1.
const cdp = process.argv[process.argv.indexOf('--cdp') + 1];
const native = process.argv.includes('--cdp');
const dataPath = native ? process.argv[process.argv.indexOf('--data') + 1] : null;
const output = 'ui-check.local/annotation-workflow-' + (native ? 'native' : 'browser');
await mkdir(output, { recursive: true });
const requests = [];
const replies = [];
const mock = createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    if (req.method === 'OPTIONS') { res.end(); return; }
    let body = '';
    for await (const chunk of req) body += chunk;
    const request = { body: JSON.parse(body), at: Date.now(), cancelled: false };
    requests.push(request);
    const reply = replies.shift() || { status: 500, payload: { error: { message: 'Unexpected test request' } } };
    const timer = setTimeout(() => {
        res.writeHead(reply.status || 200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(reply.status ? reply.payload : { choices: [{ message: { content: JSON.stringify(reply.payload) } }] }));
    }, reply.delay || 10);
    res.on('close', () => { clearTimeout(timer); request.cancelled = !res.writableEnded; });
});
await new Promise(resolve => mock.listen(0, '127.0.0.1', resolve));
const endpoint = `http://127.0.0.1:${mock.address().port}/v1`;
const until = async (check, message, milliseconds = 8000) => {
    const deadline = Date.now() + milliseconds;
    while (Date.now() < deadline) {
        if (await check()) return;
        await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.fail(message);
};
let server, browser, page;
const errors = [];
try {
    if (native) {
        assert.ok(dataPath, '--data is required for the isolated native check');
        browser = await chromium.connectOverCDP(`http://127.0.0.1:${cdp}`);
        page = browser.contexts()[0].pages()[0];
    } else {
        server = await createViteServer({
            logLevel: 'error', server: { host: '127.0.0.1', port: 0 },
            plugins: [{ name: 'browser-only-native-http-test', enforce: 'pre', transform(code, id) {
                if (id.replaceAll('\\', '/').endsWith('/src/services/ai/index.ts')) {
                    return code.replace("import { fetch } from '@tauri-apps/plugin-http';", 'const fetch = globalThis.fetch.bind(globalThis);');
                }
            } }],
        });
        await server.listen();
        browser = await chromium.launch({ channel: 'msedge', headless: true });
        page = await browser.newPage({ timezoneId: 'Asia/Shanghai' });
        await page.goto(server.resolvedUrls.local[0]);
    }
    await page.setViewportSize({ width: 1538, height: 698 });
    page.on('pageerror', error => errors.push(error.message));
    const store = () => page.evaluate(() => JSON.parse(localStorage.getItem('project-todo-app')).state);
    const reminder = page.getByRole('button', { name: '我知道了' });
    if (await reminder.isVisible()) await reminder.click();
    if (!await page.getByRole('textbox', { name: '随记正文', exact: true }).isVisible()) {
        await page.getByTitle('切换到随记中心', { exact: true }).click();
        await page.getByRole('button', { name: '创建新随记' }).click();
    }
    const body = page.getByRole('textbox', { name: '随记正文', exact: true });
    const panel = page.getByRole('complementary', { name: 'AI 助手面板' });
    await body.waitFor();
    await page.getByPlaceholder('标题（可选）').fill('批注回归验证');
    await body.fill('刚输入：周三完成接口联调，每周日整理周报。');
    assert.equal(await page.getByRole('button', { name: '隐藏 AI 助手', exact: true }).getAttribute('aria-pressed'), 'true');
    assert.equal(await page.getByRole('button', { name: 'AI 设置', exact: true }).locator('svg.lucide-settings').count(), 1);
    assert.match(await page.getByRole('button', { name: '隐藏 AI 助手', exact: true }).innerText(), /AI助手：一键生成待办事项/);
    const caption = page.locator('.editor-toolbar-group > .editor-group-label').first();
    const purple = await caption.evaluate(el => getComputedStyle(el).color);
    const originalTheme = await page.evaluate(() => {
        const previous = document.documentElement.getAttribute('data-theme');
        document.documentElement.setAttribute('data-theme', 'blue');
        return previous;
    });
    assert.notEqual(await caption.evaluate(el => getComputedStyle(el).color), purple, 'Toolbar captions must follow the app theme');
    await page.evaluate(theme => document.documentElement.setAttribute('data-theme', theme), originalTheme);
    await page.getByRole('combobox', { name: '编号样式', exact: true }).click();
    await page.screenshot({ path: join(output, 'editor-dropdown.png') });
    await page.getByRole('combobox', { name: '编号样式', exact: true }).press('Escape');


    await panel.getByRole('button', { name: '配置 AI', exact: true }).click();
    await page.locator('#ai-provider-name').fill('本机模拟接口');
    await page.locator('#ai-api-key').fill('test-only-not-a-real-key');
    await page.locator('#ai-model').fill('mock-model');
    await page.locator('#ai-endpoint').fill(endpoint);
    await page.getByRole('button', { name: '保存并选中', exact: true }).click();
    assert.equal(await page.locator('.ai-settings-modal').count(), 0, 'Saving config should return directly to generation');
    const generate = () => panel.locator('.ai-panel-generate-btn').click();
    replies.push({ delay: 15000, payload: { tasks: [{ title: '不应出现的旧结果' }] } });
    await body.fill('最新输入：周三完成接口联调，每周日整理周报。');
    const clickedAt = Date.now();
    await generate();
    await until(() => requests.length === 1, 'Generation did not start immediately');
    assert.ok(requests[0].at - clickedAt < 1800, 'No artificial wait before the request');
    const prompt = requests[0].body.messages.at(-1).content;
    assert.match(prompt, /最新输入：周三完成接口联调/);
    assert.doesNotMatch(prompt, /<p>|data:image/);
    await panel.getByRole('button', { name: '取消生成', exact: true }).click();
    await until(() => requests[0].cancelled, 'Cancel did not abort the network request');
    assert.equal(await panel.locator('.task-preview-card').count(), 0);

    const initialTasks = (await store()).tasks.length;
    replies.push({ payload: { tasks: [
        { title: '接口联调', dueDate: '2026-09-09', owner: '测试责任人', priority: 'high', subtasks: [{ title: '核对清单' }] },
        { title: '每周日整理周报', isRecurring: true, recurringHint: '每周日', priority: 'unexpected' },
    ] } });
    await generate();
    await page.getByLabel('任务 1 标题', { exact: true }).waitFor();
    assert.equal(await panel.locator('.task-preview-card').count(), 2);
    await page.getByRole('button', { name: '隐藏 AI 助手', exact: true }).click();
    assert.equal(await panel.isVisible(), false);
    await page.getByRole('button', { name: '显示 AI 助手', exact: true }).click();
    assert.equal(await panel.locator('.task-preview-card').count(), 2, 'Hiding the panel must preserve previews');
    await page.getByLabel('任务 1 标题', { exact: true }).fill('确认后的接口联调');
    await page.getByRole('button', { name: '展开任务 1 详情', exact: true }).click();
    await panel.getByRole('button', { name: '添加子任务', exact: true }).click();
    await page.getByRole('checkbox', { name: '选择任务 2', exact: true }).uncheck();
    await panel.locator('.ai-panel-body').evaluate(el => { el.scrollTop = 0; });
    await page.screenshot({ path: join(output, 'ai-results.png') });
    await panel.getByRole('button', { name: '加入待办（1）', exact: true }).click();
    await until(async () => (await store()).tasks.length === initialTasks + 1, 'Selected task was not saved');
    const saved = (await store()).tasks.find(task => task.title === '确认后的接口联调');
    assert.equal(saved.dueDate, '2026-09-09');
    assert.equal(saved.subtasks.length, 1, 'An empty subtask must not be saved');
    assert.equal(await panel.locator('.task-preview-card').count(), 1, 'Keep the unselected result');
    await page.getByRole('checkbox', { name: '选择任务 1', exact: true }).check();
    await panel.getByRole('button', { name: '加入待办（1）', exact: true }).click();
    await until(async () => (await store()).tasks.length === initialTasks + 2, 'Recurring task was not saved');
    const recurring = (await store()).tasks.find(task => task.title === '每周日整理周报');
    assert.equal(new Date(recurring.dueDate + 'T12:00:00').getDay(), 0, 'Weekly Sunday must remain Sunday');
    assert.equal(recurring.priority, 'medium', 'Invalid model priority should use the default');
    assert.ok((await store()).recurringTemplates.some(template => template.id === recurring.extras.recurrenceId));
    assert.equal(await panel.locator('.task-preview-card').count(), 0, 'Saved previews cannot be added twice');

    replies.push({ payload: { tasks: [{ title: '' }] } });
    await generate();
    await panel.getByRole('alert').waitFor();
    assert.match(await panel.getByRole('alert').innerText(), /没有标题/);
    replies.push({ payload: { tasks: [] } });
    await panel.getByRole('button', { name: '重试生成', exact: true }).click();
    await panel.getByText('没有识别到待办。可以补充具体行动后重新生成。', { exact: true }).waitFor();
    replies.push({ delay: 15000, payload: { tasks: [{ title: '不应串到下一篇' }] } });
    await generate();
    await until(() => requests.length === 5, 'Missing note-switch request');
    await page.getByRole('button', { name: '新增当日随记', exact: true }).click();
    await until(() => requests[4].cancelled, 'Switching notes did not abort the previous request');
    assert.equal(await panel.locator('.task-preview-card').count(), 0);
    console.log('Passed: live drafts, real cancellation, note switching, editable selection, partial save, recurrence, error retry and empty result');

    await body.fill('链接与图片回归');
    await body.press('Control+A');
    await page.getByRole('button', { name: '插入链接', exact: true }).click();
    const link = page.getByRole('dialog', { name: '插入链接', exact: true });
    await link.getByLabel('链接地址', { exact: true }).fill('example.com');
    const clipped = await link.evaluate(dialog => {
        const outer = dialog.getBoundingClientRect();
        return [...dialog.querySelectorAll('input, footer button')].some(el => {
            const r = el.getBoundingClientRect();
            return r.top < outer.top || r.bottom > outer.bottom || r.left < outer.left || r.right > outer.right;
        });
    });
    assert.equal(clipped, false, 'Link controls must be entirely inside the dialog');
    await page.screenshot({ path: join(output, 'link-dialog.png') });
    await link.getByRole('button', { name: '应用链接', exact: true }).click();
    assert.equal(await body.locator('a').getAttribute('href'), 'https://example.com');
    await body.press('Control+End');
    await body.press('Enter');
    await page.getByRole('button', { name: '插入图片', exact: true }).click();
    const picture = page.getByRole('dialog', { name: '插入图片', exact: true });
    assert.equal(await picture.getByLabel('图片说明（选填）', { exact: true }).count(), 1);
    assert.equal(await picture.getByRole('button', { name: '打开图片文件夹', exact: true }).isEnabled(), native);
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6Wb8AAAAASUVORK5CYII=', 'base64');
    await picture.locator('input[type="file"]').setInputFiles({ name: '验证图片.png', mimeType: 'image/png', buffer: png });
    await picture.getByLabel('图片说明（选填）', { exact: true }).fill('用于验证的图片');
    await page.screenshot({ path: join(output, 'image-dialog.png') });
    await picture.getByRole('button', { name: '插入图片', exact: true }).click();
    await body.locator('img').waitFor();
    assert.match(await body.locator('img').getAttribute('src'), /^data:image\/png;base64,/);
    await page.getByRole('button', { name: '保存', exact: true }).click();
    if (native) {
        const filename = createHash('sha256').update(png).digest('hex') + '.png';
        const imagePath = join(dirname(dataPath), 'images', filename);
        assert.deepEqual(await readFile(imagePath), png, 'The actual native image file must match the upload');
        assert.ok((await readdir(dirname(imagePath))).includes(filename));
    }
    console.log('Passed: complete link dialog, image explanation, embedded copy' + (native ? ' and actual native file storage' : ''));

    await page.getByTitle('切换到待办事项', { exact: true }).click();
    const dashboard = page.locator('.dashboard-row');
    const geometry = () => dashboard.evaluate(el => {
        const rect = el.getBoundingClientRect();
        return { height: rect.height, top: rect.top, next: el.nextElementSibling.getBoundingClientRect().top };
    });
    const before = await geometry();
    for (let i = 0; i < 2; i++) {
        await page.getByRole('button', { name: '展开/收起筛选', exact: true }).click();
        assert.deepEqual(await geometry(), before, 'Filter toggle must not move the task table');
        const dropdown = page.getByRole('combobox', { name: '筛选优先级', exact: true });
        await dropdown.click();
        await dropdown.press('Home');
        await dropdown.press('ArrowDown');
        await dropdown.press('Enter');
        assert.equal((await store()).filters.priority, 'high');
        await dropdown.click();
        await dropdown.press('Escape');
        assert.equal(await page.getByRole('listbox').count(), 0);
        assert.equal(await page.getByRole('region', { name: '任务筛选' }).isVisible(), true);
        await page.getByLabel('截止日期起', { exact: true }).fill('2026-09-01');
        await page.getByRole('button', { name: '清空筛选', exact: true }).click();
        assert.equal((await store()).filters.priority, 'all');
        assert.equal(await page.getByLabel('截止日期起', { exact: true }).inputValue(), '');
        await page.screenshot({ path: join(output, 'filters.png') });
        await page.getByRole('button', { name: '展开/收起筛选', exact: true }).click();
        assert.deepEqual(await geometry(), before);
    }
    assert.ok(before.height <= 54, 'Filter row should be no taller than the stats bar');
    assert.doesNotMatch(await page.locator('.main-header').innerText(), /🔍|⚙️/);
    await page.locator('.about-pill').hover();
    assert.match(await page.locator('.tooltip-names').innerText(), /桂树奇/);
    assert.deepEqual(errors, []);
    console.log(`Passed: fixed ${before.height}px filter row, keyboard dropdowns, icons and thanks`);
    console.log('Annotation workflow checks passed (' + (native ? 'packaged native transport' : 'isolated browser') + ')');
} catch (error) {
    if (page) {
        await page.screenshot({ path: join(output, 'failure.png') }).catch(() => {});
        console.error((await page.locator('body').innerText().catch(() => '')).slice(-5000));
    }
    throw error;
} finally {
    if (browser) await browser.close();
    if (server) await server.close();
    mock.closeAllConnections();
    await new Promise(resolve => mock.close(resolve));
}
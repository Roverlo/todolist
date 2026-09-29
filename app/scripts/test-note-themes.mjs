import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createServer } from 'vite';

// A fresh browser context keeps theme changes and fictional notes out of user storage.
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1480, height: 900 }, timezoneId: 'Asia/Shanghai' });
const server = await createServer({ cacheDir: 'node_modules/.vite-test-note-themes', logLevel: 'error', server: { host: '127.0.0.1', port: 0, strictPort: false } });
const output = 'ui-check.local/note-themes';
await mkdir(output, { recursive: true });
const baseline = process.argv.includes('--baseline');
const errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
    await server.listen();
    await page.addInitScript(() => {
        if (!localStorage.getItem('project-todo-app')) localStorage.setItem('project-todo-app', JSON.stringify({ version: 12, state: {
            settings: { updateCheck: { checkOnStartup: false, autoCheck: false, checkInterval: 60 } },
        } }));
    });
    await page.goto(server.resolvedUrls.local[0], { waitUntil: 'commit', timeout: 90000 });
    await page.getByTitle('切换到随记中心', { exact: true }).waitFor({ timeout: 90000 });
    const reminder = page.getByRole('button', { name: '我知道了' });
    if (await reminder.isVisible()) await reminder.click();
    await page.getByTitle('切换到随记中心', { exact: true }).click();
    await page.getByRole('button', { name: '创建新随记' }).click();
    const body = page.getByRole('textbox', { name: '随记正文', exact: true });
    await body.waitFor();
    await page.getByRole('textbox', { name: '随记标题', exact: true }).fill('主题联动检查');
    await body.evaluate(root => root.editor.commands.setContent(
        '<p><strong>本周工作记录</strong> <time data-type="noteDate" datetime="2026-09-29">2026-09-29</time></p>'
        + '<p><a href="https://example.com">项目资料链接</a> · <span style="color:#008000">自定义绿色正文</span> · <mark data-color="#fff200" style="background-color:#fff200">自定义黄色高亮</mark></p>'
        + '<blockquote><p>引用：检查界面跟随主题，保留用户指定的正文颜色。</p></blockquote>'
        + '<table><tbody><tr><th><p>事项</p></th><th><p>状态</p></th></tr><tr><td><p>界面检查</p></td><td><p>进行中</p></td></tr></tbody></table>'
        + '<ul data-type="taskList"><li data-type="taskItem" data-checked="true" data-created-at="2026-09-28T01:30:00Z" data-completed-at="2026-09-28T03:20:00Z"><p>完成接口联调</p></li>'
        + '<li data-type="taskItem" data-checked="false" data-created-at="2026-09-28T02:00:00Z"><p>整理验收资料</p></li></ul>'));
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await page.evaluate(async () => {
        const store = (await import('/src/state/appStore.ts')).useAppStore.getState();
        store.setSettings({
            noteTaskTime: { showCreated: true, showCompleted: true, createdColor: '#123456', completedColor: '#654321' },
            ai: { ...store.settings.ai, activeProviderId: 'theme-fixture', providers: [
                { id: 'theme-fixture', name: '主题测试接口', model: '', apiEndpoint: '', apiKey: '' },
            ] },
        });
    });
    const savedNotes = () => page.evaluate(() => JSON.parse(localStorage.getItem('project-todo-app')).state.notes);
    const before = await savedNotes();
    const htmlBefore = await body.evaluate(root => root.editor.getHTML());
    const results = [];
    const check = async (selector, property, token, pseudo = null) => {
        const result = await page.locator(selector).first().evaluate((el, { property, token, pseudo }) => {
            const probe = document.createElement('span');
            probe.style.color = token.startsWith('--') ? `var(${token})` : token;
            document.body.append(probe);
            const expected = getComputedStyle(probe).color;
            probe.remove();
            return { actual: getComputedStyle(el, pseudo)[property], expected };
        }, { property, token, pseudo });
        if (!baseline) assert.equal(result.actual, result.expected, `${selector} ${property} must follow ${token}`);
        return { selector, property, ...result };
    };
    for (const theme of baseline ? ['green'] : ['blue', 'green', 'purple', 'orange', 'mono', 'sky', 'rose', 'indigo']) {
        await page.mouse.move(0, 0);
        await page.evaluate(async colorScheme => (await import('/src/state/appStore.ts')).useAppStore.getState().setSettings({ colorScheme }), theme);
        await page.waitForFunction(theme => document.documentElement.dataset.theme === theme, theme);
        // Let the app's existing color transitions settle before checking their final colors.
        await page.waitForTimeout(350);
        const colors = [];
        for (const [selector, property, token] of [
            ['.note-editor-actions .btn-primary', 'backgroundColor', '--primary'],
            ['.note-editor-actions .btn-light', 'color', '--text-secondary'],
            ['.notes-center-ai-panel', 'borderLeftColor', '--border'],
            ['.note-task-progress-value', 'stroke', '--primary'],
            ['.notes-ai-action[data-state="on"]', 'color', '--primary'],
            ['.note-date-chip', 'color', '--primary'],
            ['.note-editor .ProseMirror a', 'color', '--primary'],
            ['.note-editor .ProseMirror blockquote', 'borderLeftColor', '--primary'],
            ['.note-editor .ProseMirror th', 'backgroundColor', '--primary-soft'],
        ]) colors.push(await check(selector, property, token));
        await page.locator('.note-editor-actions .btn-primary').hover();
        await page.waitForTimeout(250);
        colors.push(await check('.note-editor-actions .btn-primary', 'backgroundColor', '--primary-hover'));
        await page.mouse.move(0, 0);
        if (!baseline) {
            await body.evaluate(root => {
                const cells = [];
                root.editor.state.doc.descendants((node, pos) => { if (node.type.name === 'tableHeader') cells.push(pos); });
                root.editor.commands.setCellSelection({ anchorCell: cells[0], headCell: cells[1] });
            });
            colors.push(await check('.note-editor .selectedCell', 'backgroundColor', 'rgba(var(--primary-rgb), 0.13)', '::after'));
            await body.evaluate(root => root.editor.commands.setTextSelection(2));
            await page.locator('.editor-tool-button[aria-label="加粗"][data-state="on"]').waitFor();
            await page.waitForTimeout(200);
            colors.push(await check('.editor-tool-button[aria-label="加粗"]', 'color', '--primary'));
            await page.getByRole('button', { name: '插入日期', exact: true }).click();
            colors.push(await check('.editor-insert-dialog .editor-dialog-primary', 'backgroundColor', '--primary'));
            colors.push(await check('.editor-date-preview .note-date-chip', 'color', '--primary'));
            await page.getByRole('button', { name: '关闭插入窗口', exact: true }).click();
            await page.getByRole('button', { name: 'AI 设置', exact: true }).click();
            await page.locator('.ai-btn-add').click();
            await page.locator('.ai-provider-item:not(.active)').hover();
            colors.push(await check('.ai-provider-item:not(.active)', 'backgroundColor', '--primary-soft'));
            await page.locator('.ai-settings-modal').getByRole('button', { name: '关闭', exact: true }).click();
            await page.mouse.move(0, 0);
        }
        for (const [selector, expected] of [
            ['.note-task-created-at', 'rgb(18, 52, 86)'], ['.note-task-completed-at', 'rgb(101, 67, 33)'],
            ['span[style*="color"]', 'rgb(0, 128, 0)'],
        ]) assert.equal(await body.locator(selector).first().evaluate(el => getComputedStyle(el).color), expected);
        assert.equal(await body.locator('mark').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(255, 242, 0)');
        if (baseline || ['green', 'orange', 'mono'].includes(theme)) await page.screenshot({ path: `${output}/${baseline ? 'before-' : ''}${theme}.png` });
        results.push({ theme, colors });
    }
    if (!baseline) {
        await page.reload();
        await body.waitFor();
        assert.equal(await page.locator('html').getAttribute('data-theme'), 'indigo', 'Selected theme survives reload');
        await check('.note-editor-actions .btn-primary', 'backgroundColor', '--primary');
    }
    assert.equal(await body.evaluate(root => root.editor.getHTML()), htmlBefore, 'Theme switching must not rewrite document formatting');
    assert.deepEqual(await savedNotes(), before, 'Theme switching must not change notes or their edit times');
    assert.deepEqual(errors, []);
    await writeFile(`${output}/${baseline ? 'before' : 'result'}.json`, JSON.stringify(results, null, 2));
    console.log(baseline ? JSON.stringify(results, null, 2) : 'PASS: eight themes, note/AI controls, links, tables, dates, hover, custom text/time colors and unchanged note data');
} catch (error) {
    await page.screenshot({ path: `${output}/failure.png` }).catch(() => {});
    throw error;
} finally {
    await browser.close();
    await server.close();
}

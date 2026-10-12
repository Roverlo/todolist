import assert from 'node:assert/strict';
import { mkdir, readFile, rename, rmdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const arg = name => process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : undefined;
const cdp = arg('--cdp'), dataPath = arg('--data'), executable = arg('--executable');
const native = !!cdp;
const output = resolve('ui-check.local', `settings-center-${native ? 'native' : 'browser'}`);
await mkdir(output, { recursive: true });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const until = async (check, label) => { for (let i = 0; i < 100; i++) { if (await check()) return; await sleep(100); } assert.fail(label); };
let browser, page, restarted;
const errors = [];
const attach = async () => {
    browser = native ? await chromium.connectOverCDP(`http://127.0.0.1:${cdp}`) : await chromium.launch({ channel: 'msedge', headless: true });
    page = native ? browser.contexts()[0].pages()[0] : await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on('pageerror', error => errors.push(error.message));
};
const open = async tab => {
    const reminder = page.getByRole('button', { name: '我知道了', exact: true });
    if (await reminder.isVisible()) await reminder.click();
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('dialog', { name: '设置', exact: true }).waitFor();
    if (tab) await page.getByRole('tab', { name: tab, exact: true }).click();
};
const tab = name => page.getByRole('tab', { name, exact: true }).click();
const close = () => page.getByRole('button', { name: '关闭设置', exact: true }).click();
const pressed = name => until(async () => await page.getByRole('button', { name, exact: true }).getAttribute('aria-pressed') === 'true', name);
const downloads = () => page.evaluate(() => window.__TAURI_INTERNALS__.invoke('downloads_request', { request: { action: 'list' } }));
const saved = async () => JSON.parse(await readFile(dataPath, 'utf8')).state;

try {
    if (native) assert.equal(resolve(dataPath), resolve(process.env.PROJECTTODO_TEST_DATA_DIR, 'data.json'));
    await attach();
    if (!native) {
        await page.addInitScript(() => {
            if (!localStorage.getItem('project-todo-app')) localStorage.setItem('project-todo-app', JSON.stringify({ version: 12, state: {
                activeView: 'tasks', settings: { colorScheme: 'blue', dueReminderEnabled: false, updateCheck: { checkOnStartup: false, autoCheck: false, checkInterval: 60 } },
            } }));
        });
        await page.goto('http://127.0.0.1:52923/');
    }
    for (const view of ['待办事项', '随记中心', '下载中心']) {
        await page.getByTitle(`切换到${view}`, { exact: true }).click();
        await page.getByRole('button', { name: '设置', exact: true }).waitFor();
        assert.equal(await page.getByRole('button', { name: '设置', exact: true }).count(), 1);
        const settingsBounds = await page.getByRole('button', { name: '设置', exact: true }).boundingBox();
        assert.ok(settingsBounds.x > (await page.evaluate(() => innerWidth)) - 150 && settingsBounds.y < 180, `${view}: settings stays at top right`);
        assert.equal(await page.getByRole('button', { name: /^(AI 设置|下载设置|更改主题色)$/ }).count(), 0);
        await open();
        assert.equal(await page.getByRole('tab').count(), 6);
        await close();
    }
    await page.getByTitle('收起侧边栏', { exact: true }).click();
    await open(); await close();
    await page.getByTitle('展开侧边栏', { exact: true }).click();
    await open();
    await page.getByRole('button', { name: '清新绿', exact: true }).click(); await pressed('清新绿');
    await page.getByRole('button', { name: '大 · 14px', exact: true }).click(); await pressed('大 · 14px');
    for (const option of ['最小化到托盘', '直接退出', '每次询问']) {
        await page.getByRole('button', { name: option, exact: true }).click(); await pressed(option);
    }
    await tab('待办与提醒');
    await page.getByRole('switch', { name: /任务高亮/ }).check();
    await page.getByRole('switch', { name: /启动时提醒到期任务/ }).uncheck();
    await tab('AI 配置');
    await page.getByLabel('显示名称', { exact: true }).fill('统一设置测试接口');
    await page.locator('#ai-api-key').fill('fake-settings-key');
    await page.getByLabel('模型名称', { exact: false }).fill('settings-test-model');
    await page.getByLabel('接口 URL', { exact: false }).fill('http://127.0.0.1:1/v1');
    await tab('下载');
    const limit = page.getByRole('spinbutton', { name: '总速度上限（KiB/s）', exact: true });
    await limit.fill('123');
    await tab('关于与更新');
    await page.getByLabel('服务器地址', { exact: true }).fill('http://127.0.0.1:1/draft');
    await tab('AI 配置');
    assert.equal(await page.getByLabel('显示名称', { exact: true }).inputValue(), '统一设置测试接口');
    assert.equal(await page.getByLabel('模型名称', { exact: false }).inputValue(), 'settings-test-model');
    await page.getByRole('button', { name: '保存并选中', exact: true }).click();
    await page.getByText('AI 配置已保存并选中', { exact: true }).waitFor();
    if (native) {
        await until(async () => (await saved()).settings.ai.providers[0]?.model === 'settings-test-model', 'AI reached disk');
        const backup = dataPath + '.settings-test-backup';
        await rename(dataPath, backup); await mkdir(dataPath);
        try {
            await page.getByLabel('模型名称', { exact: false }).fill('failed-model-draft');
            await page.getByRole('button', { name: '保存并选中', exact: true }).click();
            await page.getByText(/AI 配置保存失败/).waitFor();
            assert.equal(await page.getByLabel('模型名称', { exact: false }).inputValue(), 'failed-model-draft');
        } finally { await rmdir(dataPath); await rename(backup, dataPath); }
        await page.getByLabel('模型名称', { exact: false }).fill('settings-test-model');
        await page.getByRole('button', { name: '保存并选中', exact: true }).click();
        await page.getByText('AI 配置已保存并选中', { exact: true }).waitFor();
    }
    await page.getByRole('button', { name: '新增配置', exact: true }).click();
    await page.getByLabel('显示名称', { exact: true }).fill('可删除的虚构接口');
    await page.locator('#ai-api-key').fill('fake-delete-key');
    await page.getByLabel('模型名称', { exact: false }).fill('delete-test-model');
    await page.getByLabel('接口 URL', { exact: false }).fill('http://127.0.0.1:1/v1');
    await page.getByRole('button', { name: '保存并选中', exact: true }).click();
    await page.getByText('AI 配置已保存并选中', { exact: true }).waitFor();
    if (native) {
        const backup = dataPath + '.delete-test-backup';
        await rename(dataPath, backup); await mkdir(dataPath);
        try {
            page.once('dialog', dialog => dialog.accept());
            await page.getByRole('button', { name: '删除', exact: true }).click();
            await page.getByText(/删除失败，原配置已保留/).waitFor();
            assert.equal(await page.locator('.ai-provider-item').count(), 2);
        } finally { await rmdir(dataPath); await rename(backup, dataPath); }
    }
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: '删除', exact: true }).click();
    await page.getByText('AI 配置已删除', { exact: true }).waitFor();
    assert.equal(await page.locator('.ai-provider-item').count(), 1);
    assert.equal(await page.getByLabel('模型名称', { exact: false }).inputValue(), 'settings-test-model');
    await tab('下载'); assert.equal(await limit.inputValue(), '123');
    if (native) {
        const favorite = join(process.env.PROJECTTODO_TEST_DATA_DIR, 'settings-downloads');
        await mkdir(favorite, { recursive: true });
        await page.getByLabel('默认保存目录', { exact: true }).fill(favorite);
        await page.getByRole('button', { name: '记为常用', exact: true }).click();
        await page.getByRole('button', { name: '已记为常用', exact: true }).waitFor();
        const original = (await downloads()).settings;
        const blocker = join(process.env.PROJECTTODO_TEST_DATA_DIR, 'downloads', 'history.json.tmp');
        await mkdir(blocker);
        try {
            await page.getByRole('button', { name: '保存设置', exact: true }).click();
            await page.locator('.download-preferences [role=alert]').waitFor();
            assert.equal(await limit.inputValue(), '123');
            assert.deepEqual((await downloads()).settings, original);
        } finally { await rmdir(blocker); }
        await page.getByRole('button', { name: '保存设置', exact: true }).click();
        await until(async () => (await downloads()).settings.limitKib === 123, 'Download settings reached disk');
    }
    await tab('关于与更新');
    assert.equal(await page.getByLabel('服务器地址', { exact: true }).inputValue(), 'http://127.0.0.1:1/draft');
    await tab('数据与同步');
    await page.getByRole('button', { name: /^本地备份/ }).click();
    await page.locator('.create-overlay').filter({ hasText: '数据备份与恢复' }).waitFor();
    await page.locator('.create-overlay:not(.settings-overlay)').getByTitle('关闭', { exact: true }).click();
    assert.equal(await page.getByRole('dialog', { name: '设置', exact: true }).isVisible(), true);
    for (const width of [1440, 1100, 760]) {
        await page.setViewportSize({ width, height: 680 });
        for (const category of ['通用与外观', 'AI 配置', '下载', '关于与更新']) {
            await tab(category);
            const bounds = await page.locator('.settings-center').evaluate(element => {
                const rect = element.getBoundingClientRect();
                const content = element.querySelector('.settings-content');
                return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: innerWidth, height: innerHeight, overflow: content.scrollWidth - content.clientWidth };
            });
            assert.ok(bounds.left >= 0 && bounds.right <= bounds.width && bounds.top >= 0 && bounds.bottom <= bounds.height && bounds.overflow <= 1, JSON.stringify(bounds));
            await page.screenshot({ path: join(output, `${width}-${category}.png`) });
        }
    }
    await close();
    if (native) {
        await until(async () => (await saved()).settings.ai.providers[0]?.model === 'settings-test-model', 'Final settings write');
        await page.evaluate(() => window.__TAURI_INTERNALS__.invoke('plugin:process|exit', { code: 0 })).catch(() => {});
        await browser.close(); browser = null;
        await sleep(600);
        restarted = spawn(executable, [], { cwd: dirname(executable), env: process.env, windowsHide: true, stdio: 'ignore' });
        await until(async () => { try { return (await fetch(`http://127.0.0.1:${cdp}/json/version`)).ok; } catch { return false; } }, 'Restarted EXE');
        await attach();
    } else await page.reload();
    await open(); await pressed('清新绿'); await pressed('大 · 14px'); await pressed('每次询问');
    await tab('待办与提醒'); assert.equal(await page.getByRole('switch', { name: /任务高亮/ }).isChecked(), true);
    await tab('AI 配置'); assert.equal(await page.getByLabel('模型名称', { exact: false }).inputValue(), 'settings-test-model');
    if (native) { await tab('下载'); assert.equal(await page.getByRole('spinbutton', { name: '总速度上限（KiB/s）', exact: true }).inputValue(), '123'); assert.equal((await downloads()).favoriteDirectories.length, 1); }
    await close();
    assert.deepEqual(errors, []);
    await writeFile(join(output, 'result.json'), JSON.stringify({ result: 'PASS', native, cases: ['one entry on three pages and collapsed sidebar', 'six categories', 'drafts preserved across categories', 'theme/font/reminder/close preferences', 'AI save', 'child dialog return', 'responsive layout', native ? 'native save failures, download favorites, real EXE restart' : 'reload persistence'], errors }, null, 2));
    console.log('PASS: shared settings center' + (native ? ', native failure recovery and EXE restart' : ', browser'));
} catch (error) {
    await page?.screenshot({ path: join(output, 'failure.png') }).catch(() => {});
    throw error;
} finally {
    if (native && page && !page.isClosed()) await page.evaluate(() => window.__TAURI_INTERNALS__.invoke('plugin:process|exit', { code: 0 })).catch(() => {});
    if (browser) await browser.close();
    if (restarted && restarted.exitCode === null) restarted.kill();
}

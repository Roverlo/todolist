import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile, rename, rmdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { chromium } from 'playwright';
import { preview } from 'vite';

async function eventually(check, timeout = 5000) {
    const end = Date.now() + timeout;
    for (;;) {
        try { await check(); return; }
        catch (error) { if (Date.now() >= end) throw error; }
        await new Promise(resolve => setTimeout(resolve, 100));
    }
}
const hasValue = (locator, expected) => eventually(async () => assert.equal(await locator.inputValue(), expected));
const hasText = (locator, expected, timeout) => eventually(async () => assert.ok((await locator.innerText()).includes(expected), 'Expected feedback: ' + expected), timeout);

const arg = name => process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : undefined;
const cdp = arg('--cdp');
const dataPath = arg('--data');
const defaultServer = 'https://projecttodo.188-255-156-112.sslip.io';
const requests = [];
let newest = '20990101_1200';
const fixture = createServer((req, res) => {
    requests.push(req.url);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');
    const entry = { version: newest, releaseDate: '2099-01-01', downloadUrl: 'releases/ProjectTodo.exe', releaseNotes: '虚构更新验证', mandatory: false };
    let body = { latest: newest, versions: [entry] };
    if (req.url.startsWith('/missing')) body = { latest: '20991231_1200', versions: [entry] };
    if (req.url.startsWith('/unsafe')) body.versions[0].downloadUrl = 'file:///C:/fake.exe';
    if (req.url.startsWith('/empty')) body = { latest: '', versions: [] };
    if (req.url.startsWith('/error')) res.statusCode = 503;
    if (req.url.startsWith('/html')) return res.end('<html>not a feed</html>');
    if (req.url.startsWith('/timeout')) return;
    if (req.url.startsWith('/slow')) return setTimeout(() => res.end(JSON.stringify(body)), 900);
    res.end(JSON.stringify(body));
});
await new Promise(resolve => fixture.listen(0, '127.0.0.1', resolve));
const endpoint = `http://127.0.0.1:${fixture.address().port}`;
const web = cdp ? null : await preview({ logLevel: 'error', preview: { host: '127.0.0.1', port: 0, strictPort: false } });
const browser = cdp ? await chromium.connectOverCDP(`http://127.0.0.1:${cdp}`) : await chromium.launch({ channel: 'msedge', headless: true });
const page = cdp ? browser.contexts()[0].pages()[0] : await browser.newPage({ viewport: { width: 1747, height: 900 }, timezoneId: 'Asia/Shanghai' });
const output = 'ui-check.local/update-settings';
await mkdir(output, { recursive: true });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const openSettings = async () => {
    const reminder = page.getByRole('button', { name: '我知道了', exact: true });
    if (await reminder.isVisible()) await reminder.click();
    await page.getByTitle('切换到待办事项', { exact: true }).click();
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('button', { name: 'ℹ️ 关于', exact: true }).click();
};
const field = page.getByLabel('服务器地址', { exact: true });
const feedback = page.locator('#update-server-feedback');
const save = async value => {
    await field.fill(value);
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await hasText(feedback, '地址已保存');
};
const closeUpdate = async () => {
    await page.getByText('发现新版本！', { exact: true }).waitFor();
    await page.locator('.create-overlay').last().getByTitle('关闭', { exact: true }).click();
};
try {
    if (web) await page.goto(web.resolvedUrls.local[0]);
    await openSettings();
    await hasValue(field, defaultServer);
    assert.ok(!(await page.locator('.update-about-layout').innerText()).includes('word-route'));
    await page.getByRole('switch', { name: '启动时检查更新', exact: true }).uncheck();
    await page.getByRole('switch', { name: '定时检查更新', exact: true }).uncheck();
    assert.equal(await page.getByLabel('检查间隔').isDisabled(), true);
    for (const bad of ['', 'invalid', 'file:///C:/test', 'https://name:password@example.invalid', 'https://example.invalid/?token=fake']) {
        await field.fill(bad);
        await page.getByRole('button', { name: '保存', exact: true }).click();
        assert.equal(await field.getAttribute('aria-invalid'), 'true');
        assert.equal(await field.evaluate(element => element === document.activeElement), true);
    }
    await field.fill(endpoint + '/a/versions.json/');
    await page.getByRole('button', { name: '测试连接', exact: true }).click();
    await hasText(feedback, '连接成功');
    await save(endpoint + '/a/versions.json/');
    await hasValue(field, endpoint + '/a');
    await page.reload();
    await openSettings();
    await hasValue(field, endpoint + '/a');
    assert.equal(await page.getByRole('switch', { name: '启动时检查更新', exact: true }).isChecked(), false);
    if (dataPath) {
        const saved = JSON.parse(await readFile(dataPath, 'utf8'));
        assert.equal(saved.state.settings.updateCheck.serverUrl, endpoint + '/a');
    }
    await page.getByRole('button', { name: '检查更新', exact: true }).click();
    await closeUpdate();
    await page.getByRole('button', { name: '历史版本', exact: true }).click();
    await page.getByText('虚构更新验证', { exact: true }).waitFor();
    await page.locator('.create-overlay').last().getByTitle('关闭', { exact: true }).click();
    assert.ok(requests.filter(path => path === '/a/versions.json').length >= 3);
    for (const [path, message] of [['missing', '格式不正确'], ['unsafe', '下载地址'], ['html', '有效的 JSON'], ['error', 'HTTP 503'], ['empty', '暂无已发布版本'], ['timeout', '连接超时']]) {
        await field.fill(endpoint + '/' + path);
        await page.getByRole('button', { name: '测试连接', exact: true }).click();
        await hasText(feedback, message, 15000);
    }
    await field.fill(endpoint + '/slow');
    await page.getByRole('button', { name: '测试连接', exact: true }).click();
    await field.fill(endpoint + '/b');
    await page.waitForTimeout(1100);
    await hasText(feedback, '尚未测试');
    await save(endpoint + '/slow');
    await page.getByRole('button', { name: '检查更新', exact: true }).click();
    await save(endpoint + '/b');
    await page.waitForTimeout(1100);
    assert.equal(await page.getByText('发现新版本！', { exact: true }).isVisible(), false);
    await hasValue(field, endpoint + '/b');

    // Startup after hydration must use the saved source; changing unrelated settings must not cancel it forever.
    await page.getByRole('switch', { name: '启动时检查更新', exact: true }).check();
    await page.reload();
    await page.getByText('发现新版本！', { exact: true }).waitFor({ timeout: 12000 });
    await closeUpdate();
    await openSettings();
    await page.getByRole('switch', { name: '启动时检查更新', exact: true }).uncheck();
    await page.clock.install();
    await page.getByRole('switch', { name: '定时检查更新', exact: true }).check();
    await page.getByLabel('检查间隔').selectOption('10');
    const before = requests.length;
    await page.clock.fastForward(600001);
    await eventually(() => assert.ok(requests.length > before));
    await closeUpdate();
    await page.getByRole('switch', { name: '定时检查更新', exact: true }).uncheck();
    await page.clock.resume();

    if (dataPath) {
        assert.equal(resolve(dataPath), resolve(join(process.env.PROJECTTODO_TEST_DATA_DIR, 'data.json')));
        await save(endpoint + '/b'); // Wait for the final native write before injecting a filesystem failure.
        const backup = dataPath + '.update-write-failure';
        await rename(dataPath, backup);
        await mkdir(dataPath);
        try {
            await field.fill(endpoint + '/not-saved');
            await page.getByRole('button', { name: '保存', exact: true }).click();
            await hasText(feedback, '地址保存失败');
        } finally { await rmdir(dataPath); await rename(backup, dataPath); }
        await page.reload();
        await openSettings();
        await hasValue(field, endpoint + '/b');
    }

    await page.getByRole('button', { name: '恢复默认', exact: true }).click();
    await hasValue(field, defaultServer);
    await hasText(feedback, '保存后生效');
    await save(defaultServer);
    await page.reload();
    await openSettings();
    await hasValue(field, defaultServer);
    await page.getByRole('button', { name: '测试连接', exact: true }).click();
    await hasText(feedback, '连接成功', 15000);
    for (const width of cdp ? [1280, 1100] : [1747, 1280, 1100]) {
        await page.setViewportSize({ width, height: 900 });
        const bounds = await page.locator('.update-about-layout').evaluate(root => {
            const buttons = [...root.querySelectorAll('button,input,select')].map(x => x.getBoundingClientRect());
            return { right: Math.max(...buttons.map(x => x.right)), left: Math.min(...buttons.map(x => x.left)), viewport: innerWidth };
        });
        assert.ok(bounds.left >= 0 && bounds.right <= bounds.viewport, 'Update controls must remain within the viewport');
        await page.screenshot({ path: `${output}/${cdp ? 'native' : 'web'}-${width}.png` });
    }
    await page.getByRole('button', { name: '编辑地址', exact: true }).click();
    assert.equal(await field.isVisible(), false);
    await page.getByRole('button', { name: '编辑地址', exact: true }).click();
    await field.waitFor();
    assert.deepEqual(errors, []);
    console.log('PASS: configurable source, URL/feed validation, timeout, cancellation, manual/history/startup/interval checks, persistence, restore default, real HTTPS source and responsive layout' + (cdp ? ', native write-failure recovery' : ''));
} catch (error) {
    await page.screenshot({ path: `${output}/failure-${cdp ? 'native' : 'web'}.png` }).catch(() => {});
    throw error;
} finally {
    await browser.close();
    if (web) await new Promise(resolve => web.httpServer.close(resolve));
    fixture.closeAllConnections();
    await new Promise(resolve => fixture.close(resolve));
}

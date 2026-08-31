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
    const page = await browser.newPage();
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

    console.log('UI color and process-exit regression checks passed');
} finally {
    await browser?.close();
    await server.close();
}

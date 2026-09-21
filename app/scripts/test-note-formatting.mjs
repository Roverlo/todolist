import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { preview } from 'vite';
import { checkNoteFormatting } from './check-note-formatting.mjs';

const arg = name => process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : undefined;
const cdp = arg('--cdp'), dataPath = arg('--data');
const server = cdp ? null : await preview({ logLevel: 'error', preview: { host: '127.0.0.1', port: 0 } });
const browser = cdp ? await chromium.connectOverCDP(`http://127.0.0.1:${cdp}`) : await chromium.launch({ channel: 'msedge', headless: true });
const page = cdp ? browser.contexts()[0].pages()[0] : await browser.newPage({ viewport: { width: 1280, height: 840 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await mkdir('ui-check.local', { recursive: true });
try {
    if (server) {
        await page.goto(server.resolvedUrls.local[0]);
        const reminder = page.getByRole('button', { name: '我知道了' });
        if (await reminder.isVisible()) await reminder.click();
        await page.getByTitle('切换到随记中心', { exact: true }).click();
        await page.getByRole('button', { name: '创建新随记' }).click();
    }
    const body = page.getByRole('textbox', { name: '随记正文', exact: true });
    await body.waitFor();
    const saveAndReload = async () => {
        const expected = await body.evaluate(root => root.editor.getHTML());
        await page.getByRole('button', { name: '保存', exact: true }).click();
        if (dataPath) {
            for (let attempt = 0; ; attempt++) {
                const data = JSON.parse(await readFile(dataPath, 'utf8'));
                if (data.state.notes.find(note => note.id === 'portable-check')?.content === expected) break;
                if (attempt >= 30) throw new Error('Native formatting changes were not persisted');
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
        await page.reload();
        await body.waitFor();
        assert.equal(await body.evaluate(root => root.editor.getHTML()), expected);
    };
    await checkNoteFormatting(page, body, saveAndReload);
    assert.deepEqual(errors, []);
    console.log(cdp ? 'Native formatting and isolated data.json passed' : 'Production formatting workflow passed');
} catch (error) {
    await page.screenshot({ path: 'ui-check.local/note-formatting-failure.png' }).catch(() => {});
    throw error;
} finally {
    await browser.close();
    if (server) await new Promise(resolve => server.httpServer.close(resolve));
}

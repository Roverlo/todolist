import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { preview } from 'vite';
import { checkNoteCompletion } from './check-note-completion.mjs';
import { checkNoteTaskSort } from './check-note-task-sort.mjs';

const arg = name => process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : undefined;
const cdp = arg('--cdp');
const dataPath = arg('--data');
const server = cdp ? null : await preview({ logLevel: 'error', preview: { host: '127.0.0.1', port: 0, strictPort: false } });
const browser = cdp ? await chromium.connectOverCDP(`http://127.0.0.1:${cdp}`) : await chromium.launch({ channel: 'msedge', headless: true });
const page = cdp ? browser.contexts()[0].pages()[0] : await browser.newPage({ viewport: { width: 1280, height: 840 }, timezoneId: 'Asia/Shanghai' });
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
    const openNote = async (html, title) => {
        await page.getByRole('textbox', { name: '随记标题', exact: true }).fill(title);
        await body.evaluate((root, html) => root.editor.commands.setContent(html), html);
        return page.evaluate(() => JSON.parse(localStorage.getItem('project-todo-app')).state.selectedNoteId);
    };
    const saveAndReload = async () => {
        const expected = await body.evaluate(root => root.editor.getHTML());
        await page.getByRole('button', { name: '保存', exact: true }).click();
        if (dataPath) {
            await assertEventually(async () => {
                const data = JSON.parse(await readFile(dataPath, 'utf8'));
                assert.equal(data.state.notes.find(note => note.id === 'portable-check').content, expected);
            });
        }
        await page.reload();
        await body.waitFor();
    };
    await checkNoteCompletion(page, body, openNote, saveAndReload);
    await checkNoteTaskSort(page, body, openNote, saveAndReload);
    assert.deepEqual(errors, []);
    console.log(cdp ? 'Native completion workflow and isolated data.json persistence passed' : 'Production completion workflow passed');
} catch (error) {
    await page.screenshot({ path: 'ui-check.local/note-completion-failure.png' }).catch(() => {});
    throw error;
} finally {
    await browser.close();
    if (server) await new Promise(resolve => server.httpServer.close(resolve));
}

async function assertEventually(check) {
    for (let attempt = 0; ; attempt++) {
        try { await check(); return; } catch (error) {
            if (attempt >= 30) throw error;
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }
}

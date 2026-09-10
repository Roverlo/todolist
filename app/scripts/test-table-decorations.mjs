import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { build, createServer, preview } from 'vite';

// The production bundle must exercise overlapping decorations, not just table commands.
const dev = process.argv.includes('--dev');
if (!dev) await build({ logLevel: 'error' });
const server = dev
    ? await createServer({ cacheDir: 'node_modules/.vite-test-tables', logLevel: 'error', server: { host: '127.0.0.1', port: 0, strictPort: false } })
    : await preview({ logLevel: 'error', preview: { host: '127.0.0.1', port: 0, strictPort: false } });
if (dev) await server.listen();
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 840 } });
const errors = [];
page.on('pageerror', error => errors.push(error.stack));
page.setDefaultTimeout(10000);
const output = `ui-check.local/table-decorations-${dev ? 'dev' : 'production'}`;
await mkdir(output, { recursive: true });

try {
    await page.goto(server.resolvedUrls.local[0]);
    const reminder = page.getByRole('button', { name: '我知道了' });
    if (await reminder.isVisible()) await reminder.click();
    await page.getByTitle('切换到随记中心', { exact: true }).click();
    await page.getByRole('button', { name: '创建新随记' }).click();
    const body = page.getByRole('textbox', { name: '随记正文', exact: true });
    await body.waitFor();
    await page.locator('.note-editor-title').fill('表格交互回归');
    await body.click();
    await page.waitForFunction(() => document.querySelector('.ProseMirror')?.editor.view.hasFocus());
    await page.getByRole('button', { name: '插入表格', exact: true }).click();
    await page.locator('[data-table-grid-cell][data-rows="3"][data-cols="3"]').click();
    await body.locator('table').waitFor();
    assert.equal(await body.locator('tr').count(), 3);
    assert.equal(await page.locator('.note-editor-count').innerText(), '字数: 0', 'An empty table must not count its structural separators as text');
    await body.locator('td').first().click();
    await page.waitForFunction(() => document.querySelector('.ProseMirror')?.editor.view.hasFocus());
    await page.keyboard.insertText('表格回归文字');
    await body.press('Home');
    await body.press('Shift+End');
    await page.waitForFunction(() => !document.querySelector('.ProseMirror').editor.state.selection.empty);
    assert.equal(await page.locator('.note-editor-count').innerText(), '字数: 6');

    const hoverColumn = async label => {
        const box = await body.locator('td, th').first().boundingBox();
        await page.mouse.move(box.x + box.width - 1, box.y + box.height / 2);
        assert.deepEqual(errors, [], label);
        assert.ok(await body.locator('.column-resize-handle').count(), label + ': resize decorations must render');
    };
    await hoverColumn('Text selection plus column handles must not crash');
    assert.ok(await body.locator('.note-selection').count());
    await page.screenshot({ path: `${output}/selection-and-resize.png` });

    // Search highlighting is a second independent source of overlapping decorations.
    await body.evaluate(root => root.editor.commands.setSearchTerm('表格'));
    assert.deepEqual(errors, [], 'Search, selection and column handles must coexist');
    await body.evaluate(root => {
        const cells = [];
        root.editor.state.doc.descendants((node, pos) => {
            if (node.type.name === 'tableCell') cells.push(pos);
        });
        root.editor.commands.setCellSelection({ anchorCell: cells[0], headCell: cells[1] });
    });
    assert.deepEqual(errors, [], 'Cell selection and search must coexist');
    assert.equal(await body.locator('.selectedCell').count(), 2);
    await hoverColumn('Cell selection, search and column handles must not crash');
    await body.evaluate(root => root.editor.commands.mergeCells());
    assert.equal(await body.locator('td[colspan="2"]').count(), 1);
    await body.evaluate(root => root.editor.commands.splitCell());
    assert.equal(await body.locator('td[colspan="2"]').count(), 0);
    await body.evaluate(root => root.editor.commands.setSearchTerm(''));

    await page.getByRole('button', { name: '保存', exact: true }).click();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await body.waitFor();
    assert.equal(await body.locator('td').count(), 9);
    assert.ok((await body.innerText()).includes('表格回归文字'));
    assert.equal(await page.locator('.note-editor-count').innerText(), '字数: 6', 'Character count must survive table save and reload');
    // Reproduce the unmount path from the reported stack, while table highlights are active.
    await body.evaluate(root => {
        root.editor.commands.setSearchTerm('表格');
        root.editor.commands.selectAll();
    });
    await page.getByRole('button', { name: /新建随记$/ }).click();
    await page.waitForFunction(() => document.querySelector('.note-editor-title')?.value !== '表格交互回归');
    assert.deepEqual(errors, [], 'Unmounting a decorated table must not crash');
    await page.getByRole('button', { name: '插入表格', exact: true }).press('Enter');
    await body.locator('table').waitFor();
    assert.equal(await body.locator('th').count(), 3);
    await page.screenshot({ path: `${output}/table-reopened.png` });
    assert.deepEqual(errors, [], 'No uncaught editor errors');
    console.log(`Passed (${dev ? 'dev' : 'production'}): insert, text/cell/search selections with resize handles, merge/split, save/reload and unmount/reinsert`);
} catch (error) {
    console.error('Editor errors:', errors);
    await page.screenshot({ path: `${output}/failure.png` });
    throw error;
} finally {
    await browser.close();
    if (dev) await server.close();
    else await new Promise(resolve => server.httpServer.close(resolve));
}

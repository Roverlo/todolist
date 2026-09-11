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
page.on('console', message => {
    if (/Duplicate extension|different instances of a keyed plugin/.test(message.text())) errors.push(message.text());
});
page.setDefaultTimeout(10000);
const output = `ui-check.local/table-decorations-${dev ? 'dev' : 'production'}`;
await mkdir(output, { recursive: true });

try {
    await page.goto(server.resolvedUrls.local[0], { waitUntil: 'domcontentloaded', timeout: 90000 });
    const reminder = page.getByRole('button', { name: '我知道了' });
    if (await reminder.isVisible()) await reminder.click();
    let releaseEditor;
    const editorLoading = new Promise(resolve => { releaseEditor = resolve; });
    if (!dev) await page.route('**/assets/NotesMain-*.js', async route => { await editorLoading; await route.continue(); });
    await page.getByTitle('切换到随记中心', { exact: true }).click();
    if (!dev) {
        try {
            await page.getByRole('status').filter({ hasText: '正在打开随记' }).waitFor();
            assert.equal(await page.locator('.notes-calendar-grid').evaluate(el => getComputedStyle(el).display), 'grid',
                'Sidebar styles must be ready while the lazy editor is still loading');
            await page.screenshot({ path: `${output}/styled-sidebar-during-load.png` });
        } finally { releaseEditor(); }
        console.log('Passed: sidebar retains its layout while the editor bundle is delayed');
    }
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

    // npm deduplication cannot detect ProseMirror classes embedded inside a library bundle.
    // Check the actual registered plugins in the release bundle with every decorated node active.
    const fixture = '<h2>组合检查</h2><p><strong>苹果</strong><em>苹果</em> 苹果</p>'
        + '<ul><li><p>苹果</p></li></ul><ol><li><p>苹果</p></li></ol>'
        + '<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><p>苹果</p></li></ul>'
        + '<blockquote><p>苹果</p></blockquote><pre><code class="language-javascript">const 苹果 = 1;</code></pre>'
        + '<table><tbody><tr><td><p>苹果</p></td><td><p>单元格</p></td></tr></tbody></table><hr><p>末尾</p>';
    await body.evaluate((root, html) => root.editor.commands.setContent(html), fixture);
    const inventory = await body.evaluate(root => {
        const editor = root.editor;
        return {
            extensions: editor.extensionManager.extensions.map(extension => extension.name),
            plugins: editor.state.plugins.map(plugin => plugin.key),
        };
    });
    assert.equal(new Set(inventory.extensions).size, inventory.extensions.length, 'Each extension must be registered only once');
    assert.equal(new Set(inventory.plugins).size, inventory.plugins.length, 'Each keyed plugin must be registered only once');

    await body.evaluate(root => {
        root.editor.commands.setSearchTerm('苹果');
        root.editor.commands.selectAll();
    });
    const checkDecorationIdentity = async () => {
        const sources = await body.evaluate(root => {
            const editor = root.editor;
            const sets = editor.state.plugins.flatMap(plugin => {
                const set = plugin.props.decorations?.call(plugin, editor.state);
                return set ? [{ key: plugin.key, set }] : [];
            });
            // This selection is produced by our extension importing @tiptap/pm/view.
            const selection = sets.find(({ set }) => set.find().some(decoration => decoration.type.attrs?.class?.includes('note-selection')));
            if (!selection) throw new Error('Selection decoration must be active during the compatibility check');
            return sets.map(({ key, set }) => ({ key, shared: set instanceof selection.set.constructor, count: set.find().length }));
        });
        assert.ok(sources.length >= 4, 'Selection, search, code and table/placeholder decoration sources must be checked');
        assert.deepEqual(sources.filter(source => !source.shared), [], 'All active decorations must use the same ProseMirror class');
        assert.deepEqual(errors, [], 'Combining all decorated nodes must not crash');
        return sources;
    };
    const sources = await checkDecorationIdentity();
    assert.ok(sources.some(source => /codeBlock/.test(source.key) && source.count > 0), 'Syntax highlighting must actually be active');
    await hoverColumn('Code highlighting, search, all-selection and table resizing must coexist');
    await checkDecorationIdentity();

    // Replacement length changes must preserve ranges across marks, lists, code and table cells.
    for (const replacement of ['长一些的替换🙂', '短', '']) {
        await body.evaluate((root, html) => root.editor.commands.setContent(html), fixture);
        const before = await body.evaluate(root => root.editor.state.doc.textContent);
        // Keep fixture loading outside the editor's 500 ms typing-history group.
        await page.waitForTimeout(550);
        await body.evaluate((root, text) => {
            root.editor.commands.setSearchTerm('苹果');
            root.editor.commands.setReplaceTerm(text);
            root.editor.commands.replaceAll();
        }, replacement);
        assert.equal(await body.evaluate(root => root.editor.state.doc.textContent), before.replaceAll('苹果', replacement));
        assert.equal(await body.locator('table').count(), 1);
        assert.equal(await body.locator('pre').count(), 1);
        assert.equal(await body.locator('li[data-type="taskItem"][data-checked="true"]').count(), 1);
        await body.evaluate(root => root.editor.commands.undo());
        assert.equal(await body.evaluate(root => root.editor.state.doc.textContent), before, 'Undo must restore mixed-node replacements');
        await body.evaluate(root => root.editor.commands.redo());
        assert.equal(await body.evaluate(root => root.editor.state.doc.textContent), before.replaceAll('苹果', replacement));
    }
    await body.evaluate(root => {
        root.editor.commands.setSearchTerm('');
        const canvas = document.createElement('canvas');
        canvas.width = 1280;
        canvas.height = 840;
        root.editor.chain().focus('end').insertContent({ type: 'imageBlock', attrs: { src: canvas.toDataURL(), alt: '组合检查图片' } }).run();
    });
    await body.locator('img').waitFor();
    await body.locator('.image-view__body').click();
    const imageWidth = (await body.locator('img').boundingBox()).width;
    assert.ok(await body.evaluate(root => root.scrollWidth <= root.clientWidth + 1), 'Full-width image handles must not add a horizontal scrollbar');
    const handle = body.locator('.image-resizer__handler--br');
    await handle.scrollIntoViewIfNeeded();
    const corner = await handle.boundingBox();
    await page.mouse.move(corner.x + corner.width / 2, corner.y + corner.height / 2);
    await page.mouse.down();
    await page.mouse.move(corner.x - 80, corner.y - 50, { steps: 8 });
    await page.mouse.up();
    assert.ok((await body.locator('img').boundingBox()).width < imageWidth - 20, 'The fully visible corner handle must still resize the image');
    await body.evaluate(root => root.editor.commands.selectAll());
    await checkDecorationIdentity();
    const saved = await body.evaluate(root => root.editor.getHTML());
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await body.waitFor();
    assert.equal(await body.evaluate(root => root.editor.getHTML()), saved, 'Mixed document must round-trip without losing formatting');
    await body.evaluate(root => {
        root.editor.commands.setSearchTerm('const');
        root.editor.commands.selectAll();
    });
    await page.getByTitle('切换到待办事项', { exact: true }).click();
    await page.getByTitle('切换到随记中心', { exact: true }).click();
    await body.waitFor();
    assert.equal(await body.evaluate(root => root.editor.getHTML()), saved, 'Unmount/remount must preserve the mixed document');
    assert.deepEqual(errors, [], 'No uncaught editor errors');
    console.log(`Passed (${dev ? 'dev' : 'production'}): insert, text/cell/search selections with resize handles, merge/split, save/reload and unmount/reinsert`);
    console.log(`Passed: ${inventory.extensions.length} unique extensions, ${sources.length} compatible decoration sources, syntax highlighting, cross-node replacement/undo/redo, full-width image handles/resize, persistence and mixed-node unmount`);
} catch (error) {
    console.error('Editor errors:', errors);
    await page.screenshot({ path: `${output}/failure.png` }).catch(captureError => console.error('Failure screenshot:', captureError.message));
    throw error;
} finally {
    await browser.close();
    if (dev) await server.close();
    else await new Promise(resolve => server.httpServer.close(resolve));
}

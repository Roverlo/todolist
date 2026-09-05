import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { createServer as createTcpServer } from 'node:net';
import { chromium } from 'playwright';
import { createServer as createViteServer } from 'vite';

const tauriConfig = JSON.parse(await readFile(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8'));
assert.ok(tauriConfig.app.windows.every(window => window.dragDropEnabled === false),
    'Windows WebView must allow HTML drag/drop so images can reach the editor');

const port = await new Promise(resolve => {
    const probe = createTcpServer();
    probe.listen(0, '127.0.0.1', () => {
        const { port } = probe.address();
        probe.close(() => resolve(port));
    });
});
const server = await createViteServer({ logLevel: 'error', server: { host: '127.0.0.1', port, strictPort: true } });
await mkdir('ui-check.local', { recursive: true });
let browser;
let page;
const errors = [];

try {
    await server.listen();
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    page = await browser.newPage({ viewport: { width: 1280, height: 840 }, timezoneId: 'Asia/Shanghai' });
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
        if (/Duplicate extension|different instances of a keyed plugin/.test(message.text())) errors.push(message.text());
    });
    await page.goto(server.resolvedUrls.local[0], { waitUntil: 'domcontentloaded', timeout: 90000 });
    const reminder = page.getByRole('button', { name: '我知道了' });
    if (await reminder.isVisible()) await reminder.click();
    await page.getByTitle('切换到随记中心', { exact: true }).click();
    await page.getByRole('button', { name: '创建新随记' }).click();
    const body = page.getByRole('textbox', { name: '随记正文', exact: true });
    await body.waitFor();
    assert.deepEqual(errors, [], 'Editor should initialize without runtime or duplicate-extension errors');
    const storedNotes = () => page.evaluate(() => JSON.parse(localStorage.getItem('project-todo-app')).state.notes);
    const openNote = async (content, title) => {
        const id = await page.evaluate(async ({ content, title }) => {
            const { useAppStore } = await import('/src/state/appStore.ts');
            const store = useAppStore.getState();
            const note = store.addNote({ content, title, tags: ['兼容测试'], date: '2026-09-06' });
            store.setSelectedNoteId(note.id);
            return note.id;
        }, { content, title });
        await page.waitForFunction(title => document.querySelector('.note-editor-title')?.value === title, title);
        await body.waitFor();
        return id;
    };
    const saveAndReload = async () => {
        await page.getByRole('button', { name: '保存', exact: true }).click();
        await page.reload({ waitUntil: 'domcontentloaded' });
        await body.waitFor();
    };

    const legacyHTML = '<h2>旧标题</h2><p style="text-align: right"><strong>粗体</strong><em>斜体</em><u>下划线</u><s>删除线</s><span style="font-size: 24px; color: #008000">旧字号颜色</span><mark data-color="#fff200" style="background-color: #fff200">旧高亮</mark></p><ul><li><p>旧项目</p></li></ul><ol start="3" type="A"><li><p>旧编号</p></li></ol><blockquote><p>旧引用</p></blockquote><pre><code>const value = 1;</code></pre>';
    const legacyId = await openNote(legacyHTML, '旧随记兼容');
    const assertLegacy = async () => {
        assert.equal(await body.locator('h2').innerText(), '旧标题');
        for (const tag of ['strong', 'em', 'u', 's', 'mark', 'blockquote', 'pre']) assert.ok(await body.locator(tag).count(), `Old ${tag} format should survive`);
        const text = body.getByText('旧字号颜色', { exact: true });
        assert.equal(await text.evaluate(el => getComputedStyle(el).fontSize), '24px');
        assert.equal(await text.evaluate(el => getComputedStyle(el).color), 'rgb(0, 128, 0)');
        assert.equal(await body.locator('ol').getAttribute('start'), '3');
        assert.equal(await body.locator('ol').evaluate(el => el.style.listStyleType), 'upper-alpha');
        assert.equal(await body.locator('p').filter({ hasText: '旧字号颜色' }).evaluate(el => el.style.textAlign), 'right');
    };
    await assertLegacy();
    assert.equal((await storedNotes()).find(note => note.id === legacyId).content, legacyHTML, 'Opening an old note must not rewrite its stored HTML');
    await body.press('Control+End');
    await body.press('ArrowDown');
    await page.keyboard.insertText('兼容性追加');
    await saveAndReload();
    await assertLegacy();
    assert.deepEqual((await storedNotes()).find(note => note.id === legacyId).tags, ['兼容测试']);
    console.log('Passed: legacy HTML marks, headings, font size/color, lists, alignment, code and tags');

    const choose = async (label, value) => {
        await page.getByRole('combobox', { name: label, exact: true }).click();
        const menu = page.getByRole('listbox', { name: label, exact: true });
        if (typeof value === 'object') await menu.getByRole('option', { name: value.label, exact: true }).click();
        else await menu.locator('[role="option"][data-value="' + value + '"]').click();
    };

    await openNote('<p>第一项</p><p>第二项</p>', '多种列表');
    await body.press('Control+A');
    for (const style of ['disc', 'circle', 'square']) {
        await choose('项目符号样式', style);
        assert.equal(await body.locator('ul').first().evaluate(el => el.style.listStyleType), style);
    }
    await body.locator('li').nth(1).click();
    await page.waitForFunction(() => document.querySelector('.ProseMirror')?.editor.isActive('listItem'));
    await body.press('Tab');
    assert.equal(await body.locator('ul ul li').count(), 1, 'Tab must nest the list item');
    await body.press('Shift+Tab');
    assert.equal(await body.locator('ul ul').count(), 0);
    await page.getByRole('button', { name: '增加缩进', exact: true }).click();
    assert.equal(await body.locator('ul ul li').count(), 1);
    await page.getByRole('button', { name: '减少缩进', exact: true }).click();
    assert.equal(await body.locator('ul ul').count(), 0);
    await body.press('Control+A');
    for (const style of ['decimal', 'decimal-leading-zero', 'lower-alpha', 'upper-alpha', 'lower-roman', 'upper-roman', 'cjk-ideographic']) {
        await choose('编号样式', style);
        assert.equal(await body.locator('ol').first().evaluate(el => el.style.listStyleType), style);
        await saveAndReload();
        assert.equal(await body.locator('ol').first().evaluate(el => el.style.listStyleType), style);
        await body.press('Control+A');
    }
    await choose('编号样式', 'none');
    assert.equal(await body.locator('ol').count(), 0);
    await page.getByRole('button', { name: '待办列表', exact: true }).click();
    await body.locator('input[type="checkbox"]').first().check();
    await saveAndReload();
    assert.equal(await body.locator('li[data-checked="true"]').count(), 1);
    assert.ok(await body.locator('input[type="checkbox"]').first().isChecked());
    console.log('Passed: 10 list styles, nested Tab/buttons, checkbox save/reload');

    await openNote('<p>排版文字</p>', '排版工具');
    await body.press('Control+A');
    await choose('正文字体', { label: '宋体' });
    await choose('字号', '24px');
    await page.getByRole('button', { name: '加粗', exact: true }).click();
    await page.getByRole('button', { name: '斜体', exact: true }).click();
    await page.getByRole('button', { name: '下划线', exact: true }).click();
    await choose('段落标题', '2');
    await choose('行距', '2');
    await page.getByRole('button', { name: '两端对齐', exact: true }).click();
    await saveAndReload();
    const formatted = body.getByText('排版文字', { exact: true });
    assert.equal(await body.locator('h2').count(), 1);
    assert.ok(await body.locator('strong em u, strong u em, u em strong, em strong u, u strong em, em u strong').count());
    assert.match(await formatted.evaluate(el => getComputedStyle(el).fontFamily), /SimSun/);
    assert.equal(await formatted.evaluate(el => getComputedStyle(el).fontSize), '24px');
    assert.equal(await formatted.evaluate(el => getComputedStyle(el).lineHeight), '48px');
    assert.equal(await body.locator('h2').evaluate(el => el.style.textAlign), 'justify');
    console.log('Passed: font family/size, headings, marks, line spacing and alignment');

    await openNote('<p><strong><span style="color: #008000">源格式</span></strong></p><p>应用文字</p>', '格式刷');
    await body.locator('p').first().click();
    await body.press('Home');
    await body.press('Shift+End');
    await page.getByRole('button', { name: '格式刷', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: '格式刷', exact: true }).getAttribute('data-state'), 'on');
    const targetText = await body.locator('p').last().evaluate(el => {
        const range = document.createRange();
        range.selectNodeContents(el);
        const rect = range.getBoundingClientRect();
        return { left: rect.left, right: rect.right, y: rect.y + rect.height / 2 };
    });
    await page.mouse.move(targetText.left + 1, targetText.y);
    await page.mouse.down();
    await page.mouse.move(targetText.right + 1, targetText.y, { steps: 8 });
    await page.waitForFunction(() => !document.querySelector('.ProseMirror').editor.state.selection.empty);
    await page.mouse.up();
    assert.equal(await body.locator('p').last().locator('strong').innerText(), '应用文字');
    assert.equal(await body.getByText('应用文字', { exact: true }).evaluate(el => getComputedStyle(el).color), 'rgb(0, 128, 0)');
    console.log('Passed: format painter copies text styling through mouse selection');

    await openNote('<p>苹果 苹果 香蕉</p>', '查找替换');
    await page.getByRole('button', { name: '查找替换', exact: true }).click();
    const searchDialog = page.getByRole('search', { name: '查找替换' });
    await searchDialog.getByLabel('查找内容').fill('苹果');
    await searchDialog.getByLabel('替换内容').fill('橙子');
    await searchDialog.getByRole('button', { name: '全部替换' }).click();
    await searchDialog.getByRole('button', { name: '关闭查找替换' }).click();
    assert.equal((await body.innerText()).trim(), '橙子 橙子 香蕉');
    await page.getByRole('button', { name: '撤销', exact: true }).click();
    assert.equal((await body.innerText()).trim(), '苹果 苹果 香蕉');
    await page.getByRole('button', { name: '重做', exact: true }).click();
    assert.equal((await body.innerText()).trim(), '橙子 橙子 香蕉');
    await page.getByRole('button', { name: '查找替换', exact: true }).click();
    await searchDialog.getByLabel('查找内容').fill('橙子');
    await searchDialog.getByLabel('替换内容').fill('临时替换');
    await searchDialog.getByLabel('替换内容').fill('');
    await searchDialog.getByRole('button', { name: '全部替换' }).click();
    await searchDialog.getByRole('button', { name: '关闭查找替换' }).click();
    assert.equal((await body.innerText()).trim(), '香蕉', 'An empty replacement must delete matches');

    await openNote('<p>项目文档</p>', '链接编辑');
    await body.press('Control+A');
    await page.getByRole('button', { name: '插入链接', exact: true }).click();
    await page.getByLabel('链接地址', { exact: true }).fill('https://example.com/docs');
    await page.getByRole('button', { name: '应用链接', exact: true }).click();
    await saveAndReload();
    assert.equal(await body.locator('a').innerText(), '项目文档');
    assert.equal(await body.locator('a').getAttribute('href'), 'https://example.com/docs');

    const draftId = await openNote('<p>草稿初稿</p>', '切换草稿');
    await page.getByPlaceholder('标题（可选）').fill('未等自动保存的标题');
    await body.fill('立刻切换也要保存的正文');
    await page.getByRole('button', { name: '新增当日随记', exact: true }).click();
    await page.waitForFunction(id => JSON.parse(localStorage.getItem('project-todo-app')).state.notes
        .find(note => note.id === id)?.content.includes('立刻切换也要保存的正文'), draftId);
    assert.equal((await storedNotes()).find(note => note.id === draftId).title, '未等自动保存的标题');
    assert.equal((await body.innerText()).trim(), '', 'Previous draft must not leak into the new note');
    console.log('Passed: search/replace, undo/redo, immediate navigation flush');

    await openNote('<p>表格操作示例</p>', '表格编辑');
    await body.press('Control+End');
    await body.press('Enter');
    await page.getByRole('button', { name: '插入表格', exact: true }).click();
    await page.locator('[data-table-grid-cell][data-rows="3"][data-cols="3"]').click();
    await body.locator('table').waitFor();
    assert.equal(await body.locator('tr').count(), 3);
    assert.equal(await body.locator('tr').first().locator('td, th').count(), 3);
    await body.locator('td, th').first().click();
    await choose('表格操作', { label: '下方插入行' });
    await choose('表格操作', { label: '右侧插入列' });
    assert.equal(await body.locator('tr').count(), 4);
    assert.equal(await body.locator('tr').first().locator('td, th').count(), 4);
    await saveAndReload();
    assert.equal(await body.locator('tr').count(), 4);
    assert.equal(await body.locator('tr').first().locator('td, th').count(), 4);
    await body.evaluate(root => {
        const positions = [];
        root.editor.state.doc.descendants((node, pos) => {
            if (node.type.name === 'tableCell') positions.push(pos);
        });
        root.editor.commands.setCellSelection({ anchorCell: positions[0], headCell: positions[1] });
    });
    await choose('表格操作', { label: '合并单元格' });
    assert.equal(await body.locator('td[colspan="2"]').count(), 1);
    await saveAndReload();
    await body.locator('td[colspan="2"]').click();
    await choose('表格操作', { label: '拆分单元格' });
    assert.equal(await body.locator('td[colspan="2"]').count(), 0);
    await choose('表格操作', { label: '切换表头行' });
    assert.equal(await body.locator('th').count(), 4);
    await choose('表格操作', { label: '删除当前行' });
    await choose('表格操作', { label: '删除当前列' });
    assert.equal(await body.locator('tr').count(), 3);
    assert.equal(await body.locator('tr').first().locator('td, th').count(), 3);
    await choose('表格操作', { label: '删除表格' });
    assert.equal(await body.locator('table').count(), 0);
    await page.getByRole('button', { name: '插入表格', exact: true }).press('Enter');
    await body.locator('table').waitFor();
    assert.equal(await body.locator('th').count(), 3, 'Keyboard table insertion must include a header row');
    console.log('Passed: table insertion, merge/split, header, row/column changes and reload');

    await openNote('<p>本地图片持久保存</p>', '图片编辑');
    const png = await page.evaluate(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 240;
        canvas.height = 120;
        const context = canvas.getContext('2d');
        context.fillStyle = '#ddd6fe';
        context.fillRect(0, 0, 240, 120);
        context.fillStyle = '#5b21b6';
        context.font = '20px sans-serif';
        context.fillText('Local image', 58, 65);
        return canvas.toDataURL('image/png').split(',')[1];
    });
    await body.press('Control+End');
    await page.getByRole('button', { name: '插入图片', exact: true }).click();
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: '选择图片', exact: false }).click();
    await (await chooser).setFiles({ name: '本地图片.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
    await page.getByRole('dialog').getByRole('button', { name: '插入图片', exact: true }).click();
    await body.locator('img').waitFor();
    assert.match(await body.locator('img').getAttribute('src'), /^data:image\/png;base64,/);
    await body.locator('.image-view__body').click();
    const imageWidth = await body.evaluate(root => Math.round(root.clientWidth / 2));
    await choose('图片宽度', '50%');
    await saveAndReload();
    assert.equal(await body.locator('img').evaluate(img => img.style.width), `${imageWidth}px`);
    assert.ok(Math.abs((await body.locator('img').boundingBox()).width - imageWidth) <= 1);
    assert.ok(await body.locator('img').evaluate(img => img.complete && img.naturalWidth === 240));
    const pasted = await body.evaluate((root, png) => {
        const bytes = Uint8Array.from(atob(png), character => character.charCodeAt(0));
        const transfer = new DataTransfer();
        transfer.items.add(new File([bytes], '截图.png', { type: 'image/png' }));
        return !root.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }));
    }, png);
    assert.equal(pasted, true);
    await page.waitForFunction(() => document.querySelectorAll('.ProseMirror img').length === 2);
    await saveAndReload();
    assert.equal(await body.locator('img').count(), 2);
    assert.ok(await body.locator('img').evaluateAll(images => images.every(img => img.complete && img.naturalWidth === 240)));
    const dropped = await body.evaluate((root, png) => {
        const transfer = new DataTransfer();
        transfer.items.add(new File([Uint8Array.from(atob(png), char => char.charCodeAt(0))], '拖入.png', { type: 'image/png' }));
        const rect = root.getBoundingClientRect();
        return !root.dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true,
            clientX: rect.left + 20, clientY: rect.top + 20 }));
    }, png);
    assert.equal(dropped, true);
    await page.waitForFunction(() => document.querySelectorAll('.ProseMirror img').length === 3);
    for (const [type, size, message] of [
        ['image/svg+xml', 10, '请选择 PNG、JPEG、WebP 或 GIF 图片'],
        ['image/png', 2 * 1024 * 1024 + 1, '请选择 2 MB 以内的图片'],
    ]) {
        await body.evaluate((root, { type, size }) => {
            const transfer = new DataTransfer();
            transfer.items.add(new File([new Uint8Array(size)], '无效图片', { type }));
            root.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }));
        }, { type, size });
        await page.getByText(message, { exact: true }).waitFor();
        assert.equal(await body.locator('img').count(), 3, 'Rejected image must not alter the document');
    }
    await saveAndReload();
    assert.equal(await body.locator('img').count(), 3);
    const downloadPromise = page.waitForEvent('download');
    await page.getByTitle('导出为 HTML', { exact: true }).click();
    assert.match(await readFile(await (await downloadPromise).path(), 'utf8'), /data:image\/png;base64,/);
    console.log('Passed: image upload, sizing, paste/drop, validation, persistence and HTML export');

    await openNote('<p>工具栏布局检查</p>', '工具栏布局');
    assert.equal(await page.getByLabel('表格操作', { exact: true }).count(), 0, 'Table actions should only appear inside a table');
    await page.getByLabel('更多插入工具', { exact: true }).click();
    await page.getByRole('button', { name: '分隔线', exact: true }).click();
    await body.locator('hr').waitFor();
    assert.equal(await page.locator('.editor-more').evaluate(el => el.open), false);
    await page.getByLabel('更多插入工具', { exact: true }).press('Enter');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.editor-more').evaluate(el => el.open), false);
    for (const width of [1100, 1280, 1536, 1920]) {
        await page.setViewportSize({ width, height: 840 });
        for (const panelOpen of [false, true]) {
            const toggle = page.getByRole('button', { name: panelOpen ? '显示 AI 助手' : '隐藏 AI 助手', exact: true });
            if (await toggle.isVisible()) await toggle.click();
            assert.ok(await page.locator('.notes-main-root').evaluate(el =>
                el.getBoundingClientRect().left >= document.querySelector('.sidebar').getBoundingClientRect().right),
                'The navigation sidebar must not overlap the document workspace');
            assert.ok(await page.getByRole('toolbar').evaluate(el => {
                const bounds = el.getBoundingClientRect();
                return [...el.querySelectorAll('button, select, summary')].every(control => {
                    if (control.closest('details:not([open])') && control.tagName !== 'SUMMARY') return true;
                    const rect = control.getBoundingClientRect();
                    if (!rect.width || !rect.height) return true;
                    return rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1
                        && rect.top >= bounds.top && rect.bottom <= bounds.bottom;
                });
            }), `Toolbar controls must remain reachable at ${width}px with AI panel ${panelOpen}`);
            if (panelOpen) {
                assert.ok(await page.locator('.notes-main-root').evaluate(el => {
                    const panel = el.querySelector('.notes-center-ai-panel').getBoundingClientRect();
                    const document = el.querySelector('.notes-document').getBoundingClientRect();
                    const toolbar = el.querySelector('[role="toolbar"]').getBoundingClientRect();
                    return Math.abs(panel.top - document.top) < 1 && Math.abs(panel.left - toolbar.right) < 1;
                }), 'AI panel must start at the top and formatting tools must stay inside the document column');
            }
            assert.equal(await body.locator('hr').count(), 1, 'Toggling the sidebar must preserve the editor content');
        }
    }
    assert.deepEqual(errors, []);
    await page.setViewportSize({ width: 1280, height: 840 });
    await page.screenshot({ path: 'ui-check.local/note-editor.png' });
    console.log('Note editor checks passed');
} catch (error) {
    console.error('Browser errors:', errors);
    if (page) {
        await page.screenshot({ path: 'ui-check.local/note-editor-failure.png' }).catch(() => {});
        console.error((await page.locator('.ProseMirror').innerHTML().catch(() => '')).slice(0, 2500));
        console.error((await page.locator('body').innerText().catch(() => '')).slice(0, 3000));
    }
    throw error;
} finally {
    await browser?.close();
    await server.close();
}

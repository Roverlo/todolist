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
// Separate optimized modules from the live preview and other test servers.
const server = await createViteServer({ cacheDir: 'node_modules/.vite-test-notes', logLevel: 'error', server: { host: '127.0.0.1', port, strictPort: true } });
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
    await page.getByRole('button', { name: 'AI 设置', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'AI 设置', exact: true }).count(), 1, 'Settings must remain available without a selected note');
    await page.getByRole('button', { name: '创建新随记' }).click();
    const body = page.getByRole('textbox', { name: '随记正文', exact: true });
    await body.waitFor();
    assert.deepEqual(errors, [], 'Editor should initialize without runtime or duplicate-extension errors');
    const storedNotes = () => page.evaluate(() => JSON.parse(localStorage.getItem('project-todo-app')).state.notes);
    const openNote = async (content, title) => {
        const previousBody = await body.elementHandle();
        const id = await page.evaluate(async ({ content, title }) => {
            const { useAppStore } = await import('/src/state/appStore.ts');
            const store = useAppStore.getState();
            const note = store.addNote({ content, title, tags: ['兼容测试'], date: '2026-09-06' });
            store.setSelectedNoteId(note.id);
            return note.id;
        }, { content, title });
        await previousBody.waitForElementState('hidden');
        await previousBody.dispose();
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

    const renameId = await openNote('<p>原有正文</p>', '重命名前');
    const beforeRename = (await storedNotes()).find(note => note.id === renameId);
    const treeOrder = () => page.locator('.tree-node[data-node-id^="note-"]').evaluateAll(nodes => nodes.map(node => node.dataset.nodeId));
    const originalOrder = await treeOrder();
    const renameRow = () => page.locator(`[data-node-id="note-${renameId}"]`);
    const noteMenu = page.locator('.context-menu');
    const noteActions = renameRow().getByRole('button', { name: /^随记操作：/ });
    await noteActions.click();
    const actionLabels = await noteMenu.getByRole('button').allTextContents();
    assert.deepEqual(actionLabels, ['新建相邻笔记', '重命名', '置顶', '标签设置', '删除']);
    await page.keyboard.press('Escape');
    await noteMenu.waitFor({ state: 'hidden' });
    await renameRow().click({ button: 'right' });
    assert.deepEqual(await noteMenu.getByRole('button').allTextContents(), actionLabels, 'Both note menu entry points must expose the same actions');
    await page.keyboard.press('Escape');
    await noteActions.focus();
    await page.keyboard.press('Enter');
    const menuBox = await noteMenu.boundingBox();
    const buttonBox = await noteActions.boundingBox();
    assert.ok(Math.abs(menuBox.x - buttonBox.x) < 1 && menuBox.y > 0 && menuBox.y + menuBox.height <= 840,
        'Keyboard activation must anchor the menu beside the note and keep it in the viewport');
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 1186, height: 600 });
    await noteActions.click();
    await noteMenu.getByRole('button', { name: '标签设置', exact: true }).click();
    const tagPopup = page.locator('.note-tag-popup');
    const tagBox = await tagPopup.boundingBox();
    assert.ok(tagBox.y >= 0 && tagBox.y + tagBox.height <= 600, `Tags must stay inside a short window: ${JSON.stringify(tagBox)}`);
    await tagPopup.getByRole('textbox').press('Escape');
    await page.setViewportSize({ width: 1280, height: 840 });
    await page.getByRole('textbox', { name: '随记标题', exact: true }).fill('尚未自动保存的标题');
    await body.fill('改名前尚未自动保存的正文');
    await noteActions.click();
    await noteMenu.getByRole('button', { name: '重命名', exact: true }).click();
    const renameDialog = page.getByRole('dialog', { name: '重命名随记', exact: true });
    const renameInput = renameDialog.getByRole('textbox', { name: '随记名称', exact: true });
    assert.equal(await renameInput.evaluate(input => document.activeElement === input && input.selectionStart === 0 && input.selectionEnd === input.value.length), true,
        'Rename should focus and select the name');
    await renameInput.fill('  改名后的随记  ');
    await renameInput.press('Enter');
    await renameDialog.waitFor({ state: 'hidden' });
    assert.equal(await page.getByRole('textbox', { name: '随记标题', exact: true }).inputValue(), '改名后的随记');
    assert.equal(await body.innerText(), '改名前尚未自动保存的正文');
    await page.waitForFunction(() => document.querySelector('.ai-source-note strong')?.textContent === '改名后的随记');
    await body.press('Control+End');
    await page.keyboard.insertText('，改名后继续编辑');
    await saveAndReload();
    const renamed = (await storedNotes()).find(note => note.id === renameId);
    assert.equal(renamed.title, '改名后的随记', 'A pending editor save must not overwrite the sidebar rename');
    assert.match(renamed.content, /改名前尚未自动保存的正文，改名后继续编辑/);
    assert.equal(renamed.date, beforeRename.date);
    assert.equal(renamed.createdAt, beforeRename.createdAt);
    assert.deepEqual(renamed.tags, beforeRename.tags);
    // Reload clears the calendar filter, so compare the same day's original rows.
    assert.deepEqual((await treeOrder()).filter(id => originalOrder.includes(id)), originalOrder,
        'Renaming must keep daily notes in their original order');

    const otherId = await openNote('<p>另一条随记</p>', '另一条随记');
    await body.fill('另一条未保存的正文');
    await renameRow().click({ button: 'right' });
    await page.getByRole('button', { name: '重命名', exact: true }).click();
    await renameInput.fill('   ');
    assert.equal(await renameDialog.getByRole('button', { name: '保存', exact: true }).isDisabled(), true);
    await renameInput.press('Enter');
    assert.equal(await renameDialog.isVisible(), true, 'An empty name must not be submitted');
    await renameInput.fill('取消的名称');
    await renameInput.press('Escape');
    assert.equal((await storedNotes()).find(note => note.id === renameId).title, '改名后的随记');
    await noteActions.click();
    await noteMenu.getByRole('button', { name: '重命名', exact: true }).click();
    await renameInput.fill('侧栏再次改名');
    await renameDialog.getByRole('button', { name: '保存', exact: true }).click();
    assert.equal(await page.getByRole('textbox', { name: '随记标题', exact: true }).inputValue(), '另一条随记', 'Renaming another note must not navigate away');
    assert.equal(await body.innerText(), '另一条未保存的正文');
    await renameRow().click();
    await page.waitForFunction(() => document.querySelector('.note-editor-title')?.value === '侧栏再次改名');
    assert.match((await storedNotes()).find(note => note.id === otherId).content, /另一条未保存的正文/);
    await page.screenshot({ path: 'ui-check.local/note-rename.png' });
    console.log('Passed: ellipsis/right-click menu parity, keyboard anchoring, rename, Enter/Escape, empty names, pending drafts, other-note rename, date/order and reload');

    const pasteText = (text, html = '') => body.evaluate((root, { text, html }) => {
        const clipboard = new DataTransfer();
        clipboard.setData('text/plain', text);
        if (html) clipboard.setData('text/html', html);
        root.dispatchEvent(new ClipboardEvent('paste', { clipboardData: clipboard, bubbles: true, cancelable: true }));
    }, { text, html });
    const oldURL = 'https://example.com/old?ref=1';
    const newURL = 'https://example.org/new?ref=2';
    await openNote('<p></p>', '网址粘贴覆盖');
    await body.click();
    await pasteText(oldURL);
    assert.equal(await body.innerText(), oldURL);
    assert.equal(await body.locator('a').getAttribute('href'), oldURL, 'Pasted URLs should still become links');
    assert.equal(await body.locator('a').evaluate(link => !link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))), true,
        'A plain link click must cancel native navigation so the text can be edited');
    for (const ctrlKey of [false, true]) {
        const reachedShell = await body.locator('a').evaluate((link, ctrlKey) => {
            let reachedBody = false;
            const shellListener = event => { reachedBody = true; event.preventDefault(); };
            document.body.addEventListener('click', shellListener);
            link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey }));
            document.body.removeEventListener('click', shellListener);
            return reachedBody;
        }, ctrlKey);
        assert.equal(reachedShell, ctrlKey, 'Only Ctrl+click should reach the desktop shell link opener');
    }
    await saveAndReload();
    await body.locator('a').click();
    await body.press('Control+Home');
    await body.press('Shift+End');
    assert.equal(await page.evaluate(() => window.getSelection().toString()), oldURL);
    await pasteText(newURL);
    assert.equal(await body.innerText(), newURL, 'Pasting a URL over a selected URL must replace its visible text');
    assert.equal(await body.locator('a').getAttribute('href'), newURL, 'The displayed URL and destination must match');
    await body.press('Control+z');
    assert.equal(await body.innerText(), oldURL);
    assert.equal(await body.locator('a').getAttribute('href'), oldURL);
    await body.press('Control+y');
    assert.equal(await body.innerText(), newURL);
    await saveAndReload();
    assert.equal(await body.locator('a').getAttribute('href'), newURL);
    console.log('Passed: URL auto-formatting, selected URL replacement, matching destination, undo/redo and reload');

    for (const [name, content, clipboardHTML, isCode] of [
        ['普通文字', '<p>替换这段文字</p>', '', false],
        ['网页富文本', `<p><a href="${oldURL}">${oldURL}</a></p>`, `<a href="${newURL}">${newURL}</a>`, false],
        ['表格', `<table><tbody><tr><td><p><a href="${oldURL}">${oldURL}</a></p></td></tr></tbody></table>`, '', false],
        ['待办', `<ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p><a href="${oldURL}">${oldURL}</a></p></li></ul>`, '', false],
        ['代码块', `<pre><code>${oldURL}</code></pre>`, '', true],
    ]) {
        await openNote(content, `网址覆盖：${name}`);
        await body.locator('p, pre').first().click();
        await body.locator('p, pre').first().evaluate(element => {
            const range = document.createRange();
            range.selectNodeContents(element);
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
        });
        await page.waitForFunction(() => !document.querySelector('.ProseMirror').editor.state.selection.empty);
        assert.equal(await page.evaluate(() => window.getSelection().toString()), name === '普通文字' ? '替换这段文字' : oldURL);
        await pasteText(newURL, clipboardHTML);
        assert.equal((await body.innerText()).trim(), newURL, `${name}: URL paste must replace the selected text`);
        if (isCode) assert.equal(await body.locator('a').count(), 0, 'Code should remain literal text');
        else assert.equal(await body.locator('a').getAttribute('href'), newURL, `${name}: URL text and destination must agree`);
    }
    console.log('Passed: plain/HTML URL paste over labels and links, including tables, checklists and literal code');

    const choose = async (label, value) => {
        await page.getByRole('combobox', { name: label, exact: true }).click();
        const menu = page.getByRole('listbox', { name: label, exact: true });
        if (typeof value === 'object') await menu.getByRole('option', { name: value.label, exact: true }).click();
        else await menu.locator('[role="option"][data-value="' + value + '"]').click();
    };

    // Real mouse/keyboard selection must stay readable over saved colors and after toolbar focus moves.
    const selectionNoteId = await openNote('<p>前缀 <span style="color:#008000"><mark data-color="#ff0000" style="background-color:#ff0000">选区可见</mark></span> 后缀</p>'
        + '<p>' + '多行文字也要保留清楚的选区提示。'.repeat(8) + '</p>'
        + '<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><p><span style="color:red">已完成事项</span></p></li></ul>'
        + '<p>行内 <code>selected</code></p><pre><code>const selected = true;</code></pre>', '选区显示回归');
    const originalSelectionHTML = await body.evaluate(root => root.editor.getHTML());
    for (const colors of await body.locator('code').evaluateAll(elements => elements.map(el => {
        const css = getComputedStyle(el);
        return [css.color, css.caretColor];
    }))) assert.deepEqual(colors, ['rgb(55, 65, 81)', 'rgb(55, 65, 81)'], 'Code text and caret must be readable on the light editor background');
    const selectedMark = body.locator('mark');
    const dragBox = await selectedMark.boundingBox();
    await page.mouse.move(dragBox.x + 1, dragBox.y + dragBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(dragBox.x + dragBox.width - 1, dragBox.y + dragBox.height / 2, { steps: 8 });
    await page.mouse.up();
    assert.equal(await page.evaluate(() => window.getSelection().toString()), '选区可见');
    const assertBorderlessSelection = async () => {
        const selected = body.locator('.note-selection');
        await selected.first().waitFor();
        for (const edge of await selected.evaluateAll(elements => elements.map(el => {
            const css = getComputedStyle(el);
            return [css.outlineStyle, css.boxShadow, css.borderTopWidth];
        }))) {
            assert.deepEqual(edge, ['none', 'none', '0px'], 'Selection must not add white lines, dark frames or halos');
        }
    };
    await assertBorderlessSelection();
    const selectionColors = ['rgb(37, 99, 235)', 'rgb(255, 255, 255)'];
    const lightSelectionColors = ['rgb(219, 234, 254)', 'rgb(23, 37, 84)'];
    const nativeSelectionColors = () => body.locator('mark').evaluate(el => {
        const css = getComputedStyle(el, '::selection');
        return [css.backgroundColor, css.color];
    });
    for (const theme of ['blue', 'green', 'purple', 'orange', 'mono', 'sky', 'rose', 'indigo']) {
        await page.evaluate(async colorScheme => (await import('/src/state/appStore.ts')).useAppStore.getState().setSettings({ colorScheme }), theme);
        await page.waitForFunction(theme => document.documentElement.dataset.theme === theme, theme);
        assert.deepEqual(await nativeSelectionColors(), lightSelectionColors, `Selection over a dark highlight must stay readable in ${theme}`);
    }
    await page.evaluate(async () => (await import('/src/state/appStore.ts')).useAppStore.getState().setSettings({ colorScheme: 'purple' }));
    await page.screenshot({ path: 'ui-check.local/note-selection-active.png' });
    const assertRetainedSelection = async (text, colors = selectionColors) => {
        const retained = body.locator('.note-selection');
        await retained.first().waitFor();
        assert.equal((await retained.allTextContents()).join(''), text);
        for (const actual of await retained.evaluateAll(elements => elements.flatMap(el => [el, ...el.querySelectorAll('*')]).map(el => {
            const css = getComputedStyle(el);
            return [css.backgroundColor, css.color];
        }))) assert.deepEqual(actual, colors, 'Saved colors and completed-task gray must not hide the retained selection');
        assert.doesNotMatch(await body.evaluate(root => root.editor.getHTML()), /note-selection/, 'Selection is a visual decoration, not saved formatting');
    };
    await page.getByRole('button', { name: '背景颜色菜单', exact: true }).click();
    const selectionPalette = page.getByRole('dialog', { name: '选择背景颜色', exact: true });
    const selectionHex = selectionPalette.getByRole('textbox', { name: '背景颜色色号', exact: true });
    await selectionHex.fill('#123456');
    await selectionHex.press('Control+A');
    await assertRetainedSelection('选区可见', lightSelectionColors);
    assert.equal(await body.evaluate(root => root.editor.getHTML()), originalSelectionHTML, 'Selecting text and opening a palette must not modify the document');
    await page.screenshot({ path: 'ui-check.local/note-selection-palette.png' });
    await selectionHex.press('Escape');
    await page.getByRole('combobox', { name: '正文字体', exact: true }).click();
    await assertRetainedSelection('选区可见', lightSelectionColors);
    await page.getByRole('listbox', { name: '正文字体', exact: true }).getByRole('option', { name: 'Arial', exact: true }).click();
    await page.waitForFunction(() => document.activeElement === document.querySelector('.ProseMirror'));
    await assertBorderlessSelection();
    assert.equal(await body.locator('span[style*="Arial"]').innerText(), '选区可见', 'Formatting must affect only the visibly selected range');
    await page.getByRole('button', { name: '插入链接', exact: true }).click();
    await page.getByLabel('显示文字', { exact: true }).press('Control+A');
    await assertRetainedSelection('选区可见', lightSelectionColors);
    await page.getByLabel('链接地址', { exact: true }).fill('https://example.com/selected');
    await page.getByRole('button', { name: '应用链接', exact: true }).click();
    assert.equal(await body.locator('a').innerText(), '选区可见');
    await body.press('Control+A');
    const allSelectedText = await body.evaluate(root => root.editor.state.doc.textContent);
    await page.getByRole('button', { name: '字体颜色菜单', exact: true }).click();
    await assertRetainedSelection(allSelectedText, lightSelectionColors);
    await page.screenshot({ path: 'ui-check.local/note-selection-multiline.png' });
    await page.emulateMedia({ forcedColors: 'active' });
    const systemSelectionColors = await nativeSelectionColors();
    assert.notEqual(systemSelectionColors[0], systemSelectionColors[1], 'Windows high contrast must distinguish text and selection');
    await assertRetainedSelection(allSelectedText, systemSelectionColors);
    await assertBorderlessSelection();
    await page.emulateMedia({ forcedColors: 'none' });
    await page.keyboard.press('Escape');
    await body.press('ArrowRight');
    await page.waitForFunction(() => document.querySelector('.ProseMirror').editor.state.selection.empty);
    assert.equal(await body.locator('.note-selection').count(), 0, 'Collapsing the selection must remove every retained highlight');
    assert.deepEqual(await selectedMark.evaluate(el => [getComputedStyle(el).backgroundColor, getComputedStyle(el).color]),
        ['rgb(255, 0, 0)', 'rgb(0, 128, 0)'], 'Deselecting must restore the original foreground and background');
    await body.press('Control+A');
    await page.getByRole('combobox', { name: '正文字体', exact: true }).focus();
    await assertRetainedSelection(allSelectedText, lightSelectionColors);
    await saveAndReload();
    assert.doesNotMatch((await storedNotes()).find(note => note.id === selectionNoteId).content, /note-selection/);
    assert.equal(await body.locator('.note-selection').count(), 0, 'Reload must not restore a stale visual selection');
    console.log('Passed: mouse/keyboard selection, eight themes, palette/input/font/link focus, exact formatting range, multiline/checklist/code selection, high contrast and clean persistence');

    await openNote('<p>原文保留，点击空白不会替换。</p>', '空白点击取消选区');
    const beforeBlankClicks = await body.evaluate(root => root.editor.getHTML());
    const selectBlankTestText = async () => {
        await body.click();
        await page.waitForFunction(() => document.querySelector('.ProseMirror').editor.view.hasFocus());
        await body.press('Control+Home');
        await page.waitForFunction(() => {
            const selection = document.querySelector('.ProseMirror').editor.state.selection;
            return selection.empty && selection.from === 1;
        });
        for (let i = 0; i < 4; i++) {
            await page.keyboard.press('Shift+ArrowRight');
            await page.waitForFunction(to => document.querySelector('.ProseMirror').editor.state.selection.to === to, i + 2);
        }
        await assertBorderlessSelection();
    };
    const assertDeselected = async () => {
        await page.waitForFunction(() => document.querySelector('.ProseMirror').editor.state.selection.empty);
        assert.equal(await body.locator('.note-selection').count(), 0);
        assert.equal(await body.evaluate(root => root.editor.getHTML()), beforeBlankClicks, 'Deselecting must not edit the note');
    };
    await selectBlankTestText();
    const contentBox = await page.locator('.editor-content').boundingBox();
    const blankPoint = { x: contentBox.x + contentBox.width / 2, y: contentBox.y + contentBox.height - 20 };
    assert.equal(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.className, blankPoint), 'editor-content',
        'Reproduce the blank EditorContent container below a short note, outside the editable DOM');
    await page.mouse.click(blankPoint.x, blankPoint.y);
    await assertDeselected();
    await page.waitForFunction(() => document.activeElement === document.querySelector('.ProseMirror'));
    await page.keyboard.insertText('追加');
    assert.equal(await body.textContent(), '原文保留，点击空白不会替换。追加', 'Typing after a blank click must append, not replace the former selection');
    await body.press('Control+z');
    await assertDeselected();

    for (const target of ['.note-editor-title', '.note-editor-count', '.sidebar', '.notes-center-ai-panel']) {
        await selectBlankTestText();
        // Start with a toolbar-retained selection; the next unrelated click must end it.
        await page.getByRole('button', { name: '背景颜色菜单', exact: true }).click();
        await assertRetainedSelection('原文保留');
        const box = await page.locator(target).boundingBox();
        const point = { x: box.x + 8, y: box.y + box.height - 8, target };
        assert.ok(await page.evaluate(({ x, y, target }) => document.elementFromPoint(x, y)?.closest(target), point),
            'The outside click must hit its target rather than an overlapping color swatch');
        await page.mouse.click(point.x, point.y);
        await assertDeselected();
        assert.equal(await selectionPalette.count(), 0);
        await page.getByRole('button', { name: '字体颜色菜单', exact: true }).click();
        await assertDeselected();
        await page.keyboard.press('Escape');
    }
    await selectBlankTestText();
    const paragraphBox = await body.locator('p').boundingBox();
    await page.mouse.click(paragraphBox.x + paragraphBox.width - 5, paragraphBox.y + paragraphBox.height / 2);
    await assertDeselected();
    console.log('Passed: blank body/container, title/footer/sidebar/AI clicks dismiss the real selection, toolbar reopening cannot restore it, and subsequent typing preserves the original text');

    await openNote('<p><mark data-color="#2563eb" style="background-color:#2563eb"><span style="color:#fff">左侧未选  蓝底白字  右侧未选</span></mark></p>', '同色选区');
    const collisionHTML = await body.evaluate(root => root.editor.getHTML());
    const collisionBox = await body.locator('mark').boundingBox();
    await body.press('Control+Home');
    for (let i = 0; i < '左侧未选  '.length; i++) await body.press('ArrowRight');
    for (let i = 0; i < '蓝底白字'.length; i++) await body.press('Shift+ArrowRight');
    assert.equal(await page.evaluate(() => window.getSelection().toString()), '蓝底白字');
    await assertBorderlessSelection();
    assert.deepEqual(await nativeSelectionColors(), lightSelectionColors, 'Identical blue/white source must use a contrasting fill');
    const selectedBox = await body.locator('mark').boundingBox();
    // Inline text splitting can round glyph widths to the next subpixel.
    for (const side of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(selectedBox[side] - collisionBox[side]) < 0.5, 'Selection must not shift text layout');
    assert.equal(await body.evaluate(root => root.editor.getHTML()), collisionHTML);
    await page.screenshot({ path: 'ui-check.local/note-selection-same-color.png' });
    await page.getByRole('button', { name: '背景颜色菜单', exact: true }).click();
    await selectionPalette.getByRole('textbox', { name: '背景颜色色号', exact: true }).press('Control+A');
    await assertRetainedSelection('蓝底白字', lightSelectionColors);
    await assertBorderlessSelection();
    await page.screenshot({ path: 'ui-check.local/note-selection-same-color-blurred.png' });
    await page.keyboard.press('Escape');
    await body.press('ArrowRight');
    await page.waitForFunction(() => document.querySelector('.ProseMirror').editor.state.selection.empty);
    assert.equal(await body.locator('.note-selection').count(), 0);
    assert.equal(await body.evaluate(root => root.editor.getHTML()), collisionHTML, 'Deselecting must preserve blue background and white text');
    await saveAndReload();
    assert.equal(await body.textContent(), '左侧未选  蓝底白字  右侧未选', 'Reload must preserve alignment spaces and the original text');
    assert.equal(await body.evaluate(root => root.editor.getHTML()), collisionHTML);
    console.log('Passed: identical blue/white styling, contrasting borderless active/blurred selection, stable layout and original formatting');

    for (const [color, expected] of [
        ['#2b5ee0', lightSelectionColors], ['rgb(37 99 235)', lightSelectionColors], ['blue', lightSelectionColors],
        ['#dbeafe', selectionColors], ['#fff200', selectionColors], ['rgba(37,99,235,0.2)', selectionColors],
    ]) {
        await openNote(`<p><mark data-color="${color}" style="background-color:${color}">颜色兼容</mark></p>`, '选区底色兼容');
        const html = await body.evaluate(root => root.editor.getHTML());
        await body.press('Control+A');
        await page.waitForFunction(() => !document.querySelector('.ProseMirror').editor.state.selection.empty);
        assert.deepEqual(await nativeSelectionColors(), expected, `${color} must select a contrasting fill`);
        await assertBorderlessSelection();
        await page.getByRole('button', { name: '背景颜色菜单', exact: true }).click();
        await assertRetainedSelection('颜色兼容', expected);
        assert.equal(await body.evaluate(root => root.editor.getHTML()), html);
        await page.keyboard.press('Escape');
    }
    console.log('Passed: custom HEX, RGB, named, light and translucent highlights keep their original formatting with a contrasting borderless selection');

    // Highlights must decorate text without adding the dependency's padded, rounded block.
    await openNote('<p>普通文字 <span style="color:#008000"><mark data-color="#ff0000" style="background-color:#ff0000">哇水水水水</mark></span></p>'
        + '<p><mark>默认高亮</mark></p>', '文字颜色与高亮');
    const mark = body.locator('mark').first();
    const assertHighlight = async background => {
        assert.deepEqual(await mark.evaluate(el => {
            const style = getComputedStyle(el);
            return [style.backgroundColor, style.color, style.padding, style.borderRadius];
        }), [background, 'rgb(0, 128, 0)', '0px', '0px']);
    };
    await assertHighlight('rgb(255, 0, 0)');
    assert.equal(await body.locator('mark').nth(1).evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(255, 242, 0)');
    await body.evaluate(root => root.editor.commands.setTextSelection({ from: 6, to: 11 }));
    await page.getByRole('button', { name: '背景颜色菜单', exact: true }).click();
    const backgroundPalette = page.getByRole('dialog', { name: '选择背景颜色', exact: true });
    assert.equal(await backgroundPalette.locator('.word-color-option').count(), 70, 'Both palettes must provide standard colors and light/dark shades');
    assert.notEqual(await backgroundPalette.getByRole('button', { name: '应用', exact: true }).evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)', 'Editor theme variables must not make the white Apply button invisible');
    assert.ok(await backgroundPalette.getByRole('textbox', { name: '背景颜色色号', exact: true }).evaluate(el => parseFloat(getComputedStyle(el).borderTopWidth) > 0));
    await backgroundPalette.getByRole('button', { name: '背景颜色：黄色 1', exact: true }).click();
    await assertHighlight('rgb(254, 249, 195)');
    await page.getByRole('button', { name: '撤销', exact: true }).click();
    await assertHighlight('rgb(255, 0, 0)');
    await page.getByRole('button', { name: '重做', exact: true }).click();
    await assertHighlight('rgb(254, 249, 195)');
    await page.getByRole('button', { name: '背景颜色菜单', exact: true }).click();
    const hexInput = backgroundPalette.getByRole('textbox', { name: '背景颜色色号', exact: true });
    await hexInput.fill('badhex');
    assert.ok(await backgroundPalette.getByRole('button', { name: '应用', exact: true }).isDisabled());
    assert.equal(await hexInput.getAttribute('aria-invalid'), 'true');
    await hexInput.fill('#d8eaff');
    await hexInput.press('Enter');
    await assertHighlight('rgb(216, 234, 255)');
    assert.ok(await body.evaluate(el => document.activeElement === el), 'Custom color must return focus to the original selection');
    await saveAndReload();
    await assertHighlight('rgb(216, 234, 255)');
    await body.evaluate(root => root.editor.commands.setTextSelection({ from: 6, to: 11 }));
    await page.getByRole('button', { name: '背景颜色菜单', exact: true }).click();
    await backgroundPalette.getByRole('button', { name: '无颜色', exact: true }).click();
    await page.waitForFunction(() => document.activeElement === document.querySelector('.ProseMirror'));
    assert.equal(await body.getByText('哇水水水水', { exact: true }).evaluate(el => getComputedStyle(el).color), 'rgb(0, 128, 0)', 'Clearing background must preserve text color');
    assert.equal(await body.locator('mark').count(), 1);
    await page.getByRole('button', { name: '字体颜色菜单', exact: true }).click();
    const textPalette = page.getByRole('dialog', { name: '选择字体颜色', exact: true });
    assert.equal(await textPalette.locator('.word-color-option').count(), 70);
    await page.keyboard.press('End');
    assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), '字体颜色：粉色 5');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.activeElement === document.querySelector('.ProseMirror'));
    assert.equal(await body.getByText('哇水水水水', { exact: true }).evaluate(el => getComputedStyle(el).color), 'rgb(157, 23, 77)');
    await page.getByRole('button', { name: '字体颜色菜单', exact: true }).click();
    await textPalette.getByLabel('字体颜色其他颜色', { exact: true }).fill('#123456');
    await textPalette.getByRole('button', { name: '应用', exact: true }).click();
    await page.waitForFunction(() => document.activeElement === document.querySelector('.ProseMirror'));
    assert.equal(await body.getByText('哇水水水水', { exact: true }).evaluate(el => getComputedStyle(el).color), 'rgb(18, 52, 86)');
    await saveAndReload();
    assert.equal(await body.getByText('哇水水水水', { exact: true }).evaluate(el => getComputedStyle(el).color), 'rgb(18, 52, 86)');
    await page.getByRole('button', { name: '字体颜色菜单', exact: true }).click();
    await page.keyboard.press('Escape');
    assert.ok(await page.getByRole('button', { name: '字体颜色菜单', exact: true }).evaluate(el => document.activeElement === el));
    assert.equal(await textPalette.count(), 0);

    await openNote('<p><span style="font-size:32px;color:#008000"><mark data-color="#fef9c3" style="background-color:#fef9c3">大字高亮，自动换行后也应保持自然的文字背景。'
        + '继续输入一段长文字检查换行效果。'.repeat(7) + '</mark></span></p><p>下一段不应被高亮色块遮挡。</p>', '色盘与多行高亮');
    assert.ok(await body.locator('mark').evaluate(el => el.getClientRects().length > 1), 'The test must cover a wrapping highlight');
    await page.getByRole('button', { name: '背景颜色菜单', exact: true }).click();
    const paletteBox = await backgroundPalette.boundingBox();
    assert.ok(paletteBox.x >= 0 && paletteBox.x + paletteBox.width <= 1280 && paletteBox.y + paletteBox.height <= 840, 'Expanded palette must fit the viewport');
    await page.screenshot({ path: 'ui-check.local/note-colors.png' });
    await page.keyboard.press('Escape');
    console.log('Passed: unpadded inline highlights, 70-color palettes, custom HEX/native colors, keyboard, undo/redo, independent clearing and save/reload');

    const aiContent = await page.evaluate(async () => {
        const { noteContentForAI } = await import('/src/utils/noteAI.ts');
        const samples = {
            plain: '<p>张三明天完成联调</p><p>保留换行</p>',
            checklist: '<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><p>已完成父项</p><ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p>仍需跟进的子项</p></li></ul></li><li data-type="taskItem" data-checked="false"><p>周五提交报告</p></li></ul>',
            importedChecklist: '<ul><li><input type="checkbox" checked>旧格式完成项</li><li><input type="checkbox">旧格式未完成项</li></ul>',
            table: '<table><tr><th>事项</th><th>责任人</th><th>截止日期</th></tr><tr><td><p>接口联调</p></td><td>张三</td><td>周五</td></tr><tr><td>提交报告</td><td></td><td>下周一</td></tr><tr><td colspan="2" rowspan="2">跨格说明</td><td>日期</td></tr></table>',
            images: '<p><img src="data:image/png;base64,PRIVATE" alt="图片文字" data-local-path="C:/private.png"></p><img src="https://example.invalid/private.png">',
            mixed: '<p>按文字生成</p><img src="data:image/png;base64,PRIVATE"><script>不应发送</script><style>同样不发送</style>',
            links: '<p>查看<a href="https://example.invalid/doc">项目文档</a><a href="data:image/png;base64,PRIVATE">数据链接</a></p>',
            empty: '<ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p></p></li></ul><table><tr><td></td></tr></table>',
            ordered: '<ol start="3"><li>第三项</li><li>第四项</li></ol>',
        };
        return Object.fromEntries(Object.entries(samples).map(([name, html]) => [name, noteContentForAI(html)]));
    });
    assert.match(aiContent.plain.text, /张三明天完成联调\n保留换行/);
    assert.match(aiContent.checklist.text, /- \[x\] 已完成父项/);
    assert.match(aiContent.checklist.text, /- \[ \] 仍需跟进的子项/);
    assert.match(aiContent.checklist.text, /- \[ \] 周五提交报告/);
    assert.match(aiContent.importedChecklist.text, /- \[x\] 旧格式完成项/);
    assert.match(aiContent.importedChecklist.text, /- \[ \] 旧格式未完成项/);
    assert.match(aiContent.table.text, /\| 事项 \| 责任人 \| 截止日期 \|/);
    assert.match(aiContent.table.text, /\| 接口联调 \| 张三 \| 周五 \|/);
    assert.match(aiContent.table.text, /\| 提交报告 \|  \| 下周一 \|/);
    assert.match(aiContent.table.text, /跨格说明\[跨2列\]\[跨2行\]/);
    assert.deepEqual(aiContent.images, { text: '', imageCount: 2 });
    assert.deepEqual(aiContent.mixed, { text: '按文字生成', imageCount: 1 });
    assert.match(aiContent.links.text, /项目文档 \(https:\/\/example.invalid\/doc\)/);
    assert.doesNotMatch(aiContent.links.text, /PRIVATE|base64/);
    assert.equal(aiContent.empty.text, '');
    assert.match(aiContent.ordered.text, /3\. 第三项\n4\. 第四项/);
    console.log('Passed: AI text serialization preserves completion, table cells/spans, lists and links, excludes image bytes and handles empty notes');

    await openNote('<p data-indent="7">正文对齐</p>', 'Tab 对齐');
    await body.press('Control+Home');
    await body.press('Tab');
    assert.ok(await body.evaluate(el => document.activeElement === el), 'Tab must not move focus to the note tags at the indent limit');
    assert.equal(await body.textContent(), '\u00a0'.repeat(4) + '正文对齐');
    await body.press('Shift+Tab');
    assert.equal(await body.textContent(), '正文对齐', 'Shift+Tab must remove the inserted spacing');
    await body.evaluate(root => root.editor.commands.setTextSelection(3));
    await body.press('Tab');
    assert.equal(await body.textContent(), '正文' + '\u00a0'.repeat(4) + '对齐', 'Tab must insert spacing at the caret, not move the whole paragraph');
    await saveAndReload();
    assert.equal(await body.textContent(), '正文' + '\u00a0'.repeat(4) + '对齐', 'Alignment spaces must survive save/reload');
    await body.press('Control+Home');
    await body.press('Escape');
    await page.waitForFunction(() => document.activeElement !== document.querySelector('.ProseMirror'));
    await page.keyboard.press('Tab');
    assert.ok(await page.locator('.note-editor-footer').evaluate(el => el.contains(document.activeElement)),
        'Escape then Tab must still let keyboard users leave the editor');

    await openNote('<p>第一段</p><p>第二段</p>', '选区缩进');
    await body.press('Control+A');
    await body.press('Tab');
    assert.equal(await body.locator('p[data-indent="1"]').count(), 2, 'Tab on a selection must indent without replacing text');
    await body.press('Shift+Tab');
    assert.equal(await body.locator('p[data-indent]').count(), 0);
    await body.press('Shift+Tab');
    assert.ok(await body.evaluate(el => document.activeElement === el), 'Shift+Tab at the first indent level must stay in the editor');
    assert.deepEqual(await body.locator('p').allTextContents(), ['第一段', '第二段']);

    await openNote('<ul><li><p>首项</p></li></ul>', '首项缩进');
    await body.press('Control+Home');
    await body.press('Tab');
    assert.ok(await body.evaluate(el => document.activeElement === el), 'A first list item must not send Tab to the footer');
    assert.equal((await body.innerText()).trim(), '首项');

    await openNote('<pre><code>const value = 1;</code></pre>', '代码 Tab');
    await body.press('Control+Home');
    await body.press('Tab');
    assert.equal(await body.locator('code').textContent(), '    const value = 1;');
    await body.press('Shift+Tab');
    await body.press('Shift+Tab');
    assert.equal(await body.locator('code').textContent(), 'const value = 1;');
    assert.ok(await body.evaluate(el => document.activeElement === el));
    console.log('Passed: caret spacing, reverse Tab, selection/list boundaries, code indentation and keyboard escape');

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

    const tasksBeforeChecklist = await page.evaluate(() => JSON.parse(localStorage.getItem('project-todo-app')).state.tasks);
    const checklistId = await openNote('<p></p>', '随记待办清单');
    const checklistButton = page.getByRole('button', { name: '待办列表', exact: true });
    assert.equal((await checklistButton.innerText()).trim(), '待办', 'The checklist entry must have a visible label');
    await checklistButton.click();
    const items = body.locator('li[data-type="taskItem"]');
    assert.equal(await checklistButton.getAttribute('aria-pressed'), 'true');
    assert.equal(await items.first().locator('p').evaluate(el => getComputedStyle(el, '::before').content), '"输入待办，回车继续添加"');
    await page.keyboard.insertText('整理会议纪要');
    assert.equal(await items.first().locator('p').evaluate(el => getComputedStyle(el, '::before').content), 'none', 'The hint must disappear after typing');
    await body.press('Enter');
    await page.keyboard.insertText('发送评审材料');
    assert.equal(await items.count(), 2, 'Enter must continue the checklist');
    await body.getByRole('checkbox', { name: '标记为已完成：整理会议纪要', exact: true }).check();
    assert.equal(await items.first().locator('p').evaluate(el => getComputedStyle(el).color), 'rgb(107, 114, 128)');
    assert.notEqual(await items.nth(1).locator('p').evaluate(el => getComputedStyle(el).color), 'rgb(107, 114, 128)');
    await page.waitForFunction(id => JSON.parse(localStorage.getItem('project-todo-app')).state.notes
        .find(note => note.id === id)?.content.includes('data-checked="true"'), checklistId);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await body.waitFor();
    assert.ok(await items.first().getByRole('checkbox').isChecked(), 'Autosave must preserve completion');
    await items.nth(1).getByRole('checkbox').check();
    // Let the checkbox's scheduled focus finish before moving the caret for typing.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await items.nth(1).locator('p').click();
    await page.waitForFunction(() => document.querySelectorAll('.ProseMirror li[data-type="taskItem"] > div > p')[1]
        ?.contains(window.getSelection()?.anchorNode));
    await page.keyboard.press('Control+End');
    // Native selection changes reach ProseMirror asynchronously; type only once its caret has caught up.
    await page.waitForFunction(() => {
        const caret = document.querySelector('.ProseMirror')?.editor.state.selection.$from;
        return caret?.parent.textContent === '发送评审材料' && caret.parentOffset === caret.parent.content.size;
    });
    await page.keyboard.press('Enter');
    assert.equal(await items.nth(2).getAttribute('data-checked'), 'false', 'New items must start unchecked even after a completed item');
    await page.keyboard.insertText('下次会议安排');
    await body.press('Tab');
    assert.equal(await body.locator('ul ul li').count(), 1);
    assert.notEqual(await items.nth(2).locator('p').evaluate(el => getComputedStyle(el).color), 'rgb(107, 114, 128)',
        'Completing a parent must not gray an unchecked child');
    await body.press('Shift+Tab');
    await body.press('Enter');
    await body.press('Enter');
    await page.keyboard.insertText('普通补充说明');
    assert.equal(await items.count(), 3, 'Enter on an empty item must end the checklist');
    assert.equal(await body.locator(':scope > p').last().innerText(), '普通补充说明');
    await body.getByRole('checkbox', { name: '标记为未完成：整理会议纪要', exact: true }).uncheck();
    await saveAndReload();
    assert.notEqual(await items.first().locator('p').evaluate(el => getComputedStyle(el).color), 'rgb(107, 114, 128)');
    assert.deepEqual(await items.evaluateAll(nodes => nodes.map(node => node.dataset.checked)), ['false', 'true', 'false']);
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('project-todo-app')).state.tasks), tasksBeforeChecklist,
        'Note checklists must not create or alter task-board records');
    await page.screenshot({ path: 'ui-check.local/note-checklist.png' });
    console.log('Passed: checklist entry, Enter, completion/reopen, nested states, autosave/reload and task-board isolation');

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

    // Legacy tables can have only some columns sized; shrinking must not stretch the remaining column.
    await page.setViewportSize({ width: 1538, height: 840 });
    await openNote('<table style="width: 100%; min-width: 744px"><tbody>'
        + '<tr><td style="background-color: #fff200"><p></p></td><td colwidth="243"><p>会议记录</p></td><td colwidth="196"><p></p></td><td colwidth="280"><p></p></td></tr>'
        + '<tr><td><p></p></td><td colwidth="243"><p>保留表格内容</p></td><td colwidth="196"><p></p></td><td colwidth="280"><p></p></td></tr>'
        + '</tbody></table>', '表格横向缩放');
    const hideAssistant = page.getByRole('button', { name: '隐藏 AI 助手', exact: true });
    if (await hideAssistant.isVisible()) await hideAssistant.click();
    const resizeTable = body.locator('table');
    const dragColumn = async (column, delta) => {
        const cell = await resizeTable.locator('tr').first().locator('td').nth(column).boundingBox();
        const x = cell.x + cell.width - 2;
        const y = cell.y + cell.height / 2;
        await page.mouse.move(x, y);
        await body.locator('.column-resize-handle').first().waitFor();
        await page.mouse.down();
        await page.mouse.move(x + delta, y, { steps: 8 });
        await page.mouse.up();
    };
    const beforeResize = await resizeTable.boundingBox();
    await dragColumn(3, -120);
    assert.equal(await resizeTable.locator('tr').first().locator('td').last().getAttribute('colwidth'), '160');
    const afterResize = await resizeTable.boundingBox();
    assert.ok(beforeResize.width - afterResize.width >= 100, 'Dragging the right border left must shrink the whole table, not redistribute its width');
    assert.equal(afterResize.x, beforeResize.x, 'Resizing must keep the left edge in place');
    await page.getByRole('button', { name: '撤销', exact: true }).click();
    assert.equal(await resizeTable.locator('tr').first().locator('td').last().getAttribute('colwidth'), '280');
    await page.getByRole('button', { name: '重做', exact: true }).click();
    assert.ok(Math.abs((await resizeTable.boundingBox()).width - afterResize.width) < 2);
    await dragColumn(1, 40);
    assert.equal(await resizeTable.locator('tr').first().locator('td').nth(1).getAttribute('colwidth'), '283', 'Internal column borders must remain resizable');
    const savedWidth = (await resizeTable.boundingBox()).width;
    await saveAndReload();
    if (await hideAssistant.isVisible()) await hideAssistant.click();
    assert.ok(Math.abs((await resizeTable.boundingBox()).width - savedWidth) < 2, 'Saved table widths must survive reload');
    assert.equal(await resizeTable.locator('tr').count(), 2);
    assert.equal(await resizeTable.getByText('保留表格内容', { exact: true }).count(), 1);
    assert.equal(await resizeTable.locator('td').first().evaluate(el => el.style.backgroundColor), 'rgb(255, 242, 0)', 'Legacy cell background colors must survive editing and reload');
    const tableDownload = page.waitForEvent('download');
    await page.getByTitle('导出为 HTML', { exact: true }).click();
    const tableHTML = await readFile(await (await tableDownload).path(), 'utf8');
    assert.equal(await page.evaluate(html => new DOMParser().parseFromString(html, 'text/html').querySelector('table').style.width === '100%', tableHTML), false,
        'Exported tables must not regain forced full width');
    console.log(`Passed: right-edge table shrink (${Math.round(beforeResize.width)} to ${Math.round(afterResize.width)}px), column resizing, undo/redo, reload and export`);
    await page.setViewportSize({ width: 1280, height: 840 });

    await openNote('<p>表格操作示例</p>', '表格编辑');
    await body.press('Control+End');
    await body.press('Enter');
    await page.getByRole('button', { name: '插入表格', exact: true }).click();
    await page.locator('[data-table-grid-cell][data-rows="3"][data-cols="3"]').click();
    await body.locator('table').waitFor();
    assert.equal(await body.locator('tr').count(), 3);
    assert.equal(await body.locator('tr').first().locator('td, th').count(), 3);
    await body.locator('td, th').first().click();
    await body.press('Shift+Tab');
    assert.ok(await body.evaluate(el => document.activeElement === el), 'Reverse Tab in the first cell must not jump to the footer');
    await body.press('Tab');
    assert.ok(await body.locator('td, th').nth(1).evaluate(el => el.contains(window.getSelection()?.anchorNode)), 'Tab in a table must move to the next cell');
    await body.press('Shift+Tab');
    assert.ok(await body.locator('td, th').first().evaluate(el => el.contains(window.getSelection()?.anchorNode)));
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
    await page.getByRole('combobox', { name: '表格操作', exact: true }).focus();
    assert.equal(await body.locator('.selectedCell').count(), 2);
    assert.equal(await body.locator('.note-selection').count(), 0, 'Cell selection must keep its own overlay');
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
    const toolbarHeight = (await page.getByRole('toolbar').boundingBox()).height;
    assert.ok(toolbarHeight <= 82, 'The toolbar should occupy only two compact rows');
    assert.equal(await page.locator('.notes-center-header').count(), 0, 'Editing must not reserve a separate title bar');
    assert.equal(await page.getByRole('toolbar').getByRole('button', { name: 'AI 设置', exact: true }).count(), 1, 'AI actions must be integrated into the toolbar');
    assert.equal(await page.getByLabel('表格操作', { exact: true }).count(), 0, 'Table actions should only appear inside a table');
    assert.equal(await page.getByLabel('更多工具', { exact: true }).count(), 0, 'Tools should be directly accessible');
    for (const name of ['查找替换', '清除格式', '引用', '行内代码', '代码块', '分隔线']) {
        assert.equal(await page.getByRole('toolbar').getByRole('button', { name, exact: true }).isVisible(), true, `${name} should be visible without opening a menu`);
    }
    await page.getByRole('button', { name: '分隔线', exact: true }).press('Enter');
    await body.locator('hr').waitFor();
    await body.press('Control+End');
    await page.getByRole('button', { name: '插入表格', exact: true }).press('Enter');
    await body.locator('table').waitFor();
    assert.equal((await page.getByRole('toolbar').boundingBox()).height, toolbarHeight, 'Table tools must not add another row');
    await body.locator('th').first().click();
    await page.getByRole('button', { name: '插入图片', exact: true }).click();
    const tableImageChooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: '选择图片', exact: false }).click();
    await (await tableImageChooser).setFiles({ name: '表格图片.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
    await page.getByRole('dialog').getByRole('button', { name: '插入图片', exact: true }).click();
    await body.locator('table .image-view__body').click();
    await page.getByRole('combobox', { name: '图片宽度', exact: true }).waitFor();
    await page.getByRole('combobox', { name: '表格操作', exact: true }).waitFor();
    assert.equal(await page.locator('.ai-panel-header').count(), 0, 'Do not add a second title bar for the assistant');
    for (const width of [1100, 1186, 1280, 1538, 1920]) {
        await page.setViewportSize({ width, height: 698 });
        let closedLayout;
        for (const panelOpen of [false, true, false]) {
            const toggle = page.getByRole('button', { name: panelOpen ? '显示 AI 助手' : '隐藏 AI 助手', exact: true });
            if (await toggle.isVisible()) await toggle.click();
            const layout = await page.locator('.notes-main-root').evaluate(el => ({
                topBars: ['.notes-center-actions', '#editor-toolbar-portal'].map(selector => {
                    const rect = el.querySelector(selector).getBoundingClientRect();
                    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
                }),
                titleTop: el.querySelector('.note-editor-title').getBoundingClientRect().top,
            }));
            closedLayout ??= layout;
            if (width >= 1186) assert.equal(layout.topBars[1].height, toolbarHeight, `Image and table tools must stay within two rows at ${width}px`);
            else assert.ok(layout.topBars[1].height <= 120, 'Narrow windows may wrap contextual image tools to one additional row');
            assert.deepEqual(layout, closedLayout, `Header, toolbar and note top must not jump when toggling AI at ${width}px`);
            assert.ok(await page.locator('.notes-main-root').evaluate(el =>
                el.getBoundingClientRect().left >= document.querySelector('.sidebar').getBoundingClientRect().right),
                'The navigation sidebar must not overlap the document workspace');
            assert.ok(await page.getByRole('toolbar').evaluate(el => {
                const bounds = el.getBoundingClientRect();
                const groupsFit = [...el.querySelectorAll('.editor-toolbar-row')].every(row => {
                    const groups = [...row.children].map(group => group.getBoundingClientRect());
                    return groups.every((group, i) => !i || group.top >= groups[i - 1].bottom || group.left >= groups[i - 1].right);
                });
                return groupsFit && [...el.querySelectorAll('button, select')].every(control => {
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
                    return Math.abs(panel.top - document.top) < 1 && Math.abs(panel.top - toolbar.bottom) < 1
                        && Math.abs(panel.right - toolbar.right) < 1;
                }), 'AI panel and document must start below the full-width toolbar');
            }
            assert.equal(await body.locator('hr').count(), 1, 'Toggling the sidebar must preserve the editor content');
            assert.equal(await body.locator('table').count(), 1, 'Toggling the sidebar must preserve the table');
            assert.equal(await body.locator('table img').count(), 1, 'Toggling the sidebar must preserve the image');
            if ([1186, 1538].includes(width)) await page.screenshot({ path: `ui-check.local/compact-toolbar-${width}-${panelOpen ? 'open' : 'closed'}.png` });
        }
    }
    assert.equal(await page.getByRole('button', { name: '打开图片文件夹', exact: true }).isVisible(), true);
    await page.getByRole('button', { name: /^回收站/ }).click();
    await page.locator('.notes-center-header').waitFor();
    assert.equal(await page.getByRole('toolbar').count(), 0, 'Trash must not retain editing tools');
    assert.equal(await page.getByRole('button', { name: 'AI 设置', exact: true }).count(), 1, 'Trash must retain settings access');
    await page.evaluate(async () => (await import('/src/state/appStore.ts')).useAppStore.getState().setNoteViewMode('tree'));
    await body.waitFor();
    console.log(`Passed: directly accessible two-row toolbar (${toolbarHeight}px), narrow-window wrapping, image/table controls, empty/trash views and stable AI toggle at five desktop widths`);
    assert.deepEqual(errors, []);
    await page.setViewportSize({ width: 1280, height: 840 });
    await page.screenshot({ path: 'ui-check.local/note-editor.png' });
    console.log('Note editor checks passed');
} catch (error) {
    console.error('Browser errors:', errors);
    if (page) {
        console.error('Editor selection:', await page.locator('.ProseMirror').evaluate(root => ({
            from: root.editor.state.selection.from, to: root.editor.state.selection.to,
            focused: root.editor.view.hasFocus(), active: document.activeElement?.tagName,
            anchor: window.getSelection()?.anchorOffset, focus: window.getSelection()?.focusOffset,
        })).catch(() => null));
        await page.screenshot({ path: 'ui-check.local/note-editor-failure.png' }).catch(() => {});
        console.error((await page.locator('.ProseMirror').innerHTML().catch(() => '')).slice(0, 2500));
        console.error((await page.locator('body').innerText().catch(() => '')).slice(0, 3000));
    }
    throw error;
} finally {
    await browser?.close();
    await server.close();
}

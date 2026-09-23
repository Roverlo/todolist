import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

export async function checkNoteDates(page, body, { openNote, saveAndReload, storedNotes }) {
    const dateButton = page.getByRole('toolbar').getByRole('button', { name: '插入日期', exact: true });
    const dialog = page.getByRole('dialog', { name: /^(插入|修改)日期$/ });
    const input = dialog.getByLabel('选择日期', { exact: true });
    const apply = dialog.getByRole('button', { name: /^(插入|修改)日期$/ });
    const chips = body.locator('time[data-type="noteDate"]');
    const waitSelection = () => page.waitForFunction(() => {
        const editor = document.querySelector('.ProseMirror').editor, native = window.getSelection();
        return native?.anchorNode && native.focusNode
            && editor.view.dom.contains(native.anchorNode) && editor.view.dom.contains(native.focusNode)
            && editor.view.posAtDOM(native.anchorNode, native.anchorOffset) === editor.state.selection.anchor
            && editor.view.posAtDOM(native.focusNode, native.focusOffset) === editor.state.selection.head;
    });
    const localDate = offset => page.evaluate(offset => {
        const date = new Date();
        date.setDate(date.getDate() + offset);
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }, offset);
    const noteId = await openNote('<p>前后</p>', '日期标签检查');
    await body.press('Control+Home');
    await page.keyboard.press('ArrowRight');
    await waitSelection();
    await dateButton.click();
    assert.equal((await body.innerText()).trimEnd(), '前后', 'Opening the picker leaves the note unchanged');
    assert.equal(await input.evaluate(el => el === document.activeElement), true);
    assert.equal(await input.getAttribute('type'), 'date');
    assert.equal(await input.inputValue(), await localDate(0));
    for (const invalid of ['', '10000-01-01']) {
        await input.fill(invalid);
        assert.equal(await apply.isDisabled(), true);
    }
    await input.fill('2000-12-31');
    assert.equal(await dialog.locator('time').getAttribute('data-weekday'), '周日');
    await page.screenshot({ path: 'ui-check.local/note-date-picker.png' });
    await apply.click();
    await dialog.waitFor({ state: 'hidden' });
    assert.equal((await body.innerText()).trimEnd(), '前2000-12-31后');
    assert.equal(await chips.count(), 1);
    await page.waitForFunction(() => document.querySelector('.ProseMirror').editor.isFocused);
    await page.keyboard.press('Control+z');
    assert.equal((await body.innerText()).trimEnd(), '前后');
    await page.keyboard.press('Control+y');
    await saveAndReload();
    assert.equal((await body.innerText()).trimEnd(), '前2000-12-31后');
    assert.match((await storedNotes()).find(note => note.id === noteId).content,
        /<time data-type="noteDate" datetime="2000-12-31">2000-12-31<\/time>/);
    assert.equal((await storedNotes()).find(note => note.id === noteId).date, '2026-09-06');

    // A chip reopens the existing picker and replaces exactly one atomic node.
    await chips.click();
    await page.getByRole('dialog', { name: '修改日期', exact: true }).waitFor();
    assert.equal(await input.inputValue(), '2000-12-31');
    await input.fill('2032-02-29');
    await apply.click();
    assert.equal((await body.innerText()).trimEnd(), '前2032-02-29后');
    assert.equal(await chips.count(), 1);
    for (const key of ['Enter', 'Space']) {
        await chips.focus();
        await page.keyboard.press(key);
        await dialog.waitFor();
        assert.equal(await input.inputValue(), '2032-02-29');
        await input.fill('1999-01-01');
        await page.keyboard.press('Escape');
        await dialog.waitFor({ state: 'hidden' });
        assert.equal(await chips.getAttribute('datetime'), '2032-02-29');
    }
    await saveAndReload();
    // Delete/Backspace remove the whole chip without damaging adjacent text.
    for (const key of ['Delete', 'Backspace']) {
        await body.press('Control+Home');
        await waitSelection();
        await page.keyboard.press('ArrowRight');
        await waitSelection();
        if (key === 'Backspace') await page.keyboard.press('ArrowRight');
        await waitSelection();
        await page.keyboard.press(key);
        // ProseMirror may select an atom on the first key before deleting it.
        if (await chips.count()) await page.keyboard.press(key);
        assert.equal((await body.innerText()).trimEnd(), '前后');
        await page.keyboard.press('Control+z');
        assert.equal((await body.innerText()).trimEnd(), '前2032-02-29后');
    }
    await body.press('Control+End');
    await waitSelection();
    await dateButton.click();
    await dialog.getByRole('button', { name: '取消', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.ProseMirror').editor.isFocused);
    await page.keyboard.insertText('继续');
    assert.equal((await body.innerText()).trimEnd(), '前2032-02-29后继续', 'Cancel restores the caret');
    for (const [label, offset] of [['昨天', -1], ['今天', 0], ['明天', 1]]) {
        await body.press('Control+End');
        await waitSelection();
        const previous = (await body.innerText()).trimEnd();
        await dateButton.click();
        const expected = await localDate(offset);
        await dialog.getByRole('button', { name: label, exact: true }).click();
        assert.equal((await body.innerText()).trimEnd(), `${previous}${expected}`);
    }
    await saveAndReload();
    assert.equal(await chips.count(), 4);

    const text = (await body.innerText()).trimEnd();
    const ai = await page.evaluate(async () => {
        const { noteContentForAI } = await import('/src/utils/noteAI.ts');
        const editor = document.querySelector('.ProseMirror').editor;
        return { ai: noteContentForAI(editor.getHTML()).text, plain: editor.getText() };
    });
    assert.deepEqual(ai, { ai: text, plain: text }, 'AI and plain text retain dates without decorative weekdays');
    const download = page.waitForEvent('download');
    await page.getByTitle('导出为 HTML', { exact: true }).click();
    const html = await readFile(await (await download).path(), 'utf8');
    assert.match(html, /datetime="2032-02-29">2032-02-29<\/time>/);

    // Exercise ProseMirror's real clipboard serializers and paste parser.
    await body.press('Control+a');
    await waitSelection();
    const clipboard = await body.evaluate(root => {
        const data = new DataTransfer();
        root.dispatchEvent(new ClipboardEvent('copy', { clipboardData: data, bubbles: true, cancelable: true }));
        return { text: data.getData('text/plain'), html: data.getData('text/html') };
    });
    assert.equal(clipboard.text, text);
    assert.match(clipboard.html, /data-type="noteDate"/);
    await openNote('<p></p>', '粘贴日期标签');
    await body.click();
    await body.evaluate((root, data) => {
        const transfer = new DataTransfer();
        transfer.setData('text/plain', data.text);
        transfer.setData('text/html', data.html);
        root.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }));
    }, clipboard);
    assert.equal(await chips.count(), 4);
    assert.equal((await body.innerText()).trimEnd(), text);

    const tag = '<time data-type="noteDate" datetime="2026-09-23">2026-09-23</time>';
    await openNote(`<p>旧日期 2026-09-22</p><p><time data-type="noteDate" datetime="2026-02-30">无效日期文字</time></p>`
        + `<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><p>验收 ${tag}</p></li></ul>`
        + `<table><tr><td><p>提交 ${tag}</p></td></tr></table>`, '兼容与容器');
    assert.equal(await chips.count(), 2, 'Old text and invalid time elements do not become chips');
    assert.match((await body.innerText()).trimEnd(), /旧日期 2026-09-22\s+无效日期文字/);
    for (const selector of ['li', 'td']) {
        await body.locator(`${selector} time`).click();
        await input.fill('2026-09-24');
        await apply.click();
        assert.equal(await body.locator(`${selector} time`).getAttribute('datetime'), '2026-09-24');
    }
    await saveAndReload();
    assert.equal(await body.locator('li').getAttribute('data-checked'), 'true');
    assert.equal(await chips.count(), 2);
    await page.screenshot({ path: 'ui-check.local/note-date-chips.png' });

    await openNote('<pre><code>日期：</code></pre>', '代码块日期');
    await body.press('Control+End');
    await waitSelection();
    await dateButton.click();
    await input.fill('2026-09-23');
    await apply.click();
    assert.equal(await chips.count(), 0);
    assert.equal(await body.locator('pre').innerText(), '日期：2026-09-23');
    console.log('Passed: inline date chips, picker/shortcuts, click/keyboard editing, atomic deletion, undo/redo, persistence, clipboard, HTML export, AI text, legacy content, tasks/tables and code blocks');
}

import assert from 'node:assert/strict';

export async function checkNoteLeadingBlank(page, body, openNote, saveAndReload) {
    const item = (text, extra = '', attrs = '') => `<li data-type="taskItem" ${attrs}><p>${text}</p>${extra}</li>`;
    const list = (...items) => `<ul data-type="taskList">${items.join('')}</ul>`;
    const nested = list(item('保留子项'));
    const tasks = first => list(item(first), item('1111'), item('<strong>222</strong>', '', 'data-checked="true" data-completed-at="2026-09-22T01:02:03.000Z"'),
        item('完成父项', nested, 'data-checked="true" data-completed-at="2026-09-22T02:03:04.000Z"'), item('保留甲'), item('保留乙'));
    const html = () => body.evaluate(root => root.editor.getHTML());
    const taskData = () => body.evaluate(root => {
        const result = [];
        root.editor.state.doc.descendants(node => {
            if (node.type.name === 'taskList') { result.push(node.toJSON()); return false; }
        });
        return result;
    });
    const seed = async (content, title) => { await openNote(content, title); await saveAndReload(); };
    const selectionSettled = () => page.waitForFunction(() => {
        const editor = document.querySelector('.ProseMirror').editor;
        const dom = window.getSelection();
        return dom?.anchorNode && editor.view.dom.contains(dom.anchorNode)
            && editor.state.selection.from === editor.view.posAtDOM(dom.anchorNode, dom.anchorOffset);
    });
    const focusStart = async locator => {
        await locator.click();
        await selectionSettled();
        await body.press('Home');
        await selectionSettled();
        await page.waitForFunction(() => {
            const editor = document.querySelector('.ProseMirror').editor;
            return editor.state.selection.empty && editor.state.selection.$from.parentOffset === 0;
        });
    };
    const topParagraphs = body.locator(':scope > p');
    const firstTask = body.locator(':scope > ul[data-type="taskList"] > li').first().locator(':scope > div > p').first();

    for (const first of ['', '第一项']) {
        for (const key of ['Backspace', 'Control+Backspace', 'Delete', 'Control+Delete']) {
            await seed('<p></p>' + tasks(first), `待办前空行 ${first || '空待办'} ${key}`);
            const before = await html();
            const beforeTasks = await taskData();
            await focusStart(key.includes('Backspace') ? firstTask : topParagraphs.first());
            await page.keyboard.press(key);
            assert.equal(await topParagraphs.count(), 0, `Deleting leading blank: ${first || 'empty'} ${key}`);
            assert.deepEqual(await taskData(), beforeTasks, 'Keep empty tasks, nested items, checked states, timestamps and rich text');
            assert.equal(await body.locator('li[data-type="taskItem"]').count(), 7);
            assert.equal(await body.locator('li[data-checked="true"]').count(), 2);
            assert.equal(await body.locator('li[data-type="taskItem"]').first().getAttribute('data-task-number'), '1');
            const after = await html();
            await page.getByRole('button', { name: '撤销', exact: true }).click();
            assert.equal(await html(), before, 'One undo restores the blank and complete task structure');
            await page.getByRole('button', { name: '重做', exact: true }).click();
            assert.equal(await html(), after);
            await saveAndReload();
            assert.equal(await html(), after, 'The leading blank must stay removed after saving and reopening');
        }
    }
    await page.screenshot({ path: 'ui-check.local/note-leading-blank-removed.png' });

    await seed('<p></p><p></p>' + tasks('第一项'), '逐行删除开头空行');
    for (const count of [1, 0]) {
        await focusStart(firstTask);
        await page.keyboard.press('Backspace');
        assert.equal(await topParagraphs.count(), count, 'Each Backspace removes only one adjacent blank paragraph');
    }

    // The same boundary inside a quote or a cell stays local to that container.
    for (const [prefix, suffix, selector] of [
        ['<blockquote>', '</blockquote>', ':scope > blockquote'],
        ['<table><tbody><tr><td>', '</td><td><p>邻格保留</p></td></tr></tbody></table>', 'td:first-child'],
    ]) {
        await seed('<p>范围外保留</p>' + prefix + '<p></p>' + tasks('范围内第一项') + suffix, '范围内待办空行');
        const container = body.locator(selector);
        const beforeTasks = await taskData();
        await focusStart(container.locator('li[data-type="taskItem"] > div > p').first());
        await page.keyboard.press('Backspace');
        assert.equal(await container.locator(':scope > p').count(), 0, `Container ${selector}: ${await html()}`);
        assert.deepEqual(await taskData(), beforeTasks);
        assert.equal(await body.getByText('范围外保留', { exact: true }).count(), 1);
        if (selector.startsWith('td')) assert.equal(await body.getByText('邻格保留', { exact: true }).count(), 1);
    }

    // An empty parent paragraph is required by the task schema and must not discard its children.
    await seed(list(item('', nested), item('另一个父项')), '空父项与子待办');
    const parent = body.locator(':scope > ul > li').first();
    const before = await html();
    await focusStart(parent.locator(':scope > div > p').first());
    await page.keyboard.press('Delete');
    assert.equal(await html(), before, 'Deleting at an empty parent must not consume the nested checklist');

    await seed('<p>前面有正文</p>' + tasks('第一项'), '保留非空正文');
    await focusStart(firstTask);
    await page.keyboard.press('Backspace');
    assert.equal(await body.getByText('前面有正文', { exact: true }).count(), 1, 'The shortcut never deletes nonempty preceding prose');
    assert.ok((await body.innerText()).includes('第一项'));
    console.log('Passed: leading blank deletion from both sides, empty/nonempty tasks, four shortcuts, nested metadata, undo/redo, reload and quote/cell boundaries');
}

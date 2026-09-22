import assert from 'node:assert/strict';

export async function checkNoteTaskListMerge(page, body, openNote, saveAndReload) {
    const seed = async (html, title) => {
        await openNote(html, title);
        await saveAndReload(); // Start with a fresh history, independent of fixture insertion.
    };
    const item = (text, extra = '', attrs = '') => `<li data-type="taskItem" ${attrs}><p>${text}</p>${extra}</li>`;
    const list = (...items) => `<ul data-type="taskList">${items.join('')}</ul>`;
    const topLists = body.locator(':scope > ul[data-type="taskList"]');
    const content = () => body.evaluate(root => root.editor.getHTML());
    const items = () => body.evaluate(root => {
        const result = [];
        root.editor.state.doc.forEach(node => { if (node.type.name === 'taskList') node.forEach(child => result.push(child.toJSON())); });
        return result;
    });
    const rowDistance = () => topLists.locator(':scope > li').evaluateAll(nodes => nodes[1].getBoundingClientRect().top - nodes[0].getBoundingClientRect().top);
    const first = item('上项');
    const second = item('下项');
    await seed(list(first, second), '连续待办基准');
    const baseline = await rowDistance();

    await seed(list(first) + '<p>中间说明</p>' + list(second), '删除待办间隔');
    await body.locator(':scope > p').click();
    await page.waitForFunction(() => {
        const editor = document.querySelector('.ProseMirror').editor;
        const dom = window.getSelection();
        return dom?.anchorNode && editor.view.dom.contains(dom.anchorNode)
            && editor.state.selection.from === editor.view.posAtDOM(dom.anchorNode, dom.anchorOffset);
    });
    await page.keyboard.press('Home');
    await page.waitForFunction(() => document.querySelector('.ProseMirror').editor.state.selection.$from.parentOffset === 0);
    await page.keyboard.press('Shift+End');
    await page.waitForFunction(() => {
        const { doc, selection } = document.querySelector('.ProseMirror').editor.state;
        return doc.textBetween(selection.from, selection.to) === '中间说明';
    });
    assert.equal(await body.evaluate(root => root.editor.state.doc.textBetween(root.editor.state.selection.from, root.editor.state.selection.to)), '中间说明');
    await page.keyboard.press('Backspace');
    assert.equal(await topLists.count(), 2, 'An intentional empty paragraph still separates lists');
    await page.keyboard.press('Backspace');
    assert.equal(await topLists.count(), 1, 'Deleting the separator must join adjacent task lists');
    assert.ok(Math.abs(await rowDistance() - baseline) < 1, 'Joined rows must have ordinary single-list spacing');
    assert.equal(await topLists.locator(':scope > li').count(), 2);
    const joined = await content();
    await page.getByRole('button', { name: '撤销', exact: true }).click();
    assert.equal(await topLists.count(), 2, 'Undo restores the separator and the two lists');
    await page.getByRole('button', { name: '重做', exact: true }).click();
    assert.equal(await content(), joined);
    await saveAndReload();
    assert.equal(await content(), joined);
    await page.screenshot({ path: 'ui-check.local/note-task-list-merged.png' });

    // A range deletion must preserve whole items, including descendants, marks and completion times.
    const nested = list(item('完成子项', '', 'data-checked="true" data-completed-at="2026-09-18T01:02:03.000Z"'), item('未完成子项'));
    const completed = item('<strong>完成父项</strong>', nested, 'data-checked="true" data-completed-at="2026-09-19T02:03:04.000Z"');
    await seed(list(completed) + '<p></p><p><em>删除整段说明</em></p>' + list(item('<em>后项</em>')), '选区删除多个间隔');
    const before = await content();
    const beforeItems = await items();
    await body.evaluate(root => {
        const doc = root.editor.state.doc;
        const from = doc.child(0).nodeSize;
        root.editor.commands.setTextSelection({ from, to: from + doc.child(1).nodeSize + doc.child(2).nodeSize });
    });
    await body.press('Delete');
    assert.equal(await topLists.count(), 1);
    assert.deepEqual(await items(), beforeItems);
    const after = await content();
    await page.getByRole('button', { name: '撤销', exact: true }).click();
    assert.equal(await content(), before, 'One undo restores the deleted blocks and list boundaries');
    await page.getByRole('button', { name: '重做', exact: true }).click();
    assert.equal(await content(), after);
    await saveAndReload();
    assert.equal(await content(), after, 'Joined structure and item metadata survive persistence');

    // Imported or pasted chains normalize too, at each depth, without crossing parents or other blocks.
    await openNote(list(item('父甲', list(item('子甲')) + list(item('子乙'))))
        + list(item('父乙', list(item('乙的子项')))) + list(item('父丙'))
        + '<p>保留说明</p>' + list(item('独立项'))
        + '<blockquote>' + list(item('引用甲')) + list(item('引用乙')) + '</blockquote>'
        + '<table><tbody><tr><td>' + list(item('单元格甲')) + '</td><td>' + list(item('单元格乙')) + '</td></tr></tbody></table>', '粘贴相邻待办');
    assert.equal(await topLists.count(), 2);
    assert.equal(await topLists.first().locator(':scope > li').count(), 3);
    assert.equal(await topLists.first().locator(':scope > li').first().locator('ul').count(), 1);
    assert.equal(await topLists.first().locator(':scope > li').first().locator('ul > li').count(), 2);
    assert.equal(await topLists.first().locator(':scope > li').nth(1).locator('ul > li').innerText(), '乙的子项');
    assert.equal(await body.locator(':scope > blockquote > ul').count(), 1);
    assert.equal(await body.locator('td > ul').count(), 2, 'Lists in different table cells remain independent');
    assert.equal(await body.getByText('保留说明', { exact: true }).count(), 1);
    await saveAndReload();
    assert.equal(await topLists.count(), 2);
    console.log('Passed: adjacent checklist merge after keyboard/range deletion, ordinary row spacing, undo/redo, nested chains, marks/timestamps, parent isolation and persistence');
}

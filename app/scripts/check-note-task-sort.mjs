import assert from 'node:assert/strict';

export async function checkNoteTaskSort(page, body, openNote, saveAndReload) {
    const task = (text, checked = false, children = '') => `<li data-type="taskItem" data-checked="${checked}"><p>${text}</p>${children}</li>`;
    const list = (...items) => `<ul data-type="taskList">${items.join('')}</ul>`;
    const childList = list(task('已完成子项', true), task('未完成子项'));
    const html = '<p>列表前的说明</p>' + list(
        task('<strong>已完成甲</strong>', true, childList), task('未完成乙'),
        task('已完成丙', true), task('<em>未完成丁</em>'))
        + '<p>列表之间的说明</p>' + list(task('第二组已完成', true), task('第二组未完成'));
    const noteId = await openNote(html, '待办排序回归');
    const menu = page.getByRole('combobox', { name: '待办排序', exact: true });
    const firstList = body.locator(':scope > ul[data-type="taskList"]').first();
    const names = list => list.locator(':scope > li > div > p').allTextContents();
    const focus = async text => {
        await body.getByText(text, { exact: true }).click();
        await page.waitForFunction(text => {
            const editor = document.querySelector('.ProseMirror').editor;
            return editor.state.selection.$from.parent.textContent === text;
        }, text);
    };
    const choose = async name => {
        await menu.click();
        await page.getByRole('option', { name, exact: true }).click();
    };
    const content = () => body.evaluate(root => root.editor.getHTML());
    const tasksBefore = await page.evaluate(() => JSON.parse(localStorage.getItem('project-todo-app')).state.tasks);
    await focus('列表前的说明');
    assert.equal(await menu.count(), 0, 'Sorting is contextual to checklists');
    const original = await content();
    await focus('已完成甲');
    const originalSelection = await body.evaluate(root => root.editor.state.selection.toJSON());
    await choose('未完成在前');
    assert.deepEqual(await names(firstList), ['未完成乙', '未完成丁', '已完成甲', '已完成丙']);
    assert.deepEqual(await names(firstList.locator('ul')), ['已完成子项', '未完成子项'], 'Parent sorting carries the complete child list without reordering it');
    assert.equal(await firstList.locator('strong').innerText(), '已完成甲');
    assert.equal(await firstList.locator('em').innerText(), '未完成丁');
    assert.deepEqual(await names(body.locator(':scope > ul').nth(1)), ['第二组已完成', '第二组未完成']);
    assert.deepEqual(await body.locator(':scope > p').allTextContents(), ['列表前的说明', '列表之间的说明']);
    assert.equal(await body.evaluate(root => root.editor.state.selection.$from.parent.textContent), '已完成甲', 'Caret follows the moved task');
    const sorted = await content();
    await menu.click();
    assert.equal(await page.getByRole('option', { name: '未完成在前', exact: true }).isDisabled(), true);
    await page.keyboard.press('Escape');
    assert.equal(await content(), sorted, 'Cancel and already-sorted checks must not modify the document');
    await page.getByRole('button', { name: '撤销', exact: true }).click();
    assert.equal(await content(), original, 'One undo restores the complete original list');
    assert.deepEqual(await body.evaluate(root => root.editor.state.selection.toJSON()), originalSelection);
    await page.getByRole('button', { name: '重做', exact: true }).click();
    assert.equal(await content(), sorted);

    // Sorting is a separate undo step even immediately after checking an item.
    await firstList.locator(':scope > li').first().locator(':scope > label input').check();
    await focus('未完成乙');
    await choose('未完成在前');
    assert.deepEqual(await names(firstList), ['未完成丁', '未完成乙', '已完成甲', '已完成丙']);
    await page.getByRole('button', { name: '撤销', exact: true }).click();
    assert.deepEqual(await names(firstList), ['未完成乙', '未完成丁', '已完成甲', '已完成丙']);
    assert.equal(await firstList.locator(':scope > li').first().getAttribute('data-checked'), 'true', 'Undo sort must not undo completion');
    await page.getByRole('button', { name: '撤销', exact: true }).click();
    assert.equal(await content(), sorted);

    // A child-list sort stays inside its parent; keyboard interaction uses the shared menu.
    await focus('未完成子项');
    await menu.focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    assert.deepEqual(await names(firstList.locator('ul')), ['未完成子项', '已完成子项']);
    assert.deepEqual(await names(firstList), ['未完成乙', '未完成丁', '已完成甲', '已完成丙']);
    await focus('已完成丙');
    await choose('已完成在前');
    assert.deepEqual(await names(firstList), ['已完成甲', '已完成丙', '未完成乙', '未完成丁']);
    const finalHTML = await content();
    await page.waitForFunction(({ noteId, finalHTML }) => JSON.parse(localStorage.getItem('project-todo-app'))
        .state.notes.find(note => note.id === noteId)?.content === finalHTML, { noteId, finalHTML });
    await saveAndReload();
    assert.equal(await content(), finalHTML, 'Sorted HTML must survive autosave, manual save and reload');
    const stored = await page.evaluate(noteId => JSON.parse(localStorage.getItem('project-todo-app')).state.notes.find(note => note.id === noteId), noteId);
    assert.equal(stored.date, '2026-09-06');
    assert.deepEqual(stored.tags, ['兼容测试']);
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('project-todo-app')).state.tasks), tasksBefore);
    await focus('已完成甲');
    await page.setViewportSize({ width: 1100, height: 698 });
    await menu.click();
    // The shared portal positions itself after the menu mounts and the viewport resizes.
    await page.waitForFunction(() => {
        const menu = document.querySelector('[role="listbox"][aria-label="待办排序"]');
        if (!menu) return false;
        const rect = menu.getBoundingClientRect();
        return rect.x >= 0 && rect.right <= innerWidth && rect.y >= 0 && rect.bottom <= innerHeight;
    });
    assert.ok(await body.evaluate(root => root.scrollWidth <= root.clientWidth + 1));
    await page.screenshot({ path: 'ui-check.local/note-task-sort-narrow.png' });
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 1280, height: 840 });
    await page.screenshot({ path: 'ui-check.local/note-task-sort.png' });

    await openNote(list(task('唯一待办')), '单项排序');
    await focus('唯一待办');
    await menu.click();
    for (const name of ['未完成在前', '已完成在前']) {
        assert.equal(await page.getByRole('option', { name, exact: true }).isDisabled(), true);
    }
    await page.keyboard.press('Escape');
    console.log('Passed: stable checklist sorting both ways, parent/child isolation, rich text, caret, separate undo, keyboard, persistence and narrow layout');
}

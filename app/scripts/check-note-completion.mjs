import assert from 'node:assert/strict';

export async function checkNoteCompletion(page, body, openNote, saveAndReload) {
    const firstTime = '2026-09-20T03:04:05.000Z';
    const secondTime = '2026-09-20T04:05:06.000Z';
    const oldTime = '2026-09-19T02:03:04.000Z';
    const task = (name, checked = false, children = '', time = '') => `<li data-type="taskItem" data-checked="${checked}"${time ? ` data-completed-at="${time}"` : ''}><p>${name}</p>${children}</li>`;
    const list = (...items) => `<ul data-type="taskList">${items.join('')}</ul>`;
    await openNote(list(task('父待办', false, list(
        task('子待办', false, list(task('孙待办'))),
        task('此前完成的子项', true, '', oldTime), task('旧完成项无时间', true))), task('独立待办')), '联动完成与时间');
    const items = body.locator('li[data-type="taskItem"]');
    const states = () => items.evaluateAll(nodes => nodes.map(node => [node.dataset.checked, node.getAttribute('data-completed-at')]));
    const checkbox = name => body.getByRole('checkbox', { name: new RegExp(`：${name}$`) });
    const content = () => body.evaluate(root => root.editor.getHTML());
    const original = await content();
    const originalCount = await page.locator('.note-editor-count').innerText();
    assert.equal(await body.locator('time').count(), 1, 'Do not invent timestamps for old completed notes');
    await page.clock.setFixedTime(new Date(firstTime));
    await checkbox('父待办').check();
    const completedStates = [['true', firstTime], ['true', firstTime], ['true', firstTime], ['true', oldTime], ['true', null], ['false', null]];
    assert.deepEqual(await states(), completedStates, 'Complete every descendant, retain old timestamps and leave siblings unchanged');
    assert.equal(await body.locator('time').count(), 4);
    const firstStamp = items.first().locator(':scope > div > p > time');
    assert.match(await firstStamp.innerText(), /^\d{2}:04$/);
    assert.match(await firstStamp.getAttribute('title'), /^完成于 2026-09-20 \d{2}:04:05$/);
    assert.equal(await firstStamp.getAttribute('aria-label'), await firstStamp.getAttribute('title'));
    assert.match(await items.nth(3).locator('time').innerText(), /^09-19 \d{2}:03$/);
    assert.ok(await firstStamp.evaluate(time => {
        const range = document.createRange();
        range.selectNode(time.previousSibling);
        const text = range.getBoundingClientRect();
        const stamp = time.getBoundingClientRect();
        return stamp.left >= text.right && stamp.top >= text.top - 1 && stamp.bottom <= text.bottom + 2;
    }), 'A short task and its timestamp must share one text line');
    assert.equal(await page.locator('.note-editor-count').innerText(), originalCount, 'Completion metadata must not count as note text');
    const completedHTML = await content();
    assert.doesNotMatch(completedHTML, /<time|完成于/, 'Displayed timestamps must not leak into editable text');
    await page.getByRole('button', { name: '撤销', exact: true }).click();
    assert.equal(await content(), original, 'One undo restores all states and timestamps');
    await page.clock.setFixedTime(new Date(secondTime));
    await page.getByRole('button', { name: '重做', exact: true }).click();
    assert.equal(await content(), completedHTML, 'Redo restores the original completion time, not now');
    await checkbox('父待办').uncheck();
    assert.deepEqual(await states(), [['false', null], ...completedStates.slice(1)], 'Reopening a parent affects only that item');
    // Keyboard toggling must use exactly the same completion path.
    await checkbox('子待办').focus();
    await page.keyboard.press('Space');
    assert.deepEqual((await states()).slice(0, 3), [['false', null], ['false', null], ['true', firstTime]]);
    await checkbox('父待办').check();
    assert.deepEqual((await states()).slice(0, 4), [['true', secondTime], ['true', secondTime], ['true', firstTime], ['true', oldTime]],
        'Only reopened tasks get a new time when completing the parent again');
    await body.locator('p').filter({ hasText: '父待办' }).click();
    await page.getByRole('combobox', { name: '待办排序', exact: true }).click();
    await page.getByRole('option', { name: '未完成在前', exact: true }).click();
    assert.deepEqual(await items.locator(':scope > div > p').evaluateAll(nodes => nodes.map(node => {
        const paragraph = node.cloneNode(true);
        paragraph.querySelectorAll('time').forEach(time => time.remove());
        return paragraph.textContent;
    })), ['独立待办', '父待办', '子待办', '孙待办', '此前完成的子项', '旧完成项无时间']);
    assert.equal(await items.nth(1).getAttribute('data-completed-at'), secondTime);
    assert.equal(await items.nth(3).getAttribute('data-completed-at'), firstTime);
    const saved = await content();
    await saveAndReload();
    assert.equal(await content(), saved, 'Completion metadata must survive save and reload');
    assert.equal(await body.locator('time').count(), 4);
    await page.screenshot({ path: 'ui-check.local/note-completion-times.png' });
    await page.setViewportSize({ width: 1100, height: 700 });
    assert.ok(await body.evaluate(root => root.scrollWidth <= root.clientWidth + 1), 'Timestamps must fit nested tasks on narrow desktops');
    await page.screenshot({ path: 'ui-check.local/note-completion-times-narrow.png' });
    await page.setViewportSize({ width: 1280, height: 840 });

    // A copied/exported note preserves metadata; an invalid date stays undisplayed.
    await openNote(saved, '完成时间 HTML 往返');
    assert.equal(await content(), saved);
    assert.equal(await body.locator('time').count(), 4);
    await openNote(list(task('无效时间', true, '', 'invalid')), '旧时间兼容');
    assert.equal(await body.locator('time').count(), 0);
    assert.equal(await items.first().getAttribute('data-completed-at'), null);
    await openNote(list(task('上一年完成', true, '', '2025-12-31T03:04:05.000Z'),
        task('<strong><em>强调文字</em></strong>', true, '', firstTime),
        task('长待办：' + '整理会议记录并核对附件。'.repeat(12), true, '', oldTime),
        task('', true, '', firstTime)), '紧凑完成时间');
    assert.match(await items.first().locator('time').innerText(), /^2025-12-31 \d{2}:04$/);
    assert.deepEqual(await items.nth(1).locator('time').evaluate(time => {
        const style = getComputedStyle(time);
        return [time.parentElement.tagName, style.display, style.fontStyle, style.fontWeight, style.textDecorationLine];
    }), ['P', 'inline-block', 'normal', '400', 'none'], 'Metadata must not inherit task emphasis or the completion strike');
    await page.setViewportSize({ width: 1100, height: 700 });
    assert.ok(await body.evaluate(root => root.scrollWidth <= root.clientWidth + 1), 'Long and empty tasks must not overflow');
    await page.screenshot({ path: 'ui-check.local/note-completion-inline-long.png' });
    const beforeDayChange = await content();
    await page.clock.setFixedTime(new Date('2026-09-21T04:05:06.000Z'));
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    assert.match(await items.nth(1).locator('time').innerText(), /^09-20 \d{2}:04$/, 'Returning the next day expands yesterday\'s time');
    assert.equal(await content(), beforeDayChange, 'Refreshing the date label must not change stored content');
    await page.setViewportSize({ width: 1280, height: 840 });
    await openNote(list(task('已完成行', true, '', firstTime)), '完成后继续编辑');
    await body.locator('p').filter({ hasText: '已完成行' }).click();
    await body.press('Control+End');
    await page.waitForFunction(() => {
        const { $from } = document.querySelector('.ProseMirror').editor.state.selection;
        return $from.parent.textContent === '已完成行' && $from.parentOffset === $from.parent.content.size;
    });
    await page.keyboard.insertText('补充');
    assert.equal(await body.evaluate(root => root.editor.state.selection.$from.parent.textContent), '已完成行补充');
    assert.equal(await items.first().locator('time').evaluate(time => time.previousSibling.textContent), '已完成行补充',
        'Typing at the end must append to task text before the timestamp');
    await body.press('Enter');
    assert.deepEqual(await states(), [['true', firstTime], ['false', null]], 'New items must inherit neither completion nor timestamps');
    await page.keyboard.insertText('新待办');
    assert.equal(await items.nth(1).locator('p').innerText(), '新待办');
    await saveAndReload();
    assert.deepEqual(await states(), [['true', firstTime], ['false', null]]);
    await page.clock.setFixedTime(new Date());
    console.log('Passed: cascading completion, persistent local timestamps, old-note compatibility, independent reopening, keyboard, undo/redo, sorting, HTML round-trip and split items');
}

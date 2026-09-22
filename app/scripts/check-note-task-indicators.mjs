import assert from 'node:assert/strict';

export async function checkNoteTaskIndicators(page, body, openNote, saveAndReload) {
    const task = (text, checked = false, children = '') => `<li data-type="taskItem" data-checked="${checked}"><p>${text}</p>${children}</li>`;
    const list = (...items) => `<ul data-type="taskList">${items.join('')}</ul>`;
    const sample = '<h2>工作清单</h2>' + list(
        task('完成版本验收', false, list(task('核对配置', true), task('验证数据备份'))),
        task('整理会议纪要'), task('发送评审资料', true), task('确认下次会议'),
        task('更新操作说明'), task('归档上周记录', true)) + '<p>备注：明天继续跟进验收结果。</p>';
    const items = body.locator('li[data-type="taskItem"]');
    const numbers = () => items.evaluateAll(nodes => nodes.map(node => node.dataset.taskNumber));
    const counts = async expected => {
        await page.waitForFunction(expected => Array.from(document.querySelectorAll('.note-task-counts > span'))
            .map(node => node.textContent.trim()).join('|') === expected.join('|'),
        [`总数 ${expected[0]}`, `已完成 ${expected[1]}`, `未完成 ${expected[2]}`]);
        assert.equal(await page.locator('.note-task-summary strong').innerText(), '待办事项');
    };
    const numberedText = () => items.evaluateAll(nodes => nodes.map(node => {
        const paragraph = node.querySelector(':scope > div > p').cloneNode(true);
        paragraph.querySelectorAll('time').forEach(time => time.remove());
        return `${node.dataset.taskNumber} ${paragraph.textContent}`;
    }));
    const focus = async text => {
        await body.locator('p').filter({ hasText: text }).click();
        await page.waitForFunction(text => {
            const editor = document.querySelector('.ProseMirror').editor;
            return editor.view.hasFocus() && editor.state.selection.$from.parent.textContent.includes(text);
        }, text);
    };
    const numbered = async expected => {
        await page.waitForFunction(expected => Array.from(document.querySelectorAll('.ProseMirror li[data-type="taskItem"]'))
            .map(node => node.dataset.taskNumber).join('|') === expected.join('|'), expected);
    };
    const content = () => body.evaluate(root => root.editor.getHTML());
    await openNote(sample, '今日工作记录');
    await counts([8, 3, 5]);
    const original = await content();
    const initial = await numberedText();
    assert.deepEqual(await numbers(), ['1', '1.1', '1.2', '2', '3', '4', '5', '6']);
    assert.ok(!original.includes('data-task-number'), 'Display numbers must not be serialized into note HTML');

    await focus('备注：');
    await page.getByRole('button', { name: '已完成在前', exact: true }).click();
    assert.deepEqual(await numberedText(), ['1 发送评审资料', '2 归档上周记录', '3 完成版本验收',
        '3.1 核对配置', '3.2 验证数据备份', '4 整理会议纪要', '5 确认下次会议', '6 更新操作说明']);
    await counts([8, 3, 5]);
    const sorted = await numberedText();
    await page.getByRole('button', { name: '撤销', exact: true }).click();
    assert.deepEqual(await numberedText(), initial, 'Undo restores both order and derived hierarchical numbers');
    await page.getByRole('button', { name: '重做', exact: true }).click();
    assert.deepEqual(await numberedText(), sorted);
    await focus('验证数据备份');
    await page.getByRole('button', { name: '未完成在前', exact: true }).click();
    assert.deepEqual((await numberedText()).slice(3, 5), ['3.1 验证数据备份', '3.2 核对配置']);
    await saveAndReload();
    assert.deepEqual((await numberedText()).slice(3, 5), ['3.1 验证数据备份', '3.2 核对配置']);
    await counts([8, 3, 5]);
    assert.ok(!/data-task-number|note-task-summary/.test(await content()), 'View-only indicators must stay out of saved HTML');
    await focus('备注：');
    await page.getByRole('button', { name: '未完成在前', exact: true }).click();
    assert.deepEqual(await numberedText(), ['1 完成版本验收', '1.1 验证数据备份', '1.2 核对配置',
        '2 整理会议纪要', '3 确认下次会议', '4 更新操作说明', '5 发送评审资料', '6 归档上周记录']);
    await items.first().locator(':scope > label input').check();
    await counts([8, 5, 3]);
    assert.equal((await numberedText())[0], '1 完成版本验收', 'Completion must not reorder the tasks');
    await items.first().locator(':scope > label input').uncheck();
    await counts([8, 4, 4]);
    await saveAndReload();
    await counts([8, 4, 4]);

    await openNote(list(task('层级甲'), task('层级乙'), task('层级丙')), '动态层级编号');
    await focus('层级乙');
    await page.keyboard.press('Tab');
    await numbered(['1', '1.1', '2']);
    await focus('层级丙');
    await page.keyboard.press('Tab');
    await numbered(['1', '1.1', '1.2']);
    await page.keyboard.press('Tab');
    await numbered(['1', '1.1', '1.1.1']);
    await page.keyboard.press('Shift+Tab');
    assert.deepEqual(await numbers(), ['1', '1.1', '1.2']);
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await counts([4, 0, 4]);
    assert.deepEqual(await numbers(), ['1', '1.1', '1.2', '1.3']);
    await page.keyboard.press('Backspace');
    await counts([3, 0, 3]);
    assert.deepEqual(await numbers(), ['1', '1.1', '1.2']);

    await openNote(list(task('段落前')) + '<p>说明文字</p>' + list(task('段落后'))
        + '<blockquote>' + list(task('引用内')) + '</blockquote>'
        + '<table><tr><td>' + list(task('单元格内')) + '</td></tr></table>', '编号范围');
    assert.deepEqual(await numbers(), ['1', '2', '1', '1']);
    await counts([4, 0, 4]);
    await openNote('<p>没有待办的普通随记</p>', '空统计');
    await counts([0, 0, 0]);
    assert.equal(await items.count(), 0);
    assert.equal(await page.locator('.note-task-progress > span').innerText(), '0/0');
    await openNote(list(...Array.from({ length: 100 }, (_, index) => task(`统计${index + 1}`, true))), '大量待办');
    await counts([100, 100, 0]);
    assert.equal((await numbers()).at(-1), '100');
    assert.equal(await page.locator('.note-task-progress > span').innerText(), '100%');

    await openNote(sample, '今日工作记录');
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'purple'));
    for (const width of [1536, 1186, 1100, 900]) {
        await page.setViewportSize({ width, height: 1024 });
        const layout = await page.locator('.note-editor').evaluate(editor => {
            const heading = editor.querySelector('.note-editor-heading').getBoundingClientRect();
            const title = editor.querySelector('.note-editor-title').getBoundingClientRect();
            const summary = editor.querySelector('.note-task-summary').getBoundingClientRect();
            const first = editor.querySelector('[data-task-number]');
            const label = first.querySelector(':scope > label').getBoundingClientRect();
            const number = getComputedStyle(first, '::before');
            return { overflow: editor.scrollWidth > editor.clientWidth + 1, height: heading.height,
                overlap: title.right > summary.left && title.top < summary.bottom && summary.top < title.bottom,
                numberGap: label.left - first.getBoundingClientRect().left - parseFloat(number.width),
                numberContent: number.content, summaryRight: summary.right, editorRight: editor.getBoundingClientRect().right };
        });
        assert.equal(layout.overflow, false, `No document overflow at ${width}`);
        assert.equal(layout.overlap, false, `Title and statistics must not overlap at ${width}`);
        assert.ok(layout.summaryRight <= layout.editorRight, 'Counts must fit inside the editor');
        assert.ok(layout.height <= (width >= 1100 ? 48 : 85), 'Heading stays compact at desktop widths');
        assert.equal(layout.numberContent, '"1"', 'Visible ordinal must be rendered from the current number');
        assert.ok(layout.numberGap >= 3 && layout.numberGap <= 5, 'Ordinal is only 4px from its checkbox');
        await page.screenshot({ path: `ui-check.local/note-task-indicators-${width}.png` });
    }
    await page.setViewportSize({ width: 1280, height: 840 });
    console.log('Passed: task counts, live ordinal renumbering, parent/child sorting, undo/redo, add/delete/indent, reload, empty/100-item states and compact desktop layout');
}

import assert from 'node:assert/strict';

// Run the same user actions against the browser and the isolated native WebView.
export async function checkNoteNavigation(page) {
    await page.clock.setFixedTime(new Date('2026-09-05T04:00:00Z'));
    const body = page.getByRole('textbox', { name: '随记正文', exact: true });
    const title = page.getByRole('textbox', { name: '随记标题', exact: true });
    const search = page.getByPlaceholder('搜索随记...（支持标题和内容）');
    const clear = page.getByRole('button', { name: '清除筛选', exact: true });
    const summary = page.getByLabel('随记筛选条件', { exact: true });
    const state = () => page.evaluate(() => JSON.parse(localStorage.getItem('project-todo-app')).state);
    const row = id => page.locator(`[data-node-id="note-${id}"]`);
    const save = () => page.getByRole('button', { name: '保存', exact: true }).click();
    if (await clear.isVisible()) await clear.click();

    await page.getByRole('button', { name: '新增当日随记', exact: true }).click();
    await title.fill('导航今日');
    await body.evaluate(root => root.editor.commands.setContent('<p><strong>VISIBLEKEY</strong></p><p>第二段</p><p>&amp;实体字符</p>'));
    await save();
    const todayId = (await state()).selectedNoteId;
    await page.getByTitle('上个月', { exact: true }).click();
    await page.getByRole('button', { name: '2026-08-31', exact: true }).click();
    await page.getByRole('button', { name: '2026-08-31 新建随记', exact: true }).click();
    await title.fill('导航历史');
    await body.fill('历史正文');
    await save();
    const pastId = (await state()).selectedNoteId;
    assert.equal(await clear.count(), 0, 'Creating notes must not add a date filter');
    assert.equal(await row(todayId).count(), 1, 'Creating a past note must leave today visible');
    assert.equal(await row(pastId).count(), 1);

    await page.getByTitle('下个月', { exact: true }).click();
    await page.getByRole('button', { name: '2026-09-05', exact: true }).click();
    assert.equal(await title.inputValue(), '导航今日', 'Calendar selection locates an existing note');
    assert.equal(await row(pastId).count(), 1, 'Calendar navigation must not hide other dates');
    await page.locator('[data-node-id="month-2026-08"]').click();
    await page.getByTitle('上一篇', { exact: true }).click();
    assert.equal(await title.inputValue(), '导航历史');
    assert.equal(await row(pastId).isVisible(), true, 'Previous/next must reveal notes in collapsed months');
    assert.equal(await page.getByRole('button', { name: '2026-08-31', exact: true }).getAttribute('aria-pressed'), 'true');
    await page.getByTitle('下一篇', { exact: true }).click();
    assert.equal(await title.inputValue(), '导航今日');

    await row(pastId).click({ button: 'right' });
    await page.locator('.context-menu').getByRole('button', { name: '标签设置', exact: true }).click();
    await page.locator('.note-tag-popup').getByText('工作', { exact: true }).click();
    await page.locator('.note-tag-popup').getByRole('textbox').press('Escape');
    if (!await page.locator('.notes-tags-list').isVisible()) await page.locator('.notes-tags-header').click();
    const workTag = page.locator('.notes-tag-item').filter({ hasText: '工作' });
    await workTag.click();
    assert.equal(await row(pastId).count(), 1);
    assert.equal(await row(todayId).count(), 0);
    await page.locator('.notes-tags-header').click();
    assert.match(await summary.innerText(), /标签：工作/, 'The active tag must remain visible when tags are collapsed');
    await search.fill(' VISIBLEKEY ');
    assert.equal(await row(todayId).count(), 0, 'Search and tag filters intersect');
    assert.match(await page.locator('.notes-filter-empty').innerText(), /没有符合条件/);
    await clear.click();
    assert.equal(await search.inputValue(), '');
    assert.equal((await state()).activeNoteTagId, 'all');
    await search.fill(' visiblekey ');
    assert.equal(await row(todayId).count(), 1, 'Search trims spaces and ignores case');
    await search.fill('strong');
    assert.equal(await row(todayId).count(), 0, 'Search must not match HTML markup');
    await search.fill('&实体字符');
    assert.equal(await row(todayId).count(), 1, 'Search matches decoded visible text');

    await page.getByRole('button', { name: '新增当日随记', exact: true }).click();
    const newId = (await state()).selectedNoteId;
    assert.equal(await clear.count(), 0);
    assert.equal(await row(todayId).count(), 1);
    assert.equal(await row(pastId).count(), 1);
    assert.equal(await row(newId).count(), 1, 'New notes are visible and all explicit filters are cleared');
    await page.locator('.notes-tags-header').click();
    await workTag.click();
    await workTag.click();
    assert.equal(await clear.count(), 0, 'Clicking the active tag again cancels the filter');
    await workTag.click();
    await page.getByTitle('在列表中定位当前笔记', { exact: true }).click();
    assert.equal(await clear.count(), 0, 'Locate removes filters that hide the current note');
    assert.equal(await row(newId).count(), 1);
    assert.equal(await row(pastId).count(), 1);

    // Search reveals matches even when their month has been collapsed.
    await page.locator('[data-node-id="month-2026-08"]').click();
    assert.equal(await row(pastId).count(), 0);
    await search.fill('导航历史');
    assert.equal(await row(pastId).count(), 1);
    await clear.click();
    await row(pastId).click({ button: 'right' });
    await page.locator('.context-menu').getByRole('button', { name: '删除', exact: true }).click();
    await page.getByRole('button', { name: '确认删除', exact: true }).click();
    const deleted = await state();
    const work = deleted.tags.find(tag => tag.name === '工作');
    assert.equal(work.count, deleted.notes.filter(note => !note.deletedAt && note.tags?.includes('工作')).length);
    await save();
    await page.reload();
    await body.waitFor();
    assert.equal(await clear.count(), 0, 'A stored creation date must not become a filter after restart');
    assert.equal(await row(todayId).count(), 1);
    assert.equal(await row(newId).count(), 1);
    await page.screenshot({ path: 'ui-check.local/note-navigation.png' });
    console.log('Passed: calendar navigation, all-date creation/reload, visible tag/search intersection, text search, clear/toggle, locate, collapsed results and active tag counts');
}

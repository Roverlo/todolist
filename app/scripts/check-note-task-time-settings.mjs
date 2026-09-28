import assert from 'node:assert/strict';
import { mkdir, readFile, rename, rmdir } from 'node:fs/promises';
import { checkNotesCommandBar } from './check-notes-command-bar.mjs';

export async function checkNoteTaskTimeSettings(page, body, openNote, saveAndReload, dataPath) {
    const fixture = '<ul data-type="taskList"><li data-type="taskItem" data-checked="true" data-created-at="2026-09-28T01:30:00Z" data-completed-at="2026-09-28T03:20:00Z"><p>完成接口联调</p></li><li data-type="taskItem" data-checked="false" data-created-at="2026-09-28T02:00:00Z"><p>整理验收资料</p></li><li data-type="taskItem" data-checked="true"><p>旧任务没有时间</p></li></ul>';
    await openNote(fixture, '待办时间设置');
    await saveAndReload();
    const html = () => body.evaluate(root => root.editor.getHTML());
    const before = await html();
    const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('project-todo-app')).state);
    const beforeNotes = (await stored()).notes;
    const creation = body.locator('.note-task-created-at').first();
    const completion = body.locator('.note-task-completed-at').first();
    const separator = () => completion.evaluate(el => getComputedStyle(el, '::before').content);
    const color = locator => locator.evaluate(el => getComputedStyle(el).color);
    const trigger = page.getByRole('button', { name: '待办时间设置', exact: true });
    const dialog = page.getByRole('dialog', { name: '待办时间设置', exact: true });
    const apply = async () => { await dialog.getByRole('button', { name: '应用', exact: true }).click(); await dialog.waitFor({ state: 'hidden' }); };
    assert.equal(await creation.isVisible(), true);
    assert.equal(await completion.isVisible(), true);
    assert.equal(await separator(), '"/"');
    assert.equal(await body.locator('li').last().locator('time').count(), 0, 'Legacy dates are not invented');
    await trigger.press('Enter');
    await dialog.getByRole('checkbox', { name: '显示创建时间' }).uncheck();
    await page.keyboard.press('Escape');
    assert.equal(await trigger.evaluate(el => el === document.activeElement), true);
    assert.equal(await creation.isVisible(), true, 'Closing before applying leaves saved settings unchanged');
    await trigger.click();
    await dialog.getByLabel('创建时间颜色').fill('#2563eb');
    await dialog.getByLabel('完成时间颜色').fill('#15803d');
    await apply();
    assert.equal(await color(creation), 'rgb(37, 99, 235)');
    assert.equal(await color(completion), 'rgb(21, 128, 61)', 'Completed-row gray does not override the chosen color');
    assert.equal(await html(), before);
    assert.deepEqual((await stored()).notes, beforeNotes, 'Display changes must not mark notes as edited or affect report scope');
    await saveAndReload();
    assert.equal(await color(creation), 'rgb(37, 99, 235)');
    for (const [showCreated, showCompleted] of [[false, true], [true, false], [false, false], [true, true]]) {
        await trigger.click();
        await dialog.getByRole('checkbox', { name: '显示创建时间' }).setChecked(showCreated);
        await dialog.getByRole('checkbox', { name: '显示完成时间' }).setChecked(showCompleted);
        await apply();
        assert.equal(await creation.isVisible(), showCreated);
        assert.equal(await completion.isVisible(), showCompleted);
        assert.equal(await separator(), showCreated ? '"/"' : 'none', 'No dangling separator when creation is hidden');
        assert.equal(await html(), before, 'Visibility never removes timestamps from saved HTML');
    }
    // New actions continue recording when both kinds of time are hidden.
    await trigger.click();
    await dialog.getByRole('checkbox', { name: '显示创建时间' }).uncheck();
    await dialog.getByRole('checkbox', { name: '显示完成时间' }).uncheck();
    await apply();
    await body.getByRole('checkbox', { name: /：整理验收资料$/ }).check();
    const recorded = await body.locator('li').nth(1).getAttribute('data-completed-at');
    assert.ok(recorded && Number.isFinite(Date.parse(recorded)));
    assert.equal(await body.locator('.note-task-completed-at:visible').count(), 0);
    await saveAndReload();
    assert.equal(await creation.isVisible(), false);
    await trigger.click();
    await dialog.getByRole('button', { name: '恢复默认' }).click();
    await apply();
    assert.equal(await body.locator('li').nth(1).getAttribute('data-completed-at'), recorded);
    assert.equal(await body.locator('.note-task-completed-at:visible').count(), 2);
    assert.equal(await color(creation), 'rgb(107, 114, 128)');
    await saveAndReload();

    // Exercise a real write failure in isolated storage, keep the draft, then retry.
    await trigger.click();
    await dialog.getByLabel('创建时间颜色').fill('#7c3aed');
    const backup = dataPath && dataPath + '.time-settings-check';
    if (dataPath) {
        assert.ok(process.env.PROJECTTODO_TEST_DATA_DIR && dataPath.startsWith(process.env.PROJECTTODO_TEST_DATA_DIR));
        await rename(dataPath, backup); await mkdir(dataPath);
    } else await page.evaluate(() => {
        const original = Storage.prototype.setItem;
        window.__restoreTimeStorage = () => { Storage.prototype.setItem = original; };
        Storage.prototype.setItem = function (key, value) { if (key === 'project-todo-app') throw new Error('isolated quota failure'); return original.call(this, key, value); };
    });
    try {
        await dialog.getByRole('button', { name: '应用', exact: true }).click();
        await dialog.getByRole('alert').waitFor();
        assert.equal(await dialog.getByLabel('创建时间颜色').inputValue(), '#7c3aed');
    } finally {
        if (dataPath) { await rmdir(dataPath); await rename(backup, dataPath); }
        else await page.evaluate(() => { window.__restoreTimeStorage(); delete window.__restoreTimeStorage; });
    }
    await apply();
    await saveAndReload();
    assert.equal(await color(creation), 'rgb(124, 58, 237)');
    if (dataPath) assert.equal(JSON.parse(await readFile(dataPath, 'utf8')).state.settings.noteTaskTime.createdColor, '#7c3aed');
    await openNote(fixture, '待办时间显示示例');
    assert.equal(await color(creation), 'rgb(124, 58, 237)');
    for (const width of [1100, 1186, 1280, 1538, 1920]) {
        await page.setViewportSize({ width, height: 840 });
        await checkNotesCommandBar(page, width);
        await trigger.click();
        const bounds = await dialog.boundingBox();
        const rootBounds = await page.locator('.notes-main-root').boundingBox();
        assert.ok(bounds.x >= rootBounds.x && bounds.x + bounds.width <= rootBounds.x + rootBounds.width && bounds.y + bounds.height <= 840,
            'Popover must fit the clipping application surface, not just the viewport');
        assert.ok(await body.evaluate(root => root.scrollWidth <= root.clientWidth + 1));
        if (width === 1538) await page.screenshot({ path: 'ui-check.local/task-time-settings.png' });
        await page.keyboard.press('Escape');
        if (width === 1538) await page.screenshot({ path: 'ui-check.local/task-time-both.png' });
    }
    await trigger.click(); await dialog.getByRole('button', { name: '恢复默认' }).click(); await apply();
    await page.setViewportSize({ width: 1280, height: 840 });
    console.log('Passed: both task times, separate visibility/colors, defaults, keyboard, unchanged note HTML/date, hidden recording, reload, write failure/retry and five-width layout');
}

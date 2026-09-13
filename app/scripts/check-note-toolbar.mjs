import assert from 'node:assert/strict';

export async function checkNoteToolbar(page, body) {
    const toolbar = page.getByRole('toolbar', { name: '随记编辑工具' });
    const button = name => toolbar.getByRole('button', { name, exact: true });
    const tooltip = page.getByRole('tooltip');
    assert.equal(await toolbar.locator('[title]').count(), 0, 'Toolbar must not mix native title popups with shared tooltips');
    for (const name of ['撤销', '重做', '清除格式', '插入日期', '分隔线', 'AI 设置']) {
        assert.equal(await button(name).getAttribute('aria-pressed'), null, `${name} is an action, not a toggle`);
    }
    const icons = await toolbar.locator('.editor-tool-button:not(.editor-color-menu) > svg').evaluateAll(elements => elements.map(el => ({
        width: getComputedStyle(el).width, height: getComputedStyle(el).height, stroke: getComputedStyle(el).strokeWidth,
    })));
    assert.ok(icons.length >= 25 && icons.every(icon => icon.width === '18px' && icon.height === '18px' && icon.stroke === '1.75px'),
        `Toolbar icons must share size and stroke: ${JSON.stringify(icons)}`);
    let tooltipStyle;
    for (const control of [button('加粗'), button('插入日期'), toolbar.getByRole('combobox', { name: '正文字体' }), button('AI 设置'), button('重做')]) {
        await control.locator('..').hover();
        await tooltip.waitFor();
        assert.equal(await tooltip.count(), 1, 'Only one tooltip should be visible');
        assert.equal(await control.getAttribute('aria-describedby'), await tooltip.getAttribute('id'));
        const style = await tooltip.evaluate(el => {
            const css = getComputedStyle(el), rect = el.getBoundingClientRect();
            return { background: css.backgroundColor, radius: css.borderRadius, fontSize: css.fontSize, width: rect.width };
        });
        if (tooltipStyle) assert.deepEqual(style, tooltipStyle, 'Every control must use the same tooltip presentation');
        tooltipStyle = style;
        await tooltip.hover();
        await page.waitForTimeout(180);
        assert.equal(await tooltip.isVisible(), true, 'Tooltips must remain readable when the pointer enters them');
        await page.keyboard.press('Escape');
        await tooltip.waitFor({ state: 'hidden' });
    }
    await button('插入日期').hover();
    await tooltip.waitFor();
    await page.screenshot({ path: 'ui-check.local/toolbar-unified-tooltip.png' });
    await page.mouse.move(5, 5);
    await tooltip.waitFor({ state: 'hidden' });

    await body.press('Alt+F10');
    assert.equal(await toolbar.getByRole('combobox', { name: '段落标题' }).evaluate(el => el === document.activeElement), true);
    await page.keyboard.press('ArrowRight');
    assert.equal(await toolbar.getByRole('combobox', { name: '正文字体' }).evaluate(el => el === document.activeElement), true);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === '随记正文');
    await body.press('Control+f');
    await page.locator('.editor-search').waitFor();
    await page.keyboard.press('Escape');
    await page.locator('.editor-search').waitFor({ state: 'hidden' });
    await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === '随记正文');

    await body.fill('工具栏格式验证');
    await body.press('Control+a');
    await button('加粗').click();
    assert.equal(await body.locator('strong').innerText(), '工具栏格式验证');
    assert.equal(await button('加粗').getAttribute('aria-pressed'), 'true');
    assert.equal(await button('撤销').isEnabled(), true);
    await button('撤销').click();
    assert.equal(await body.locator('strong').count(), 0);
    assert.equal(await button('重做').isEnabled(), true);
    await button('重做').click();
    assert.equal(await body.locator('strong').innerText(), '工具栏格式验证');
    await body.press('Control+End');
    await body.press('Enter');

    await button('插入表格').press('ArrowDown');
    const picker = page.getByRole('dialog', { name: '选择表格大小' });
    await picker.waitFor();
    assert.equal(await picker.locator('[data-table-grid-cell]').count(), 100, 'Keep the full 10 × 10 table range');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowDown');
    assert.equal(await picker.getByRole('status').innerText(), '4 行 × 4 列');
    await page.screenshot({ path: 'ui-check.local/toolbar-table-picker.png' });
    await page.keyboard.press('Enter');
    await picker.waitFor({ state: 'hidden' });
    assert.equal(await body.locator('tr').count(), 4);
    assert.equal(await body.locator('th').count(), 4, 'Mouse and keyboard insertions should use the same header default');
    await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === '随记正文');
    await page.keyboard.insertText('表头输入');
    assert.equal(await body.locator('th').first().innerText(), '表头输入');
    await toolbar.getByRole('combobox', { name: '表格操作' }).click();
    await page.getByRole('option', { name: '删除表格', exact: true }).click();
    await button('插入表格').click();
    await picker.getByRole('checkbox', { name: '首行作为表头' }).uncheck();
    await picker.getByRole('button', { name: '1 行 2 列', exact: true }).click();
    assert.equal(await body.locator('td').count(), 2);
    assert.equal(await body.locator('th').count(), 0);
    await toolbar.getByRole('combobox', { name: '表格操作' }).click();
    await page.getByRole('option', { name: '删除表格', exact: true }).click();
    await button('插入表格').click();
    await page.keyboard.press('Escape');
    await picker.waitFor({ state: 'hidden' });
    assert.equal(await button('插入表格').evaluate(el => el === document.activeElement), true, 'Cancel returns focus to the table trigger');
    assert.equal(await body.locator('table').count(), 0, 'Cancel must not insert a table');
    console.log('Passed: shared icons/tooltips, action and toggle semantics, keyboard toolbar/search, format undo/redo, 10 × 10 table picker, header options and focus restoration');
}

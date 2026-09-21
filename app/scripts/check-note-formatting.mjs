import assert from 'node:assert/strict';

export async function checkNoteFormatting(page, body, saveAndReload) {
    const clear = page.getByRole('button', { name: '清除格式', exact: true });
    const html = () => body.evaluate(root => root.editor.getHTML());
    const seed = async content => {
        await body.evaluate((root, content) => root.editor.commands.setContent(content), content);
        await saveAndReload();
    };
    const selectAll = () => body.press('Control+a');
    const paste = async content => {
        await body.click();
        await body.evaluate((root, content) => {
            const transfer = new DataTransfer();
            transfer.setData('text/html', content);
            transfer.setData('text/plain', '网页甲\n网页乙\n文档丙\n文档丁');
            root.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }));
        }, content);
    };
    const appearance = () => body.locator('p').evaluateAll(nodes => nodes.filter(node => node.textContent).map(node => {
        const style = getComputedStyle(node);
        const range = document.createRange();
        range.selectNodeContents(node);
        const rect = range.getBoundingClientRect();
        return { text: node.textContent, top: rect.top, height: rect.height, size: style.fontSize, lineHeight: style.lineHeight,
            marginTop: style.marginTop, marginBottom: style.marginBottom };
    }));

    await seed('<p></p>');
    await paste('<p><span style="font-family: SimSun; font-size: 32px; line-height: 3; color: red">网页甲<br>网页乙</span></p>'
        + '<p style="text-align:center"><span style="font-family: Arial; font-size: 10pt; line-height: 16pt">文档丙</span></p>'
        + '<h2><strong>文档丁</strong></h2>');
    assert.equal(await body.locator('br:not(.ProseMirror-trailingBreak)').count(), 1, 'Ordinary paste retains source formatting until explicitly cleared');
    const pasted = await html();
    await selectAll();
    await clear.click();
    assert.deepEqual(await body.locator(':scope > p').allTextContents(), ['网页甲', '网页乙', '文档丙', '文档丁'],
        'Clearing mixed pasted text must give soft breaks and paragraphs the same spacing');
    assert.equal(await body.locator('span[style], strong, h2, br:not(.ProseMirror-trailingBreak)').count(), 0);
    const styles = await appearance();
    assert.equal(new Set(styles.map(({ top, text, height, ...style }) => JSON.stringify(style))).size, 1,
        `Cleared lines have identical font, line height and paragraph spacing: ${JSON.stringify(styles)}`);
    // Native WebView can round range bounds differently at fractional Windows display scales.
    const heights = styles.map(line => line.height);
    assert.ok(Math.max(...heights) - Math.min(...heights) < 0.1, `Actual text heights differ: ${heights}`);
    const gaps = styles.slice(1).map((line, index) => line.top - styles[index].top);
    assert.ok(Math.max(...gaps) - Math.min(...gaps) < 1, `Actual line spacing differs: ${gaps}`);
    const normalized = await html();
    await page.getByRole('button', { name: '撤销', exact: true }).click();
    assert.equal(await html(), pasted, 'One undo restores all original styles and line breaks without undoing the paste');
    await page.getByRole('button', { name: '重做', exact: true }).click();
    assert.equal(await html(), normalized);
    await saveAndReload();
    assert.equal(await html(), normalized);
    await selectAll();
    await clear.click();
    assert.equal(await html(), normalized, 'Clearing again must not add blank lines');
    await body.press('Control+End');
    await page.keyboard.insertText('继续输入');
    assert.equal(await body.locator('span[style]').count(), 0, 'Typing after clearing must not inherit the pasted font');
    await page.screenshot({ path: 'ui-check.local/note-formatting-cleared.png' });

    // A selected fragment must not reset text outside the selection.
    await seed('<p><strong>保留前</strong><span style="font-size: 32px; line-height: 3">选择甲<br>选择乙</span><em>保留后</em></p>');
    await body.evaluate(root => root.editor.commands.setTextSelection({ from: 4, to: 11 }));
    await clear.click();
    assert.equal(await body.locator('strong').innerText(), '保留前');
    assert.equal(await body.locator('em').innerText(), '保留后');
    assert.equal(await body.locator('span[style]').count(), 0);
    assert.deepEqual(await body.locator('p').allTextContents(), ['保留前选择甲', '选择乙保留后']);

    // Code newlines normalize too; explicit blank lines remain, without dropping text.
    await seed('<pre><code>代码甲\n\n代码乙</code></pre><p>正文</p>');
    await selectAll();
    await clear.click();
    assert.deepEqual(await body.locator('p').allTextContents(), ['代码甲', '', '代码乙', '正文']);
    assert.equal(await body.locator('pre, code').count(), 0);

    // Clearing a table selection must keep its cells and outside text intact.
    await seed('<table><tbody><tr><td><p><span style="font-size:32px">单元甲<br>单元乙</span></p></td>'
        + '<td><p><span style="font-size:12px">另一个单元</span></p></td></tr></tbody></table><p>表外保留</p>');
    await body.evaluate(root => {
        const cells = [];
        root.editor.state.doc.descendants((node, pos) => { if (node.type.name === 'tableCell') cells.push(pos); });
        root.editor.commands.setCellSelection({ anchorCell: cells[0], headCell: cells[1] });
    });
    await clear.click();
    assert.equal(await body.locator('td').count(), 2);
    assert.deepEqual(await body.locator('td').first().locator('p').allTextContents(), ['单元甲', '单元乙']);
    assert.equal(await body.locator('td').nth(1).innerText(), '另一个单元');
    assert.equal(await body.locator(':scope > p').first().innerText(), '表外保留');
    await saveAndReload();
    assert.equal(await body.locator('td').count(), 2);
    await seed('<p><span style="font-size:32px;line-height:3">原文保留</span></p>');
    await body.press('Control+End');
    await clear.click();
    await page.keyboard.insertText('默认新增');
    assert.equal(await body.locator('span[style]').innerText(), '原文保留', 'With no selection, only following input loses its text styling');
    assert.equal(await body.locator('p').innerText(), '原文保留默认新增');
    await saveAndReload();
    console.log('Passed: pasted fonts/line heights, soft breaks versus paragraphs, computed spacing, partial/table selections, code blank lines, undo/redo, repeat clear, typing and persistence');
}

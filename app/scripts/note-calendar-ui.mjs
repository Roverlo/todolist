import assert from 'node:assert/strict';

export async function selectNoteCalendarDate(page, date) {
    assert.match(date, /^\d{4}-\d{2}-\d{2}$/);
    const [targetYear, targetMonth] = date.split('-').map(Number);
    const title = page.locator('.notes-calendar-title');
    while (true) {
        const before = await title.innerText();
        const match = /^(\d{4})年(\d{1,2})月$/.exec(before);
        assert.ok(match, `Unexpected calendar title: ${before}`);
        const year = Number(match[1]), month = Number(match[2]);
        if (year === targetYear && month === targetMonth) break;
        const action = year !== targetYear
            ? (year < targetYear ? '下一年' : '上一年')
            : (month < targetMonth ? '下个月' : '上个月');
        await page.getByTitle(action, { exact: true }).click();
        await page.waitForFunction(before => document.querySelector('.notes-calendar-title')?.textContent !== before, before);
    }
    await page.getByRole('button', { name: date, exact: true }).click();
}

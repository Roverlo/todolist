import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const server = await createServer({ logLevel: 'error', server: { host: '127.0.0.1', port: 0 } });
let browser;
try {
    await server.listen();
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, timezoneId: 'Asia/Shanghai' });
    page.setDefaultTimeout(15000);
    await page.clock.setFixedTime(new Date('2026-09-08T10:00:00+08:00'));
    await page.goto(server.resolvedUrls.local[0], { waitUntil: 'commit' });
    await page.getByRole('button', { name: '设置', exact: true }).waitFor({ timeout: 90000 });
    const reminder = page.getByRole('button', { name: '我知道了' });
    if (await reminder.isVisible()) await reminder.click();
    await page.getByRole('button', { name: '新建任务', exact: true }).click();
    await page.getByText('周期任务', { exact: true }).click();
    await page.getByPlaceholder('例如：周例会检查清单').fill('周日续期验收');
    await page.getByRole('combobox').filter({ hasText: '周一' }).click();
    await page.getByRole('option', { name: '周日', exact: true }).click();
    await page.getByRole('button', { name: '生成周期任务', exact: true }).click();
    const results = await page.evaluate(async () => {
        const { useAppStore: store } = await import('/src/state/appStore.ts');
        const { upcomingRecurringDate, recurringPeriodStart, nextRecurringTask } = await import('/src/utils/recurring.ts');
        const dayjs = (await import('/node_modules/.vite/deps/dayjs.js')).default;
        const task = store.getState().tasks.find(t => t.title === '周日续期验收');
        const template = store.getState().recurringTemplates.find(t => t.id === task.extras.recurrenceId);
        const first = { date: task.dueDate, period: task.extras.periodKey, active: template.active };
        store.getState().updateTask(task.id, { status: 'done' });
        let related = store.getState().tasks.filter(t => t.extras?.recurrenceId === template.id);
        const next = related.find(t => t.id !== task.id);
        const nextResult = { date: next?.dueDate, period: next?.extras.periodKey, visible: next?.extras.visibleFrom, status: next?.status };
        store.getState().updateTask(task.id, { status: 'done' });
        store.getState().updateTask(task.id, { status: 'doing' });
        store.getState().updateTask(task.id, { status: 'done' });
        const deduplicated = store.getState().tasks.filter(t => t.extras?.recurrenceId === template.id).length;
        store.getState().updateRecurringTemplate(template.id, { active: false });
        store.getState().updateTask(next.id, { status: 'done' });
        const paused = store.getState().tasks.filter(t => t.extras?.recurrenceId === template.id).length;
        store.getState().updateRecurringTemplate(template.id, { active: true });
        store.getState().updateTask(next.id, { status: 'doing' });
        store.getState().bulkUpdateTasks([next.id], { status: 'done' });
        related = store.getState().tasks.filter(t => t.extras?.recurrenceId === template.id);
        const bulk = related.find(t => t.id !== task.id && t.id !== next.id)?.dueDate;
        const dates = [
            [{type:'weekly',daysOfWeek:[1]}, '2026-09-08'],
            [{type:'monthly',dayOfMonth:31}, '2026-02-01'],
            [{type:'monthly',dayOfMonth:31}, '2028-02-01'],
            [{type:'monthly',dayOfMonth:1}, '2026-12-02'],
            [{type:'daily'}, '2026-09-08'],
        ].map(([schedule, from]) => {
            const date = upcomingRecurringDate(schedule, dayjs(from));
            return [date.format('YYYY-MM-DD'), recurringPeriodStart(date, schedule.type).format(schedule.type === 'monthly' ? 'YYYY-MM' : 'YYYY-MM-DD')];
        });
        const renewalDates = [
            [{type:'daily'}, '2026-12-31'],
            [{type:'monthly',dayOfMonth:31}, '2026-01-31'],
            [{type:'monthly',dayOfMonth:31}, '2028-01-31'],
        ].map(([schedule, date]) => nextRecurringTask({...task,dueDate:date}, [{...template,schedule}], [], dayjs(date))?.dueDate);
        return { first, nextResult, deduplicated, paused, bulk, dates, renewalDates };
    });
    assert.deepEqual(results.first, { date:'2026-09-13', period:'2026-09-07', active:true });
    assert.deepEqual(results.nextResult, { date:'2026-09-20', period:'2026-09-14', visible:'2026-09-14', status:'doing' });
    assert.equal(results.deduplicated, 2);
    assert.equal(results.paused, 2);
    assert.equal(results.bulk, '2026-09-27');
    assert.deepEqual(results.dates, [['2026-09-14','2026-09-14'],['2026-02-28','2026-02'],['2028-02-29','2028-02'],['2027-01-01','2027-01'],['2026-09-08','2026-09-08']]);
    assert.deepEqual(results.renewalDates, ['2027-01-01','2026-02-28','2028-02-29']);

    await page.getByRole('button', { name: '新建任务', exact: true }).click();
    await page.getByText('周期任务', { exact: true }).click();
    await page.getByPlaceholder('例如：周例会检查清单').fill('不续期验收');
    await page.getByLabel('完成后自动续期', { exact: false }).uncheck();
    await page.getByRole('button', { name: '生成周期任务', exact: true }).click();
    const disabled = await page.evaluate(async () => {
        const { useAppStore: store } = await import('/src/state/appStore.ts');
        const template = store.getState().recurringTemplates.find(t => t.title === '不续期验收');
        const task = store.getState().tasks.find(t => t.extras?.recurrenceId === template.id);
        store.getState().updateTask(task.id, { status: 'done' });
        return [template.active, store.getState().tasks.filter(t => t.extras?.recurrenceId === template.id).length];
    });
    assert.deepEqual(disabled, [false, 1]);
    console.log('Passed: UI-form Sunday date; weekly rollover and deduplication; paused and unchecked renewal; bulk completion; daily/year/month/leap-year boundaries');
} finally {
    await browser?.close();
    await server.close();
}

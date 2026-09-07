import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createServer } from 'vite';

// A fresh browser context keeps all test edits separate from the user's data.
const server = await createServer({ logLevel: 'error', server: { host: '127.0.0.1', port: 0 } });
let browser;
try {
    await server.listen();
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage({ viewport: { width: 1538, height: 900 }, timezoneId: 'Asia/Shanghai' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(server.resolvedUrls.local[0], { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: '编辑任务: 升级服务器固件', exact: true }).waitFor();
    const reminder = page.getByRole('button', { name: '我知道了', exact: true });
    if (await reminder.isVisible()) await reminder.click();
    await page.getByRole('button', { name: '编辑任务: 升级服务器固件', exact: true }).click();
    const drawer = page.locator('.dialog-shell');
    const draft = drawer.getByPlaceholder('例如：已完成环境部署，正在联调接口…');
    const time = drawer.locator('input[type="datetime-local"]');
    const save = drawer.getByRole('button', { name: '保存', exact: true });
    const taskId = await page.evaluate(() => JSON.parse(localStorage.getItem('project-todo-app')).state.tasks
        .find(task => task.title === '升级服务器固件').id);
    const readTask = () => page.evaluate(id => JSON.parse(localStorage.getItem('project-todo-app')).state.tasks.find(task => task.id === id), taskId);

    await time.fill('2026-09-07T09:11');
    await draft.fill('第一条进展\n接口联调完成');
    await save.click();
    const first = (await readTask()).progress;
    assert.equal(first?.length, 1, 'Save must include the pending progress draft');
    assert.equal(first[0].note, '第一条进展\n接口联调完成');
    assert.equal(first[0].at, Date.parse('2026-09-07T09:11:00+08:00'));
    assert.equal(await draft.inputValue(), '');
    await save.dblclick();
    assert.equal((await readTask()).progress.length, 1, 'Repeated save must not duplicate progress');

    await draft.fill('手动添加的进展');
    await drawer.getByRole('button', { name: '添加该进展到记录', exact: true }).click();
    await save.click();
    assert.equal((await readTask()).progress.length, 2, 'Add followed by Save must not add a second copy');
    await draft.fill('  \n  ');
    await save.click();
    assert.equal((await readTask()).progress.length, 2, 'Whitespace is not a progress record');

    await drawer.locator('.timeline-item').filter({ hasText: '第一条进展' }).getByRole('button', { name: '编辑', exact: true }).click();
    await draft.fill('修订后的第一条进展');
    await time.fill('2026-09-06T16:25');
    await drawer.getByPlaceholder('例如：当前已经完成了哪些工作，还有哪些待处理…').fill('自动保存的任务详情');
    await page.waitForFunction(id => JSON.parse(localStorage.getItem('project-todo-app')).state.tasks
        .find(task => task.id === id).notes === '自动保存的任务详情', taskId);
    assert.equal(await draft.inputValue(), '修订后的第一条进展', 'Field autosave must preserve the progress draft');
    assert.equal(await time.inputValue(), '2026-09-06T16:25');
    assert.equal(await drawer.getByRole('button', { name: '更新进展', exact: true }).count(), 1, 'Autosave must preserve edit mode');
    await save.click();
    const edited = (await readTask()).progress;
    assert.equal(edited.length, 2, 'Saving an edited entry must update it rather than append');
    assert.equal(edited.find(entry => entry.id === first[0].id).note, '修订后的第一条进展');
    assert.equal(edited.find(entry => entry.id === first[0].id).at, Date.parse('2026-09-06T16:25:00+08:00'));

    await draft.fill('第三条进展');
    await time.fill('');
    await save.click();
    assert.equal((await readTask()).progress.length, 2, 'An invalid record time must not be stored');
    assert.equal(await draft.inputValue(), '第三条进展', 'Validation failure must preserve the input');
    await page.getByText('请填写有效的进展记录时间', { exact: true }).waitFor();
    await time.fill('2026-09-07T10:30');
    await drawer.getByPlaceholder('例如：下周一前补齐案例，并提交知识库…').fill('自动保存下一步计划');
    await page.waitForFunction(id => JSON.parse(localStorage.getItem('project-todo-app')).state.tasks
        .find(task => task.id === id).nextStep === '自动保存下一步计划', taskId);
    assert.equal(await draft.inputValue(), '第三条进展', 'Autosave must preserve a new progress draft too');
    await drawer.getByPlaceholder('请输入任务标题').fill('进展保存验证');
    await save.click();
    await page.waitForTimeout(1300); // Let any previously queued field autosave run.
    const saved = await readTask();
    assert.equal(saved.title, '进展保存验证');
    assert.equal(saved.progress.length, 3);
    assert.equal(saved.progress.find(entry => entry.note === '第三条进展').at, Date.parse('2026-09-07T10:30:00+08:00'));
    assert.equal(saved.nextStep, '自动保存下一步计划');

    await drawer.getByRole('button', { name: '关闭', exact: true }).click();
    await page.getByRole('button', { name: '编辑任务: 设备入库验收', exact: true }).click();
    assert.equal(await draft.inputValue(), '', 'Progress draft must not leak to another task');
    await page.reload();
    await page.getByRole('button', { name: '编辑任务: 进展保存验证', exact: true }).click();
    assert.deepEqual((await readTask()).progress, saved.progress, 'Saved progress must survive a reload');
    assert.equal(await drawer.locator('.timeline-item').count(), 3);
    assert.equal(await draft.inputValue(), '');
    assert.deepEqual(errors, []);
    await mkdir('ui-check.local/progress-save', { recursive: true });
    await page.screenshot({ path: 'ui-check.local/progress-save/verified.png' });
    console.log('Passed: Save includes progress, no duplicates, edit in place, date validation, autosave preserves drafts, reload persistence');
} finally {
    if (browser) await browser.close();
    await server.close();
}

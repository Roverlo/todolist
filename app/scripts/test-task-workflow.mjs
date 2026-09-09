import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createServer } from 'vite';

// Fresh storage and synthetic records; export uses the app's browser download fallback.
const server = await createServer({ logLevel: 'error', server: { host: '127.0.0.1', port: 0 } });
let browser;
try {
    await server.listen();
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage({ viewport: { width: 1538, height: 950 } });
    page.setDefaultTimeout(15000);
    page.on('dialog', dialog => dialog.accept());
    await page.goto(server.resolvedUrls.local[0], { waitUntil: 'commit' });
    await page.getByRole('button', { name: '设置', exact: true }).waitFor({ timeout: 90000 });
    const reminder = page.getByRole('button', { name: '我知道了' });
    if (await reminder.isVisible()) await reminder.click();
    await page.getByPlaceholder('输入名称，点击新建').fill('QA项目');
    await page.getByRole('button', { name: '新建', exact: true }).click();
    await page.setViewportSize({ width: 1280, height: 698 });
    await page.getByRole('button', { name: '新建任务', exact: true }).click();
    await page.getByRole('button', { name: /单次任务/ }).click();
    const createDialog = page.locator('.create-dialog');
    const createBox = await createDialog.boundingBox();
    assert.ok(createBox.y >= 24 && createBox.y + createBox.height <= 674, 'Task dialog must leave room below its footer at short desktop heights');
    assert.ok((await createDialog.locator('.subtask-empty-state').boundingBox()).height < 100, 'Empty subtasks must not crowd out task details');
    const footerBox = await createDialog.locator('.create-dialog-footer').boundingBox();
    assert.ok(footerBox.y + footerBox.height <= 674 && footerBox.height >= 40, 'Task creation actions must stay fully visible');
    await createDialog.getByRole('button', { name: '+ 添加第一条子任务', exact: true }).click();
    assert.equal(await createDialog.locator('.subtask-empty-state').count(), 0);
    await createDialog.getByRole('button', { name: '关闭', exact: true }).click();
    await page.setViewportSize({ width: 1538, height: 950 });
    await page.evaluate(async () => {
        const { useAppStore: store } = await import('/src/state/appStore.ts');
        window.qaStore = store;
        const project = store.getState().projects.find(p => p.name === 'QA项目');
        if (!project) throw Error('UI project creation failed');
        store.getState().renameProject(project.id, 'QA项目已重命名');
        const base = { projectId: project.id, owners: '验收负责人', dueDate: '2099-09-08', notes: '包含逗号,引号"和\n换行', subtasks: [{id:'qa-sub',title:'验收子任务',completed:true,createdAt:Date.now()}], progress:[{id:'qa-progress',note:'保留历史进展',at:Date.now()}] };
        const first = store.getState().addTask({ ...base, title: 'QA任务一', priority: 'high' });
        const second = store.getState().addTask({ ...base, title: 'QA任务二', priority: 'low' });
        store.getState().updateTask(first.id, { progress: base.progress });
        store.getState().updateTask(second.id, { progress: base.progress });
        window.qaIds = [first.id, second.id];
        store.getState().setFilters({ search: 'QA任务' });
    });
    await page.getByRole('button', { name: '编辑任务: QA任务一', exact: true }).waitFor();
    await page.locator('.task-table .header-checkbox').click();
    await page.locator('.bulk-actions-bar').getByText('📋 状态', { exact: true }).click();
    await page.getByRole('option', { name: '🟢 已完成', exact: true }).click();
    assert.equal(await page.evaluate(() => window.qaIds.every(id => window.qaStore.getState().tasks.find(t => t.id === id).status === 'done')), true);
    assert.equal(await page.evaluate(() => window.qaStore.getState().tasks.filter(t => !window.qaIds.includes(t.id)).every(t => t.status !== 'done')), true);
    await page.locator('.bulk-cancel-btn').click();
    await page.reload({ waitUntil: 'commit' });
    await page.getByRole('button', { name: '编辑任务: QA任务一', exact: true }).waitFor({ timeout: 90000 });
    if (await reminder.isVisible()) await reminder.click();
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('project-todo-app')).state.tasks.filter(t => t.title.startsWith('QA任务')).every(t => t.status === 'done')), true);

    const openDataAction = async name => {
        if (!await page.getByRole('button', { name: '💾 数据', exact: true }).isVisible()) {
            await page.getByRole('button', { name: '设置', exact: true }).click();
        }
        await page.getByRole('button', { name: '💾 数据', exact: true }).click();
        await page.getByText(name, { exact: true }).click();
    };
    let exported;
    for (const format of ['JSON', 'CSV', 'Markdown']) {
        await openDataAction('导出任务');
        await page.getByText(format, { exact: true }).click();
        const downloaded = page.waitForEvent('download');
        await page.getByRole('button', { name: '导出', exact: true }).click();
        const download = await downloaded;
        await page.getByRole('button', { name: '关闭导出弹窗', exact: true }).waitFor({ state: 'hidden' });
        const content = (await readFile(await download.path(), 'utf8')).replace(/^\uFEFF/, '');
        assert.ok(content.includes('QA任务一') && content.includes('QA任务二'));
        assert.ok(!content.includes('升级服务器固件'), 'Only current filtered tasks should export');
        if (format === 'JSON') {
            exported = JSON.parse(content);
            assert.equal(exported.data.tasks.length, 2);
            assert.equal(exported.data.tasks[0].progress[0].note, '保留历史进展');
            assert.equal(exported.data.tasks[0].subtasks[0].completed, true);
        }
        if (format === 'CSV') assert.ok(content.includes('引号""和'));
    }
    await openDataAction('导入任务');
    await page.locator('input[type="file"]').setInputFiles({ name: 'qa-export.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(exported)) });
    await page.getByRole('button', { name: '导入', exact: true }).click();
    await page.getByRole('button', { name: '设置', exact: true }).waitFor();
    const imported = await page.evaluate(() => JSON.parse(localStorage.getItem('project-todo-app')).state);
    assert.equal(imported.tasks.filter(t => t.title.startsWith('QA任务')).length, 4);
    assert.equal(imported.projects.filter(p => p.name === 'QA项目已重命名').length, 1);
    assert.equal(new Set(imported.tasks.map(t => t.id)).size, imported.tasks.length);
    assert.ok(imported.tasks.filter(t => t.title.startsWith('QA任务')).every(t => t.progress?.[0]?.note === '保留历史进展' && t.subtasks?.[0]?.completed), 'JSON import must preserve progress and completed subtasks');

    await openDataAction('远程同步');
    await page.getByRole('button', { name: /测试连接/ }).click();
    await page.getByText(/请输入共享路径/).waitFor();
    assert.equal(await page.getByRole('button', { name: '上传同步', exact: true }).isDisabled(), true);
    await mkdir('ui-check.local/task-workflow', { recursive: true });
    await page.screenshot({ path: 'ui-check.local/task-workflow/verified.png' });
    console.log('Passed: project create/rename; selected-only bulk status and persistence; JSON/CSV/Markdown filtered export; JSON import with progress/subtasks/project mapping; unconfigured sync guard');
} finally {
    await browser?.close();
    await server.close();
}

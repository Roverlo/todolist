import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createServer } from 'vite';

// Exercise the real React flows in fresh browser storage. Only native file/dialog I/O is in memory.
const nativeIO = `
export const save = async () => window.qaSavePath;
export const open = async () => window.qaOpenPath;
export const appDataDir = async () => '/qa';
export const join = async (...parts) => parts.join('/');
export const exists = async () => true;
export const mkdir = async () => {};
export const writeTextFile = async (path, text) => {
  if (window.qaFailBackup && path.includes('auto_backup')) throw Error('QA write failure');
  window.qaFiles[path] = text;
};
export const readTextFile = async path => window.qaFiles[path];
export const readDir = async dir => Object.keys(window.qaFiles).filter(p => p.startsWith(dir + '/')).map(p => ({name:p.slice(dir.length+1)}));
export const remove = async path => { delete window.qaFiles[path]; };
export const copyFile = async (from, to) => { window.qaFiles[to] = window.qaFiles[from]; };
`;
const server = await createServer({
    logLevel: 'error', server: { host: '127.0.0.1', port: 0 },
    plugins: [{
        name: 'backup-native-io-check', enforce: 'pre',
        resolveId(id) { if (id === '/qa-native-io') return '\0qa-native-io'; },
        load(id) { if (id === '\0qa-native-io') return nativeIO; },
        transform(code, id) {
            if (/\/(BackupModal\.tsx|backupUtils\.ts)$/.test(id.replaceAll('\\', '/'))) {
                return code.replaceAll('@tauri-apps/plugin-dialog', '/qa-native-io')
                    .replaceAll('@tauri-apps/plugin-fs', '/qa-native-io')
                    .replaceAll('@tauri-apps/api/path', '/qa-native-io');
            }
        },
    }],
});
let browser;
try {
    await server.listen();
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.addInitScript(() => {
        window.qaFiles = {};
        window.qaSavePath = '/qa/manual.json';
        window.qaOpenPath = '/qa/manual.json';
    });
    await page.goto(server.resolvedUrls.local[0], { waitUntil: 'commit' });
    await page.getByRole('button', { name: '设置', exact: true }).waitFor({ timeout: 90000 });
    await page.evaluate(async () => {
        const { useAppStore: store } = await import('/src/state/appStore.ts');
        window.qaStore = store;
        const now = Date.now();
        store.setState({
            notes: [{ id: 'qa-note', title: '备份中的随记', date: '2026-09-08', content: '<p><mark data-color="#fef9c3">保留完整内容</mark></p>', tags: ['qa-tag'], createdAt: now, updatedAt: now }],
            tags: [{ id: 'qa-tag', name: '验收标签', icon: '📋', color: '#0284c7', createdAt: now }],
            selectedNoteId: 'qa-note',
            settings: { ...store.getState().settings, autoBackup: { enabled: false, customPath: '/qa/auto', interval: 1, retentionCount: 20, dailyBackup: false } },
        });
    });
    const reminder = page.getByRole('button', { name: '我知道了' });
    if (await reminder.isVisible()) await reminder.click();
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('button', { name: '💾 数据', exact: true }).click();
    await page.getByText('本地备份', { exact: true }).click();
    await page.getByRole('button', { name: '导出', exact: true }).click();
    await page.getByText(/备份成功/).waitFor();
    const backup = await page.evaluate(() => JSON.parse(window.qaFiles['/qa/manual.json']));
    assert.equal(backup.data.notes.length, 1);
    assert.equal(backup.data.tags[0].id, 'qa-tag');
    assert.equal(backup.data.notes[0].tags[0], backup.data.tags[0].id);
    const invalidResults = await page.evaluate(async () => {
        const { validateBackupFile } = await import('/src/utils/backupUtils.ts');
        const valid = JSON.parse(window.qaFiles['/qa/manual.json']);
        const tampered = structuredClone(valid); tampered.data.notes[0].title = 'tampered';
        return [validateBackupFile(JSON.stringify(valid)).valid, validateBackupFile(JSON.stringify(tampered)).errorType,
            ...[{notes:{}}, {tags:'wrong'}, {settings:null}].map(extra => validateBackupFile(JSON.stringify({version:'1.2',data:{projects:[],tasks:[],...extra}})).valid)];
    });
    assert.deepEqual(invalidResults, [true, 'checksum', false, false, false]);

    // A scheduled backup must include the latest note/tag changes and only advance its time on success.
    await page.evaluate(() => {
        const store = window.qaStore;
        store.getState().setSettings({ autoBackup: { ...store.getState().settings.autoBackup, enabled: true } });
        store.getState().updateNote('qa-note', { title: '自动备份读取最新内容' });
    });
    await page.waitForFunction(() => !!window.qaStore.getState().settings.autoBackup.lastBackupAt, undefined, { timeout: 15000 });
    assert.equal(await page.evaluate(() => Object.entries(window.qaFiles).filter(([p]) => p.includes('auto_backup')).some(([,s]) => JSON.parse(s).data.notes[0].title === '自动备份读取最新内容')), true);
    await page.evaluate(() => {
        const store = window.qaStore;
        window.qaFailBackup = true;
        store.getState().setSettings({ autoBackup: { ...store.getState().settings.autoBackup, lastBackupAt: '2000-01-01T00:00:00Z' } });
    });
    await page.waitForTimeout(6000);
    assert.equal(await page.evaluate(() => window.qaStore.getState().settings.autoBackup.lastBackupAt), '2000-01-01T00:00:00Z');
    await page.getByRole('button', { name: '导入', exact: true }).click();
    await page.getByText(/已停止恢复/).waitFor();
    assert.equal(await page.getByText('⚠️ 确认恢复数据', { exact: true }).count(), 0);

    await page.evaluate(() => {
        window.qaFailBackup = false;
        window.qaStore.getState().setSettings({ autoBackup: { ...window.qaStore.getState().settings.autoBackup, enabled: false } });
        window.qaStore.setState({ notes: [], tags: [], selectedNoteId: 'missing' });
    });
    await page.getByRole('button', { name: '导入', exact: true }).click();
    await page.getByText('⚠️ 确认恢复数据', { exact: true }).waitFor();
    assert.equal(await page.getByLabel('我已了解恢复操作将覆盖当前数据，并确认要继续').isChecked(), false);
    await page.getByLabel('我已了解恢复操作将覆盖当前数据，并确认要继续').check();
    await page.getByRole('button', { name: /确认恢复/ }).click();
    await page.getByText(/恢复成功/).waitFor();
    const restored = await page.evaluate(() => {
        const s = window.qaStore.getState(); return { notes:s.notes,tags:s.tags,id:s.selectedNoteId,settings:s.settings };
    });
    assert.deepEqual(restored.notes, backup.data.notes);
    assert.deepEqual(restored.tags, backup.data.tags);
    assert.equal(restored.id, 'qa-note');
    assert.deepEqual(restored.settings, backup.data.settings);

    // Task-only legacy backups must not clear notes, tags or settings which are absent from the file.
    await page.evaluate(() => { window.qaFiles['/qa/manual.json'] = JSON.stringify({version:'1.0',data:{projects:[],tasks:[]}}); });
    await page.getByRole('button', { name: '导入', exact: true }).click();
    await page.getByText('⚠️ 确认恢复数据', { exact: true }).waitFor();
    assert.equal(await page.getByLabel('我已了解恢复操作将覆盖当前数据，并确认要继续').isChecked(), false, 'Each restore needs its own confirmation');
    await page.getByLabel('我已了解恢复操作将覆盖当前数据，并确认要继续').check();
    await page.getByRole('button', { name: /确认恢复/ }).click();
    await page.getByText(/恢复成功/).waitFor();
    assert.deepEqual(await page.evaluate(() => window.qaStore.getState().notes), backup.data.notes);
    assert.deepEqual(await page.evaluate(() => window.qaStore.getState().tags), backup.data.tags);
    assert.deepEqual(await page.evaluate(() => window.qaStore.getState().settings), backup.data.settings);
    await mkdir('ui-check.local/backup-regression', { recursive: true });
    await page.screenshot({ path:'ui-check.local/backup-regression/verified.png' });
    console.log('Passed: manual/scheduled backup includes current notes and tags; restore round-trip, checksum, malformed input, legacy preservation, failed-backup protection and retry');
} finally {
    await browser?.close();
    await server.close();
}

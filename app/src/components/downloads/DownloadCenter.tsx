import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { ArrowDownToLine, CheckCheck, CircleAlert, FolderOpen, List, Pause, Play, Plus, RotateCcw, Search, Star, Trash2, X } from 'lucide-react';
import { useDownloadStore, matchesFilter, formatBytes, canDownloadAction, directoryKey, type DownloadBatchAction, type DownloadFilter, type DownloadSettings, type DownloadTask } from '../../state/downloadStore';
import { useToastStore } from '../../state/toastStore';
import { extractDownloadLinks, importDownloadFile } from '../../utils/downloadImport';
import { CustomSelect } from '../ui/CustomSelect';
import './DownloadCenter.css';
import engineLicense from '../../../src-tauri/licenses/aria2-COPYING.txt?raw';

const filters: { id: DownloadFilter; label: string; icon: typeof List }[] = [
  { id: 'all', label: '全部下载', icon: List }, { id: 'running', label: '下载中', icon: ArrowDownToLine },
  { id: 'paused', label: '已暂停', icon: Pause }, { id: 'complete', label: '已完成', icon: CheckCheck },
  { id: 'error', label: '下载失败', icon: CircleAlert },
];
const statusLabels: Record<DownloadTask['status'], string> = { active: '下载中', waiting: '排队中', paused: '已暂停', complete: '已完成', error: '下载失败' };

export function DownloadSidebar() {
  const { tasks, filter, setFilter, settings } = useDownloadStore();
  return <nav className="download-sidebar" aria-label="下载分类">
    <div className="download-sidebar-heading">下载管理</div>
    {filters.map(({ id, label, icon: Icon }) => <button key={id} className={filter === id ? 'selected' : ''} aria-current={filter === id ? 'page' : undefined} onClick={() => setFilter(id)}>
      <Icon size={17} /><span>{label}</span><span className="download-count">{tasks.filter(t => matchesFilter(t, id)).length}</span>
    </button>)}
    <div className="download-sidebar-note"><span>同时下载 {settings.concurrent} 个文件</span><span>{settings.limitKib ? `限速 ${settings.limitKib} KiB/s` : '不限速'}</span><p>切换到待办或随记，下载会在后台继续。</p></div>
  </nav>;
}

function Modal({ title, children, onClose, locked = false, className = '' }: { title: string; children: ReactNode; onClose: () => void; locked?: boolean; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  return <dialog ref={ref} className={`download-dialog ${className}`} aria-label={title} onCancel={event => { event.preventDefault(); if (!locked) onClose(); }}>
    <header><h2>{title}</h2><button type="button" className="download-icon" aria-label="关闭弹窗" disabled={locked} onClick={onClose}><X size={18} /></button></header>
    {children}
  </dialog>;
}

async function chooseDirectory(current: string, set: (directory: string) => void) {
  const result = await open({ directory: true, multiple: false, title: '选择下载保存目录', ...(current ? { defaultPath: current } : {}) });
  if (typeof result === 'string') set(result);
}

function DownloadDirectory({ label, value, onChange, disabled = false, onError }: { label: string; value: string; onChange: (directory: string) => void; disabled?: boolean; onError: (error: string) => void }) {
  const id = useId();
  const { favoriteDirectories, request, busy } = useDownloadStore();
  const saved = favoriteDirectories.some(directory => directoryKey(directory) === directoryKey(value));
  const locked = disabled || busy;
  async function remember(directory: string, favorite: boolean) {
    onError('');
    try { await request({ action: 'favoriteDirectory', directory, favorite }); }
    catch (error) { onError(String(error)); }
  }
  return <div className="download-directory-field">
    <label htmlFor={id}>{label}</label>
    <div className="download-directory"><input id={id} required value={value} disabled={locked} onChange={event => onChange(event.target.value)} placeholder="在桌面版选择保存目录" />
      <button type="button" aria-label={label === '保存到' ? '选择保存目录' : '选择默认保存目录'} disabled={!isTauri() || locked} onClick={() => void chooseDirectory(value, onChange).catch(error => onError(String(error)))}><FolderOpen size={17} /></button>
      <button type="button" aria-pressed={saved} disabled={!isTauri() || locked || !value.trim()} onClick={() => void remember(value, !saved)}><Star size={16} fill={saved ? 'currentColor' : 'none'} />{saved ? '已记为常用' : '记为常用'}</button>
    </div>
    {favoriteDirectories.length > 0 && <div className="download-favorites" aria-label="常用目录"><span>常用目录</span><div className="download-favorite-list">
      {favoriteDirectories.map(directory => <div className="download-favorite" key={directory}>
        <button type="button" title={directory} aria-label={`使用常用目录 ${directory}`} aria-pressed={directoryKey(directory) === directoryKey(value)} disabled={locked} onClick={() => onChange(directory)}><FolderOpen size={14} /><span>{directory.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || directory} · {directory}</span></button>
        <button type="button" className="download-favorite-remove" title="移除常用目录" aria-label={`移除常用目录 ${directory}`} disabled={!isTauri() || locked} onClick={() => void remember(directory, false)}><X size={13} /></button>
      </div>)}
    </div></div>}
  </div>;
}

function AddDownload({ onClose }: { onClose: () => void }) {
  const { settings, request, busy } = useDownloadStore();
  const [text, setText] = useState('');
  const [directory, setDirectory] = useState(settings.directory);
  const [error, setError] = useState('');
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [stopping, setStopping] = useState(false);
  const stop = useRef(false), fileInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const locked = importing || progress !== null;
  let parsed = { urls: [] as string[], duplicates: 0, invalid: 0 }, parseError = '';
  try { parsed = extractDownloadLinks(text); } catch (reason) { parseError = String(reason); }
  async function importFiles(files: File[]) {
    if (locked || busy || !files.length) return;
    if (parseError) { setError(parseError); return; }
    if (files.length > 20) { setError('一次最多导入 20 个文件'); return; }
    setImporting(true); setError('');
    try {
      // Publish the merged input only after every selected file has parsed successfully.
      const urls = [...parsed.urls];
      for (const file of files) urls.push(...await importDownloadFile(file));
      setText(extractDownloadLinks(urls.join('\n')).urls.join('\n'));
    } catch (reason) { setError(String(reason)); }
    finally { setImporting(false); }
  }
  return <Modal title="新建下载" className="download-add-dialog" locked={locked} onClose={onClose}><form onSubmit={async event => {
    event.preventDefault();
    if (locked || busy || !parsed.urls.length || parseError) return;
    setError(''); stop.current = false; setStopping(false);
    const pending: string[] = [];
    let added = 0, lastError = '';
    setProgress({ done: 0, total: parsed.urls.length });
    for (let index = 0; index < parsed.urls.length; index++) {
      if (stop.current) { pending.push(...parsed.urls.slice(index)); break; }
      const url = parsed.urls[index];
      const previous = new Set(useDownloadStore.getState().tasks.map(task => task.id));
      try { await request({ action: 'add', url, directory }); added++; }
      catch (reason) {
        // An engine failure can leave a retryable record. Do not add that URL twice.
        if (useDownloadStore.getState().tasks.some(task => !previous.has(task.id) && task.url === url)) added++;
        else pending.push(url);
        lastError = String(reason);
      }
      setProgress({ done: index + 1, total: parsed.urls.length });
    }
    setProgress(null); setText(pending.join('\n')); setStopping(false);
    if (added) useToastStore.getState().addToast(`已加入 ${added} 项下载`, 'success');
    if (!pending.length) { onClose(); if (lastError) useToastStore.getState().addToast('部分下载失败，可在下载列表中重试', 'error'); }
    else setError(`已加入 ${added} 项，输入框保留 ${pending.length} 项未添加链接。${lastError || '已停止添加。'}`);
  }}>
    <div className={`download-link-drop${dragging ? ' is-dragging' : ''}`} onDragOver={event => { event.preventDefault(); if (!locked) setDragging(true); }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }} onDrop={event => {
      event.preventDefault(); setDragging(false); if (locked || busy) return;
      if (event.dataTransfer.files.length) void importFiles(Array.from(event.dataTransfer.files));
      else { const dropped = event.dataTransfer.getData('text/uri-list') || event.dataTransfer.getData('text/plain'); if (dropped) setText(current => `${current}\n${dropped}`); }
    }}>
      <label htmlFor="download-links">下载链接</label>
      <textarea id="download-links" autoFocus required rows={6} spellCheck={false} maxLength={1048576} placeholder={'粘贴包含链接的整段文字，自动识别多个 URL\n支持空格、换行、逗号等分隔，也可拖入 TXT、CSV 或 Excel 文件'} value={text} disabled={locked || busy} onChange={event => { setText(event.target.value); setError(''); }} />
      <div className="download-import-actions"><span role="status">{importing ? '正在读取文件…' : `已识别 ${parsed.urls.length} 个链接${parsed.duplicates ? ` · 去重 ${parsed.duplicates} 项` : ''}${parsed.invalid ? ` · 忽略 ${parsed.invalid} 个无效链接` : ''}`}</span><button type="button" disabled={locked || busy} onClick={() => fileInput.current?.click()}><FolderOpen size={15} />选择文件</button></div>
      <input ref={fileInput} type="file" hidden multiple accept=".txt,.csv,.tsv,.xlsx" aria-label="导入链接文件" onChange={event => { void importFiles(Array.from(event.target.files || [])); event.target.value = ''; }} />
    </div>
    <p className="download-help download-import-help">支持 TXT、CSV、TSV、Excel（.xlsx），可一次选择多个文件。</p>
    <DownloadDirectory label="保存到" value={directory} onChange={setDirectory} disabled={locked} onError={setError} />
    {(error || parseError) && <p role="alert" className="download-error">{error || parseError}</p>}
    {!isTauri() && <p className="download-help">当前为浏览器预览。文件下载在 Windows 桌面版中运行。</p>}
    <footer>{progress && <span role="status">{stopping ? '当前链接处理后停止' : `正在添加 ${progress.done}/${progress.total}`}</span>}<button type="button" disabled={importing || stopping} onClick={() => { if (progress) { stop.current = true; setStopping(true); } else onClose(); }}>{progress ? '停止添加' : '取消'}</button><button className="download-primary" disabled={busy || locked || !!parseError || !parsed.urls.length || !isTauri()} type="submit">{progress ? '正在添加…' : parsed.urls.length > 1 ? `开始下载（${parsed.urls.length}）` : '开始下载'}</button></footer>
  </form></Modal>;
}

export function DownloadPreferences() {
  const { settings, request, busy } = useDownloadStore();
  const [draft, setDraft] = useState<DownloadSettings>(settings);
  const [error, setError] = useState('');
  return <form className="download-preferences" onSubmit={async event => {
    event.preventDefault(); if (busy) return; setError('');
    try { await request({ action: 'settings', settings: draft }); useToastStore.getState().addToast('下载设置已保存', 'success', 4500); }
    catch (reason) { setError(String(reason)); }
  }}><fieldset className="download-settings-fields" disabled={busy}>
    <DownloadDirectory label="默认保存目录" value={draft.directory} onChange={directory => setDraft(current => ({ ...current, directory }))} onError={setError} />
    <p className="download-help">默认目录仅影响新建下载；常用目录的添加和移除会立即保存。</p>
    <div className="download-setting-grid"><div className="download-setting-field"><span>同时下载数</span><CustomSelect aria-label="同时下载数" value={draft.concurrent} onChange={value => setDraft({ ...draft, concurrent: Number(value) })} options={[1,2,3,4,5,6,7,8].map(n => ({ value: String(n), label: `${n} 个文件` }))} /></div>
    <div className="download-setting-field"><span>单文件分片数</span><CustomSelect aria-label="单文件分片数" aria-describedby="download-connections-help" value={draft.connections} onChange={value => setDraft({ ...draft, connections: Number(value) })} options={[1,4,8,16,32,64].map(n => ({ value: String(n), label: n === 1 ? '1（不分片）' : `${n} 分片` }))} /></div></div>
    <p id="download-connections-help" className="download-help">多路并行下载可提速，实际分片数取决于文件大小和服务器支持，并非越多越快。新任务采用此设置；已有任务暂停后继续生效。</p>
    <label>总速度上限（KiB/s）<input required type="number" min="0" max="1048576" step="1" value={draft.limitKib} onChange={e => setDraft({ ...draft, limitKib: Number(e.target.value) })} /></label>
    <p className="download-help">填 0 表示不限速；1024 KiB/s ≈ 1 MiB/s。保存后立即生效。</p>
    <label className="download-checkbox"><input type="checkbox" checked={draft.notify} onChange={e => setDraft({ ...draft, notify: e.target.checked })} />下载完成时显示系统通知</label>
    <details className="download-license"><summary>下载引擎与开源许可</summary><p>aria2 1.37.0-motrix.16 · GPL-2.0-or-later<br />Copyright © Tatsuhiro Tsujikawa and contributors</p><p>此引擎按现状提供，不提供担保。对应源码：<br /><a href="https://github.com/motrixapp/aria2/tree/v1.37.0-motrix.16" target="_blank" rel="noreferrer">motrixapp/aria2 · v1.37.0-motrix.16</a></p><pre>{engineLicense}</pre></details>
    {error && <p role="alert" className="download-error">{error}</p>}
    {!isTauri() && <p className="download-help">当前为浏览器预览，下载设置在 Windows 桌面版中保存。</p>}
    <footer><button type="button" onClick={() => { setDraft(settings); setError(''); }} disabled={busy}>还原修改</button><button className="download-primary" type="submit" disabled={busy || !isTauri()}>{busy ? '保存中…' : '保存设置'}</button></footer>
  </fieldset></form>;
}

export function DownloadCenter({ settingsButton }: { settingsButton?: React.ReactNode }) {
  const { tasks, filter, settings, busy, error, loaded, request, requestBatch, refresh } = useDownloadStore();
  const [query, setQuery] = useState('');
  const [modal, setModal] = useState<'add' | null>(null);
  const [removing, setRemoving] = useState<DownloadTask[] | null>(null);
  const [selection, setSelection] = useState<Set<string>>(() => new Set());
  const [batchRunning, setBatchRunning] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; errors: string[] } | null>(null);
  const selectAll = useRef<HTMLInputElement>(null);
  const filtered = tasks.filter(t => matchesFilter(t, filter) && t.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())).slice().reverse();
  const selected = filtered.filter(task => selection.has(task.id));
  const pauseCount = selected.filter(task => canDownloadAction(task, 'pause')).length;
  const resumeCount = selected.filter(task => canDownloadAction(task, 'resume')).length;
  useEffect(() => { setSelection(new Set()); }, [filter, query]);
  useEffect(() => { if (selectAll.current) selectAll.current.indeterminate = selected.length > 0 && selected.length < filtered.length; }, [selected.length, filtered.length]);
  const speed = tasks.reduce((sum, t) => sum + t.speed, 0);
  const run = (action: 'pause' | 'resume' | 'reveal', id: string) => request({ action, id }).catch(reason => { useToastStore.getState().addToast(String(reason), 'error'); });
  async function runBatch(action: DownloadBatchAction, targets: DownloadTask[]) {
    if (busy || !targets.length) return;
    setBatchRunning(true); setFeedback(null);
    try {
      const result = await requestBatch(action, targets.map(task => task.id));
      const label = { pause: '暂停', resume: '开始', remove: '删除记录' }[action];
      setFeedback({ message: `${label}成功 ${result.succeeded.length} 项${result.skipped.length ? ` · 跳过 ${result.skipped.length} 项（状态已变化）` : ''}${result.failed.length ? ` · 失败 ${result.failed.length} 项，可重新操作` : ''}`,
        errors: result.failed.map(item => `${item.name}：${item.error}`) });
      setSelection(new Set(result.failed.map(item => item.id)));
      setRemoving(null);
    } catch (error) { setFeedback({ message: String(error), errors: [] }); }
    finally { setBatchRunning(false); }
  }
  return <section className="download-center" aria-label="下载中心">
    <header className="download-header"><div><h1>下载中心</h1><p>多线程分片下载，充分利用带宽 · 支持断点续传，中断后接着下</p><p className="download-benefits-note">提速效果受带宽和服务器限制（如酒店出口限速）；断点续传需服务器支持。</p></div><div className="download-header-actions">
      <button className="download-primary" disabled={!loaded || busy} onClick={() => setModal('add')}><Plus size={17} />新建下载</button>
      {settingsButton}
    </div></header>
    {!isTauri() && <div className="download-notice"><CircleAlert size={16} />浏览器预览 · 文件下载在 Windows 桌面版中运行，可先查看界面和设置。</div>}
    {error && <div className="download-notice download-error" role="alert"><CircleAlert size={16} /><span>{error}</span><button disabled={busy} onClick={() => void refresh()}>刷新</button></div>}
    <div className="download-list-toolbar"><div className="download-overview"><span><ArrowDownToLine size={15} /><strong>{formatBytes(speed)}/s</strong></span><span>下载中 {tasks.filter(t => t.status === 'active').length}</span><span>排队 {tasks.filter(t => t.status === 'waiting').length}</span><span>{settings.limitKib ? `限速 ${settings.limitKib} KiB/s` : '不限速'}</span></div><label className="download-search"><Search size={16} /><input aria-label="搜索下载文件" placeholder="搜索文件名" value={query} onChange={e => setQuery(e.target.value)} /></label></div>
    <div className="download-batch-toolbar" aria-label="批量下载操作">
      <label className="download-select-all"><input ref={selectAll} type="checkbox" checked={filtered.length > 0 && selected.length === filtered.length} disabled={busy || !filtered.length} onChange={event => setSelection(new Set(event.target.checked ? filtered.map(task => task.id) : []))} />全选当前列表</label>
      <span className="download-selection-count" role="status">{batchRunning ? '正在处理选中任务…' : `已选 ${selected.length} 项`}</span>
      <div className="download-batch-actions">
        <button disabled={busy || !resumeCount || !isTauri()} onClick={() => void runBatch('resume', selected.filter(task => canDownloadAction(task, 'resume')))}><Play size={15} />批量开始</button>
        <button disabled={busy || !pauseCount || !isTauri()} onClick={() => void runBatch('pause', selected.filter(task => canDownloadAction(task, 'pause')))}><Pause size={15} />批量暂停</button>
        <button disabled={busy || !selected.length || !isTauri()} onClick={() => setRemoving(selected)}><Trash2 size={15} />批量删除</button>
      </div>
    </div>
    {feedback && <div className="download-batch-feedback"><div><span role="status">{feedback.message}</span><button className="download-icon" aria-label="关闭批量操作结果" onClick={() => setFeedback(null)}><X size={15} /></button></div>{feedback.errors.length > 0 && <details><summary>查看失败原因</summary><ul>{feedback.errors.map((message, index) => <li key={index}>{message}</li>)}</ul></details>}</div>}
    <div className="download-list" aria-label={filters.find(f => f.id === filter)?.label}>
      {filtered.length === 0 ? <div className="download-empty"><div><ArrowDownToLine size={34} /></div><h2>{!loaded ? '正在读取下载记录…' : query ? '没有找到匹配的文件' : filter === 'all' ? '把需要的文件，放进下载中心' : '此分类暂无下载'}</h2><p>{query ? '试试其他文件名' : '粘贴文件链接，即可管理进度、暂停和续传。'}</p>{filter === 'all' && !query && loaded && <button className="download-primary" onClick={() => setModal('add')}><Plus size={17} />新建下载</button>}</div>
        : filtered.map(task => {
          const progress = task.total > 0 ? Math.min(100, Math.floor(task.completed / task.total * 100)) : 0;
          return <article className={`download-row is-${task.status}${selection.has(task.id) ? ' is-selected' : ''}`} key={task.id} aria-label={task.name}>
            <input className="download-row-select" type="checkbox" aria-label={`选择 ${task.name}`} checked={selection.has(task.id)} disabled={busy} onChange={event => { const checked = event.target.checked; setSelection(current => { const next = new Set(current); if (checked) next.add(task.id); else next.delete(task.id); return next; }); }} />
            <div className="download-file-icon"><ArrowDownToLine size={22} /></div><div className="download-file-content">
              <div className="download-file-title"><h2 title={task.name}>{task.name}</h2><span className="download-status">{statusLabels[task.status]}</span></div>
              <div className="download-progress" role="progressbar" aria-label={`${task.name} 下载进度`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span style={{ width: `${progress}%` }} /></div>
              <div className="download-file-meta"><span>{formatBytes(task.completed)} / {task.total ? formatBytes(task.total) : '大小待确认'}{task.total > 0 && ` · ${progress}%`}</span><span>{task.status === 'active' ? `${formatBytes(task.speed)}/s` : task.finishedAt ? `完成于 ${new Date(task.finishedAt).toLocaleString()}` : new URL(task.url).hostname}</span></div>
              {task.error && <p className="download-error">{task.error}</p>}
              <p className="download-file-path" title={task.directory}>{task.directory.replace(/^\\\\\?\\/, '')}</p>
            </div><div className="download-row-actions">
              {(task.status === 'active' || task.status === 'waiting') && <button className="download-icon" title="暂停" aria-label={`暂停 ${task.name}`} disabled={busy} onClick={() => void run('pause', task.id)}><Pause size={17} /></button>}
              {(task.status === 'paused' || task.status === 'error') && <button className="download-icon" title={task.status === 'error' ? '重试' : '继续'} aria-label={`${task.status === 'error' ? '重试' : '继续'} ${task.name}`} disabled={busy} onClick={() => void run('resume', task.id)}>{task.status === 'error' ? <RotateCcw size={17} /> : <Play size={17} />}</button>}
              <button className="download-icon" title="打开保存目录" aria-label={`打开 ${task.name} 的保存目录`} disabled={busy} onClick={() => void run('reveal', task.id)}><FolderOpen size={17} /></button>
              <button className="download-icon" title="移除记录" aria-label={`移除 ${task.name}`} disabled={busy} onClick={() => setRemoving([task])}><Trash2 size={17} /></button>
            </div>
          </article>;
        })}
    </div>
    <footer className="download-footer"><span>共 {tasks.length} 项 · 已完成 {tasks.filter(t => t.status === 'complete').length} 项</span><span>HTTP / HTTPS</span></footer>
    {modal === 'add' && <AddDownload onClose={() => setModal(null)} />}
    {removing && <Modal title={removing.length > 1 ? '批量删除下载记录' : '移除下载记录'} locked={busy} onClose={() => setRemoving(null)}><p>{removing.length > 1 ? `停止并删除选中的 ${removing.length} 项下载记录？` : `停止“${removing[0].name}”并移除记录？`}已下载的文件和续传文件会保留在保存目录。</p><footer><button onClick={() => setRemoving(null)} disabled={busy}>取消</button><button className="download-primary" disabled={busy} onClick={() => void runBatch('remove', removing)}>{busy ? '正在删除…' : removing.length > 1 ? `删除 ${removing.length} 项记录` : '移除记录'}</button></footer></Modal>}
  </section>;
}

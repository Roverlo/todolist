import { useEffect, useRef, useState, type ReactNode } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { ArrowDownToLine, CheckCheck, CircleAlert, FolderOpen, List, Pause, Play, Plus, RotateCcw, Search, Settings, Trash2, X, Palette } from 'lucide-react';
import { useDownloadStore, matchesFilter, formatBytes, type DownloadFilter, type DownloadSettings, type DownloadTask } from '../../state/downloadStore';
import { useToastStore } from '../../state/toastStore';
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

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  return <dialog ref={ref} className="download-dialog" aria-label={title} onCancel={event => { event.preventDefault(); onClose(); }}>
    <header><h2>{title}</h2><button type="button" className="download-icon" aria-label="关闭弹窗" onClick={onClose}><X size={18} /></button></header>
    {children}
  </dialog>;
}

async function chooseDirectory(current: string, set: (directory: string) => void) {
  const result = await open({ directory: true, multiple: false, title: '选择下载保存目录', ...(current ? { defaultPath: current } : {}) });
  if (typeof result === 'string') set(result);
}

function AddDownload({ onClose }: { onClose: () => void }) {
  const { settings, request, busy } = useDownloadStore();
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [directory, setDirectory] = useState(settings.directory);
  const [error, setError] = useState('');
  const [inspecting, setInspecting] = useState(false);
  const [info, setInfo] = useState('');
  const [detectedName, setDetectedName] = useState('');
  useEffect(() => {
    let cancelled = false;
    setDetectedName(''); setInfo(''); setInspecting(false);
    try {
      const parsed = new URL(url.trim());
      if (!['http:', 'https:'].includes(parsed.protocol)) return;
      setDetectedName(decodeURIComponent(parsed.pathname.split('/').pop() || ''));
    } catch { return; }
    if (!isTauri()) return;
    setInspecting(true);
    const timer = window.setTimeout(() => {
      void invoke<{ name: string | null; total: number | null }>('downloads_inspect', { url }).then(result => {
        if (cancelled) return;
        setDetectedName(result.name || '');
        setInfo(result.total !== null ? formatBytes(result.total) : '');
      }).catch(() => { if (!cancelled) setInfo('开始下载时自动命名'); })
        .finally(() => { if (!cancelled) setInspecting(false); });
    }, 400);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [url]);
  return <Modal title="新建下载" onClose={onClose}><form onSubmit={async event => {
    event.preventDefault(); setError('');
    try { await request({ action: 'add', url, name: renaming ? name : '', directory }); onClose(); useToastStore.getState().addToast('已加入下载队列', 'success'); }
    catch (reason) { setError(String(reason)); }
  }}>
    <label>下载链接<input autoFocus type="url" required placeholder="粘贴 HTTP / HTTPS 文件链接" value={url} disabled={busy} onChange={event => setUrl(event.target.value)} /></label>
    <p className="download-help">使用文件直链；需要登录的网页或网盘分享页面暂不支持。</p>
    <div className="download-auto-name"><div role="status"><span>{detectedName || '文件名会自动识别，无需填写'}</span>{(inspecting || info) && <small>{inspecting ? '正在识别…' : info}</small>}</div><button type="button" disabled={busy} aria-expanded={renaming} aria-controls="download-custom-name" onClick={() => setRenaming(!renaming)}>{renaming ? '使用原名' : '重命名'}</button></div>
    {renaming && <label id="download-custom-name">另存为（可选）<input disabled={busy} maxLength={180} value={name} onChange={event => setName(event.target.value)} placeholder={detectedName || '留空使用自动识别的名称'} /></label>}
    <label>保存到<div className="download-directory"><input required value={directory} onChange={event => setDirectory(event.target.value)} placeholder="在桌面版选择保存目录" /><button type="button" aria-label="选择保存目录" disabled={!isTauri() || busy} onClick={() => void chooseDirectory(directory, setDirectory).catch(e => setError(String(e)))}><FolderOpen size={17} /></button></div></label>
    {error && <p role="alert" className="download-error">{error}</p>}
    {!isTauri() && <p className="download-help">当前为浏览器预览。文件下载在 Windows 桌面版中运行。</p>}
    <footer><button type="button" disabled={busy} onClick={onClose}>取消</button><button className="download-primary" disabled={busy || !isTauri()} type="submit">{busy ? '正在添加…' : '开始下载'}</button></footer>
  </form></Modal>;
}

function DownloadPreferences({ onClose }: { onClose: () => void }) {
  const { settings, request, busy } = useDownloadStore();
  const [draft, setDraft] = useState<DownloadSettings>(settings);
  const [error, setError] = useState('');
  return <Modal title="下载设置" onClose={onClose}><form onSubmit={async event => {
    event.preventDefault(); setError('');
    try { await request({ action: 'settings', settings: draft }); onClose(); useToastStore.getState().addToast('下载设置已保存', 'success'); }
    catch (reason) { setError(String(reason)); }
  }}>
    <label>默认保存目录<div className="download-directory"><input required value={draft.directory} onChange={e => setDraft({ ...draft, directory: e.target.value })} placeholder="在桌面版选择保存目录" /><button type="button" aria-label="选择默认保存目录" disabled={!isTauri() || busy} onClick={() => void chooseDirectory(draft.directory, directory => setDraft({ ...draft, directory })).catch(e => setError(String(e)))}><FolderOpen size={17} /></button></div></label>
    <p className="download-help">仅影响新建下载，已有任务保留原来的保存位置。</p>
    <div className="download-setting-grid"><label>同时下载数<select value={draft.concurrent} onChange={e => setDraft({ ...draft, concurrent: Number(e.target.value) })}>{[1,2,3,4,5,6,7,8].map(n => <option key={n} value={n}>{n} 个文件</option>)}</select></label>
    <label>单文件连接数<select aria-describedby="download-connections-help" value={draft.connections} onChange={e => setDraft({ ...draft, connections: Number(e.target.value) })}>{[1,4,8,16,32,64].map(n => <option key={n} value={n}>{n === 1 ? '1（单连接）' : `${n} 个连接`}</option>)}</select></label></div>
    <p id="download-connections-help" className="download-help">单文件分片下载的连接上限，实际数量取决于文件大小和服务器支持。新任务采用此设置；已有任务暂停后继续生效。</p>
    <label>总速度上限（KiB/s）<input required type="number" min="0" max="1048576" step="1" value={draft.limitKib} onChange={e => setDraft({ ...draft, limitKib: Number(e.target.value) })} /></label>
    <p className="download-help">填 0 表示不限速；1024 KiB/s ≈ 1 MiB/s。设置立即生效。</p>
    <label className="download-checkbox"><input type="checkbox" checked={draft.notify} onChange={e => setDraft({ ...draft, notify: e.target.checked })} />下载完成时显示系统通知</label>
    <details className="download-license"><summary>下载引擎与开源许可</summary><p>aria2 1.37.0-motrix.16 · GPL-2.0-or-later<br />Copyright © Tatsuhiro Tsujikawa and contributors</p><p>此引擎按现状提供，不提供担保。对应源码：<br /><a href="https://github.com/motrixapp/aria2/tree/v1.37.0-motrix.16" target="_blank" rel="noreferrer">motrixapp/aria2 · v1.37.0-motrix.16</a></p><pre>{engineLicense}</pre></details>
    {error && <p role="alert" className="download-error">{error}</p>}
    {!isTauri() && <p className="download-help">当前为浏览器预览，下载设置在 Windows 桌面版中保存。</p>}
    <footer><button type="button" onClick={onClose} disabled={busy}>取消</button><button className="download-primary" type="submit" disabled={busy || !isTauri()}>{busy ? '保存中…' : '保存设置'}</button></footer>
  </form></Modal>;
}

export function DownloadCenter({ onTheme }: { onTheme: () => void }) {
  const { tasks, filter, settings, busy, error, loaded, request, refresh } = useDownloadStore();
  const [query, setQuery] = useState('');
  const [modal, setModal] = useState<'add' | 'settings' | null>(null);
  const [removing, setRemoving] = useState<DownloadTask | null>(null);
  const filtered = tasks.filter(t => matchesFilter(t, filter) && t.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())).slice().reverse();
  const speed = tasks.reduce((sum, t) => sum + t.speed, 0);
  const run = (action: 'pause' | 'resume' | 'reveal' | 'remove', id: string) => request({ action, id }).catch(reason => { useToastStore.getState().addToast(String(reason), 'error'); });
  return <section className="download-center" aria-label="下载中心">
    <header className="download-header"><div><h1>下载中心</h1><p>文件集中管理，下载在后台继续</p></div><div className="download-header-actions">
      <button className="download-primary" disabled={!loaded || busy} onClick={() => setModal('add')}><Plus size={17} />新建下载</button>
      <button onClick={() => setModal('settings')} disabled={!loaded || busy}><Settings size={17} />下载设置</button>
      <button className="download-icon" onClick={onTheme} aria-label="更改主题色" title="更改主题色"><Palette size={18} /></button>
    </div></header>
    {!isTauri() && <div className="download-notice"><CircleAlert size={16} />浏览器预览 · 文件下载在 Windows 桌面版中运行，可先查看界面和设置。</div>}
    {error && <div className="download-notice download-error" role="alert"><CircleAlert size={16} /><span>{error}</span><button disabled={busy} onClick={() => void refresh()}>刷新</button></div>}
    <div className="download-list-toolbar"><div className="download-overview"><span><ArrowDownToLine size={15} /><strong>{formatBytes(speed)}/s</strong></span><span>下载中 {tasks.filter(t => t.status === 'active').length}</span><span>排队 {tasks.filter(t => t.status === 'waiting').length}</span><span>{settings.limitKib ? `限速 ${settings.limitKib} KiB/s` : '不限速'}</span></div><label className="download-search"><Search size={16} /><input aria-label="搜索下载文件" placeholder="搜索文件名" value={query} onChange={e => setQuery(e.target.value)} /></label></div>
    <div className="download-list" aria-label={filters.find(f => f.id === filter)?.label}>
      {filtered.length === 0 ? <div className="download-empty"><div><ArrowDownToLine size={34} /></div><h2>{!loaded ? '正在读取下载记录…' : query ? '没有找到匹配的文件' : filter === 'all' ? '把需要的文件，放进下载中心' : '此分类暂无下载'}</h2><p>{query ? '试试其他文件名' : '粘贴文件链接，即可管理进度、暂停和续传。'}</p>{filter === 'all' && !query && loaded && <button className="download-primary" onClick={() => setModal('add')}><Plus size={17} />新建下载</button>}</div>
        : filtered.map(task => {
          const progress = task.total > 0 ? Math.min(100, Math.floor(task.completed / task.total * 100)) : 0;
          return <article className={`download-row is-${task.status}`} key={task.id} aria-label={task.name}>
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
              <button className="download-icon" title="移除记录" aria-label={`移除 ${task.name}`} disabled={busy} onClick={() => setRemoving(task)}><Trash2 size={17} /></button>
            </div>
          </article>;
        })}
    </div>
    <footer className="download-footer"><span>共 {tasks.length} 项 · 已完成 {tasks.filter(t => t.status === 'complete').length} 项</span><span>HTTP / HTTPS</span></footer>
    {modal === 'add' && <AddDownload onClose={() => setModal(null)} />}
    {modal === 'settings' && <DownloadPreferences onClose={() => setModal(null)} />}
    {removing && <Modal title="移除下载记录" onClose={() => setRemoving(null)}><p>停止“{removing.name}”并移除记录？已下载的文件和续传文件会保留在保存目录。</p><footer><button onClick={() => setRemoving(null)} disabled={busy}>取消</button><button className="download-primary" disabled={busy} onClick={async () => { await run('remove', removing.id); setRemoving(null); }}>移除记录</button></footer></Modal>}
  </section>;
}

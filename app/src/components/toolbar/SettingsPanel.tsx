import { useEffect, useRef, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { ArrowDownToLine, ChevronRight, Database, Info, ListTodo, Palette, Sparkles, X } from 'lucide-react';
import { useAppStoreShallow, waitForAppSave } from '../../state/appStore';
import { useDownloadStore } from '../../state/downloadStore';
import type { Settings } from '../../types';
import { UpdateSettings } from './UpdateSettings';
import { AISettingsContent } from '../notes/AISettingsModal';
import { DownloadPreferences } from '../downloads/DownloadCenter';
import { openNoteImageFolder } from '../../utils/noteImages';
import './SettingsPanel.css';

const tabs = [
    { key: 'appearance', label: '通用与外观', icon: Palette, description: '主题、字号与窗口关闭方式。修改后自动保存。' },
    { key: 'tasks', label: '待办与提醒', icon: ListTodo, description: '任务显示、到期提醒与回收站。修改后自动保存。' },
    { key: 'ai', label: 'AI 配置', icon: Sparkles, description: '随记生成待办和周报共用这些接口。填写后点击“保存并选中”。' },
    { key: 'downloads', label: '下载', icon: ArrowDownToLine, description: '保存目录、常用目录与下载速度。修改后点击“保存设置”。' },
    { key: 'data', label: '数据与同步', icon: Database, description: '数据位置、导入导出、本地备份与远程同步。' },
    { key: 'about', label: '关于与更新', icon: Info, description: '版本信息、更新服务与使用说明。' },
] as const;
export type SettingsTab = typeof tabs[number]['key'];

interface SettingsPanelProps {
    initialTab: SettingsTab;
    onClose: () => void;
    onImport: () => void;
    onExport: () => void;
    onBackup: () => void;
    onCloudSync: () => void;
    onRecurringTasks: () => void;
}

const themes = [
    { key: 'blue', name: '经典蓝', color: '#2563eb' }, { key: 'green', name: '清新绿', color: '#059669' },
    { key: 'purple', name: '优雅紫', color: '#7c3aed' }, { key: 'orange', name: '活力橙', color: '#ea580c' },
    { key: 'mono', name: '极简黑', color: '#171717' }, { key: 'sky', name: '天空蓝', color: '#0284c7' },
    { key: 'rose', name: '樱花粉', color: '#e11d48' }, { key: 'indigo', name: '深邃靛', color: '#4f46e5' },
] as const;

function SettingAction({ title, description, onClick }: { title: string; description: string; onClick: () => void }) {
    return <button className="settings-action" onClick={onClick}><span><strong>{title}</strong><small>{description}</small></span><ChevronRight size={17} aria-hidden="true" /></button>;
}

export function SettingsPanel({ initialTab, onClose, onImport, onExport, onBackup, onCloudSync, onRecurringTasks }: SettingsPanelProps) {
    const { settings, setSettings } = useAppStoreShallow(state => ({ settings: state.settings, setSettings: state.setSettings }));
    const downloadBusy = useDownloadStore(state => state.busy);
    const downloadsLoaded = useDownloadStore(state => state.loaded);
    const [activeTab, setActiveTab] = useState(initialTab);
    const [visited, setVisited] = useState<Set<SettingsTab>>(() => new Set([initialTab]));
    const [dataDirectory, setDataDirectory] = useState('');
    const [closeAction, setCloseAction] = useState(() => localStorage.getItem('closeAction') ?? 'ask');
    const [saving, setSaving] = useState(false);
    const [aiSaving, setAISaving] = useState(false);
    const [saveError, setSaveError] = useState('');
    const panel = useRef<HTMLDivElement>(null);
    const content = useRef<HTMLDivElement>(null);
    const locked = saving || aiSaving || downloadBusy;
    const current = tabs.find(tab => tab.key === activeTab)!;

    useEffect(() => {
        if (activeTab === 'data' && isTauri()) {
            void invoke<string>('get_data_directory').then(setDataDirectory)
                .catch(() => setDataDirectory('路径读取失败，请点击打开文件夹重试'));
        }
    }, [activeTab]);

    useEffect(() => {
        const previous = document.activeElement as HTMLElement | null;
        panel.current?.querySelector<HTMLElement>('[aria-selected=true]')?.focus();
        return () => { if (previous?.isConnected) previous.focus(); };
    }, []);

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            // Child dialogs own Escape and keyboard focus until they are dismissed.
            const childOpen = [...document.querySelectorAll<HTMLElement>('.create-overlay:not(.settings-overlay), dialog[open]')]
                .some(element => element.getClientRects().length > 0);
            if (childOpen || event.defaultPrevented) return;
            if (event.key === 'Escape') { event.preventDefault(); if (!locked) onClose(); }
            if (event.key !== 'Tab') return;
            const focusable = [...(panel.current?.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href], [tabindex="0"]') ?? [])]
                .filter(element => !element.matches(':disabled, [tabindex="-1"]') && element.getClientRects().length > 0);
            const target = event.shiftKey ? focusable.at(-1) : focusable[0];
            const boundary = event.shiftKey ? focusable[0] : focusable.at(-1);
            if (document.activeElement === boundary || !panel.current?.contains(document.activeElement)) { event.preventDefault(); target?.focus(); }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [locked, onClose]);

    const selectTab = (tab: SettingsTab) => { setVisited(previous => new Set(previous).add(tab)); setActiveTab(tab); if (content.current) content.current.scrollTop = 0; };
    const save = async (patch: Partial<Settings>) => {
        setSaveError(''); setSaving(true);
        try { setSettings(patch); await waitForAppSave(); }
        catch { setSaveError('设置保存失败，请检查数据目录或可用空间后重试。'); }
        finally { setSaving(false); }
    };
    const openFolder = async (attachments = false) => {
        try { if (attachments) await openNoteImageFolder(); else await invoke('open_data_directory'); }
        catch (error) { setSaveError(`无法打开文件夹：${String(error)}`); }
    };

    return <div className="create-overlay settings-overlay">
        <div ref={panel} className="settings-center" role="dialog" aria-modal="true" aria-labelledby="settings-title">
            <header className="settings-header"><div><h2 id="settings-title">设置</h2><p>待办、随记和下载的统一设置</p></div>
                <button className="settings-close" aria-label="关闭设置" disabled={locked} onClick={onClose}><X size={20} /></button></header>
            <div className="settings-layout">
                <nav className="settings-nav" role="tablist" aria-label="设置分类" aria-orientation="vertical">
                    {tabs.map(({ key, label, icon: TabIcon }, index) => <button key={key} id={`settings-tab-${key}`} role="tab" aria-selected={activeTab === key}
                        aria-controls={`settings-page-${key}`} tabIndex={activeTab === key ? 0 : -1} onClick={() => selectTab(key)}
                        onKeyDown={event => {
                            if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
                            event.preventDefault();
                            const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + tabs.length) % tabs.length;
                            selectTab(tabs[next].key); document.getElementById(`settings-tab-${tabs[next].key}`)?.focus();
                        }}><TabIcon size={17} aria-hidden="true" />{label}</button>)}
                </nav>
                <div ref={content} className="settings-content">
                    <div className="settings-section-heading"><h3>{current.label}</h3><p>{current.description}</p></div>
                    {saveError && <p className="settings-error" role="alert">{saveError}</p>}
                    {tabs.map(({ key }) => <section key={key} id={`settings-page-${key}`} role="tabpanel" aria-labelledby={`settings-tab-${key}`} hidden={key !== activeTab}>
                        {key === 'appearance' && <fieldset className="settings-fields" disabled={saving}>
                            <section className="settings-card"><h4>主题色</h4><div className="settings-themes">{themes.map(theme => <button key={theme.key} aria-pressed={settings.colorScheme === theme.key}
                                onClick={() => void save({ colorScheme: theme.key })}><span style={{ background: theme.color }} />{theme.name}</button>)}</div></section>
                            <section className="settings-card"><h4>任务列表字号</h4><div className="settings-choices">{[{ value: 12, label: '小' }, { value: 13, label: '中' }, { value: 14, label: '大' }].map(size => <button key={size.value}
                                aria-pressed={(settings.listFontSize ?? 13) === size.value} onClick={() => void save({ listFontSize: size.value })}>{size.label} · {size.value}px</button>)}</div></section>
                            <section className="settings-card"><h4>关闭窗口时</h4><p>选择点击窗口关闭按钮后的行为。</p><div className="settings-choices">
                                {[{ key: 'ask', label: '每次询问' }, { key: 'minimize', label: '最小化到托盘' }, { key: 'exit', label: '直接退出' }].map(option => <button key={option.key} aria-pressed={closeAction === option.key} onClick={() => {
                                    try { if (option.key === 'ask') localStorage.removeItem('closeAction'); else localStorage.setItem('closeAction', option.key); setCloseAction(option.key); }
                                    catch { setSaveError('窗口关闭方式保存失败，请重试。'); }
                                }}>{option.label}</button>)}</div></section>
                        </fieldset>}
                        {key === 'tasks' && <fieldset className="settings-fields" disabled={saving}>
                            <label className="settings-switch"><span><strong>任务高亮</strong><small>按任务状态显示行背景色</small></span><input type="checkbox" role="switch" checked={settings.highlightRows ?? false} onChange={event => void save({ highlightRows: event.target.checked })} /></label>
                            <label className="settings-switch"><span><strong>启动时提醒到期任务</strong><small>应用启动时自动弹出到期任务提醒</small></span><input type="checkbox" role="switch" checked={settings.dueReminderEnabled !== false} onChange={event => void save({ dueReminderEnabled: event.target.checked })} /></label>
                            {settings.dueReminderSnoozeUntil && new Date(settings.dueReminderSnoozeUntil) > new Date() && <div className="settings-card"><p>提醒已暂停至 {new Date(settings.dueReminderSnoozeUntil).toLocaleDateString('zh-CN')}</p><button className="btn btn-light" onClick={() => void save({ dueReminderSnoozeUntil: undefined })}>恢复提醒</button></div>}
                            <section className="settings-card"><h4>回收站自动清理</h4><p>保留所选天数内的任务。缩短期限会清理已超期的回收站任务。</p><div className="settings-choices">
                                {[{ value: 7, label: '7 天' }, { value: 30, label: '30 天' }, { value: 60, label: '60 天' }, { value: 90, label: '90 天' }, { value: 365, label: '1 年' }, { value: 99999, label: '永久' }].map(option => <button key={option.value}
                                    aria-pressed={(settings.trashRetentionDays ?? 30) === option.value} onClick={() => void save({ trashRetentionDays: option.value })}>{option.label}</button>)}</div></section>
                            <SettingAction title="周期任务" description="管理重复执行的任务模板" onClick={onRecurringTasks} />
                        </fieldset>}
                        {key === 'ai' && visited.has(key) && <AISettingsContent onSavingChange={setAISaving} />}
                        {key === 'downloads' && visited.has(key) && (downloadsLoaded ? <DownloadPreferences /> : <p role="status">正在读取下载设置…</p>)}
                        {key === 'data' && <div className="settings-fields">
                            {isTauri() ? <><SettingAction title="数据存储位置" description={dataDirectory || '系统“文档”文件夹 / ProjectTodo（点击打开）'} onClick={() => void openFolder()} />
                                <SettingAction title="附件存储位置" description={dataDirectory ? `${dataDirectory}\\attachments（点击打开）` : 'ProjectTodo / attachments（点击打开）'} onClick={() => void openFolder(true)} /></>
                                : <div className="settings-card"><h4>数据存储位置</h4><p>网页预览：数据保存在当前浏览器，与 EXE 版独立。</p></div>}
                            <div className="settings-data-help"><p>data.json 保存任务、随记正文和附件引用；EXE 版的图片与文件保存在 attachments 目录。</p><p>网络图片和链接只保存网址，离线时可能无法查看。支持粘贴、拖入和选择插入图片及任意格式文件，不设单文件大小上限。</p><p>迁移时请使用包含附件的“本地备份”，或复制整个数据目录。旧图片迁移前会自动备份，原 images 目录保留。</p></div>
                            <SettingAction title="导入任务" description="从导出的 JSON 文件导入任务和周期任务" onClick={onImport} />
                            <SettingAction title="导出任务" description="将任务导出为 CSV、Markdown 或 JSON 文件" onClick={onExport} />
                            <SettingAction title="本地备份" description="备份或恢复应用数据与附件" onClick={onBackup} />
                            <SettingAction title="远程同步" description="同步数据到 SMB/SSH 服务器" onClick={onCloudSync} />
                        </div>}
                        {key === 'about' && visited.has(key) && <><UpdateSettings /><section className="settings-card settings-credits"><h4>关于 ProjectTodo</h4><p>作者：网络服务处 罗发文 (luo.fawen@zte.com.cn)</p><p>特别鸣谢：本软件在测试与完善过程中，得到了以下领导和同事的大力支持与专业指导，在此一并表示诚挚感谢：</p><p>莫佳运、罗备、杨帅、李良泳、张夕淳、贾君、王阳、戈少贤、桂树奇</p></section></>}
                    </section>)}
                </div>
            </div>
        </div>
    </div>;
}

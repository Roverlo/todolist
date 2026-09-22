import { useEffect, useRef, useState } from 'react';
import { CalendarDays, CheckCircle2, ChevronDown, ChevronUp, Circle, Clock3, History, Info, Link2, Package, RefreshCw, RotateCcw, Save, Server, Settings2 } from 'lucide-react';
import { useAppStore, useAppStoreShallow, waitForAppSave } from '../../state/appStore';
import { BUILD_TIME, checkForUpdate, CURRENT_VERSION, DEFAULT_UPDATE_SERVER, getAllVersions, normalizeUpdateServer, type UpdateInfo } from '../../utils/updateChecker';
import { setUpdatePreferences } from '../../utils/updatePreferences';
import { UpdateModal } from './UpdateModal';
import { VersionListModal } from './VersionListModal';
import './UpdateSettings.css';

export function UpdateSettings() {
    const config = useAppStoreShallow(state => state.settings.updateCheck);
    const serverUrl = config?.serverUrl ?? DEFAULT_UPDATE_SERVER;
    const [draft, setDraft] = useState(serverUrl);
    const [expanded, setExpanded] = useState(true);
    const [fieldError, setFieldError] = useState('');
    const [feedback, setFeedback] = useState('尚未测试');
    const [checkMessage, setCheckMessage] = useState('');
    const [pending, setPending] = useState<'test' | 'check' | 'save' | null>(null);
    const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
    const [historyOpen, setHistoryOpen] = useState(false);
    const request = useRef<AbortController | null>(null);
    const saveSequence = useRef(0);
    const input = useRef<HTMLInputElement>(null);
    useEffect(() => () => request.current?.abort(), []);

    const edit = (value: string) => {
        saveSequence.current++;
        request.current?.abort();
        setPending(null);
        setDraft(value);
        setFieldError('');
        setFeedback('尚未测试');
    };
    const validate = () => {
        try { const normalized = normalizeUpdateServer(draft); setFieldError(''); return normalized; }
        catch (error) { setFieldError((error as Error).message); return null; }
    };
    const test = async () => {
        const address = validate();
        if (!address) { input.current?.focus(); return; }
        request.current?.abort();
        const controller = new AbortController();
        request.current = controller;
        setPending('test');
        setFeedback('正在连接…');
        const result = await getAllVersions(address, controller.signal);
        if (controller.signal.aborted) return;
        setPending(null);
        setFeedback(result.error ?? (result.versionsInfo?.versions.length
            ? `连接成功 · 最新版本 ${result.versionsInfo.latest}` : '连接成功 · 暂无已发布版本'));
    };
    const save = async () => {
        const address = validate();
        if (!address) { input.current?.focus(); return; }
        request.current?.abort();
        const sequence = ++saveSequence.current;
        setPending('save');
        setUpdatePreferences({ serverUrl: address, ...(address !== serverUrl ? { skipVersion: undefined, lastCheckAt: undefined } : {}) });
        setDraft(address);
        setCheckMessage('');
        try { await waitForAppSave(); if (saveSequence.current === sequence) setFeedback('地址已保存'); }
        catch {
            if (useAppStore.getState().settings.updateCheck?.serverUrl === address) {
                setUpdatePreferences({ serverUrl, skipVersion: config?.skipVersion, lastCheckAt: config?.lastCheckAt });
            }
            if (saveSequence.current === sequence) setFeedback('地址保存失败，请检查数据目录或可用空间后重试');
        } finally { if (saveSequence.current === sequence) setPending(null); }
    };
    const check = async () => {
        request.current?.abort();
        const controller = new AbortController();
        request.current = controller;
        setPending('check');
        setCheckMessage('');
        const result = await checkForUpdate(CURRENT_VERSION, serverUrl, controller.signal);
        if (controller.signal.aborted) return;
        setPending(null);
        if (result.error) setCheckMessage(result.error);
        else {
            setUpdatePreferences({ lastCheckAt: new Date().toISOString() });
            if (result.updateInfo) setUpdateInfo(result.updateInfo);
            else setCheckMessage('当前已是最新版本');
        }
    };

    return <div className="update-about-layout">
        <section className="update-main" aria-label="版本与更新">
            <h3>版本与更新</h3>
            <div className="update-current"><Package size={25} aria-hidden="true" /><div>
                <span>当前版本</span><strong>{CURRENT_VERSION}</strong>
                <small>构建于 {new Date(BUILD_TIME).toLocaleString()}</small>
            </div></div>
            <div className="update-actions">
                <button className="update-primary" disabled={pending !== null} onClick={() => void check()}><RefreshCw size={16} aria-hidden="true" />{pending === 'check' ? '检查中…' : '检查更新'}</button>
                <button onClick={() => setHistoryOpen(true)}><History size={16} aria-hidden="true" />历史版本</button>
            </div>
            {checkMessage && <p className="update-check-message" role="status">{checkMessage}</p>}
            <section className="update-source">
                <div className="update-source-heading"><Server size={18} aria-hidden="true" /><h4>更新服务器</h4>
                    <span className="update-source-badge">{serverUrl === DEFAULT_UPDATE_SERVER ? 'VPS03 默认' : '自定义'}</span>
                    <button className="update-disclosure" aria-expanded={expanded} aria-controls="update-server-editor" onClick={() => setExpanded(!expanded)}>编辑地址{expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</button>
                </div>
                {expanded && <div id="update-server-editor" className="update-server-editor">
                    <label htmlFor="update-server-url">服务器地址</label>
                    <input ref={input} id="update-server-url" type="url" value={draft} spellCheck={false} autoComplete="off"
                        aria-invalid={!!fieldError} aria-describedby="update-server-feedback"
                        onChange={event => edit(event.target.value)} onBlur={validate}
                        onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); save(); } }} />
                    <div className="update-actions">
                        <button disabled={pending !== null} onClick={() => void test()}><Link2 size={15} aria-hidden="true" />{pending === 'test' ? '连接中…' : '测试连接'}</button>
                        <button onClick={() => { edit(DEFAULT_UPDATE_SERVER); setFeedback('已填入默认地址，保存后生效'); }}><RotateCcw size={15} aria-hidden="true" />恢复默认</button>
                        <button className="update-primary" disabled={pending === 'save'} onClick={() => void save()}><Save size={15} aria-hidden="true" />{pending === 'save' ? '保存中…' : '保存'}</button>
                    </div>
                    <p id="update-server-feedback" className={fieldError ? 'update-feedback update-error' : 'update-feedback'} role="status">{fieldError || feedback}</p>
                </div>}
            </section>
            <div className="update-option"><Settings2 size={20} aria-hidden="true" /><div><label htmlFor="update-startup">启动时检查更新</label><small>应用启动时自动检查新版本</small></div>
                <input id="update-startup" type="checkbox" role="switch" checked={config?.checkOnStartup ?? true} onChange={event => setUpdatePreferences({ checkOnStartup: event.target.checked })} />
            </div>
            <div className="update-option"><Clock3 size={20} aria-hidden="true" /><div><label htmlFor="update-periodic">定时检查更新</label><small>按设定的时间间隔自动检查</small></div>
                <input id="update-periodic" type="checkbox" role="switch" checked={config?.autoCheck ?? true} onChange={event => setUpdatePreferences({ autoCheck: event.target.checked })} />
                <select aria-label="检查间隔" disabled={!(config?.autoCheck ?? true)} value={config?.checkInterval ?? 60} onChange={event => setUpdatePreferences({ checkInterval: Number(event.target.value) })}>
                    <option value={10}>每 10 分钟</option><option value={30}>每 30 分钟</option><option value={60}>每 1 小时</option><option value={120}>每 2 小时</option><option value={240}>每 4 小时</option><option value={1440}>每天一次</option>
                </select>
            </div>
            {config?.lastCheckAt && <p className="update-last-check">上次检查：{new Date(config.lastCheckAt).toLocaleString()}</p>}
            <p className="update-portable-note"><Info size={15} aria-hidden="true" />下载新版 EXE，关闭旧版后替换，数据保留。</p>
        </section>
        <aside className="update-sort-help" aria-label="排序逻辑"><h3>排序逻辑</h3>
            <div><Circle size={16} className="update-urgent" aria-hidden="true" /><p><strong>紧急区：逾期 / 今日到期</strong><small>已逾期或在今天到期的任务</small></p></div>
            <div><CalendarDays size={16} className="update-planned" aria-hidden="true" /><p><strong>规划区：未来到期</strong><small>未来日期的任务</small></p></div>
            <div><Circle size={16} aria-hidden="true" /><p><strong>待定区：无截止日期</strong><small>没有设置截止日期的任务</small></p></div>
            <div className="update-completed-help"><CheckCircle2 size={16} aria-hidden="true" /><p><strong>已完成自动沉底</strong><small>已完成的任务会自动移到列表底部</small></p></div>
        </aside>
        {updateInfo && <UpdateModal open onClose={() => setUpdateInfo(null)} updateInfo={updateInfo} />}
        <VersionListModal open={historyOpen} onClose={() => setHistoryOpen(false)} serverUrl={serverUrl} />
    </div>;
}

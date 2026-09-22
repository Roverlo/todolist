import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Copy, FileText, LoaderCircle, RefreshCw, Save } from 'lucide-react';
import dayjs from 'dayjs';
import { useAppStore, waitForAppSave } from '../../state/appStore';
import { createAIProvider } from '../../services/ai';
import { WEEKLY_REPORT_PROMPT, parseWeeklyReport, reportAsHtml, weeklyReportInput, type WeeklyReportSource } from '../../utils/weeklyReport';
import { AISettingsModal } from './AISettingsModal';
import './WeeklyReportPanel.css';

export function WeeklyReportPanel({ source, onBack }: { source: WeeklyReportSource; onBack: () => void }) {
    const request = useRef<AbortController | null>(null);
    const savedId = useRef<string | null>(null);
    const [report, setReport] = useState('');
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [settingsOpen, setSettingsOpen] = useState(false);
    const settings = useAppStore(state => state.settings.ai);
    const profile = settings?.providers.find(provider => provider.id === settings.activeProviderId);
    const configured = Boolean(profile?.apiKey?.trim() && profile?.model?.trim() && profile?.apiEndpoint?.trim());
    const title = `周报 ${source.start} — ${source.end}`;

    const generate = useCallback(async () => {
        if (request.current || !source.sources.length) return;
        const settings = useAppStore.getState().settings.ai;
        const config = settings?.providers.find(provider => provider.id === settings.activeProviderId);
        if (!config?.apiKey?.trim() || !config.model?.trim() || !config.apiEndpoint?.trim()) return;
        const controller = new AbortController();
        request.current = controller;
        const timeout = window.setTimeout(() => controller.abort('timeout'), 120000);
        setLoading(true); setError(''); setNotice('');
        try {
            const response = await createAIProvider({ ...config, apiKey: config.apiKey }).generateJson<unknown>(WEEKLY_REPORT_PROMPT, weeklyReportInput(source), controller.signal);
            if (controller.signal.aborted || request.current !== controller) return;
            setReport(parseWeeklyReport(response));
        } catch (failure) {
            if (request.current !== controller) return;
            if (controller.signal.reason === 'timeout') setError('生成超时，请重试或检查 AI 设置。');
            else if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : '周报生成失败，请重试。');
        } finally {
            window.clearTimeout(timeout);
            if (request.current === controller) { request.current = null; setLoading(false); }
        }
    }, [source]);

    useEffect(() => {
        // Defer the initial request so React's development effect probe cannot send it twice.
        const start = window.setTimeout(() => void generate(), 0);
        return () => {
            window.clearTimeout(start);
            request.current?.abort(); request.current = null;
        };
    }, [generate]);

    const cancel = () => { request.current?.abort(); request.current = null; setLoading(false); setNotice('已取消生成'); };
    const save = async () => {
        if (!report.trim() || loading || saving) return;
        setSaving(true); setError('');
        try {
            const store = useAppStore.getState();
            const content = reportAsHtml(report);
            if (savedId.current) store.updateNote(savedId.current, { content });
            else savedId.current = store.addNote({ title, content, date: dayjs().format('YYYY-MM-DD'), kind: 'weekly-report' }).id;
            await waitForAppSave();
            store.setSelectedNoteId(savedId.current);
            setNotice('已保存为随记');
        } catch (failure) {
            setError(failure instanceof Error ? failure.message : '保存失败，周报仍保留在这里，请重试。');
        } finally { setSaving(false); }
    };

    return <section className="ai-panel weekly-report-panel" aria-labelledby="weekly-report-title">
        <header className="weekly-report-header">
            <div><h2 id="weekly-report-title"><FileText size={20} aria-hidden="true" />本周周报</h2><p>{source.start} — {source.end}</p></div>
            <button type="button" className="weekly-report-back" disabled={saving} onClick={onBack}><ArrowLeft size={14} />返回待办</button>
        </header>
        <div className="weekly-report-body">
            <div className="weekly-report-summary"><span><b>{source.sources.length}</b> 篇随记</span><span><b>{source.completed}</b> 项本周勾选完成</span></div>
            <details className="weekly-report-sources"><summary>查看本次使用的随记</summary>
                <p>汇总点击生成时的本周随记，包含当前草稿。旧事项按完成时间区分；图片和附件不参与生成。</p>
                <ul>{source.sources.map(note => <li key={note.id}><span>{note.title}{note.draft ? '（含当前草稿）' : ''}</span><time>{dayjs(note.updatedAt).format('MM-DD HH:mm')}</time></li>)}</ul>
                {source.undatedCompleted > 0 && <p>{source.undatedCompleted} 项已勾选但未记录完成时间，会在周报中明确说明。</p>}
            </details>
            {!source.sources.length ? <div className="weekly-report-empty"><FileText size={28} /><strong>本周还没有可汇总的随记</strong><p>本周编辑过且有文字的随记会出现在这里，已删除的随记和已生成的周报不参与。</p></div>
                : !configured ? <div className="weekly-report-empty"><strong>先配置用于生成周报的 AI</strong><p>周报与待办提取使用同一个 AI 接口。</p><button className="btn btn-primary" onClick={() => setSettingsOpen(true)}>配置 AI</button></div>
                : <><div className="weekly-report-label"><label htmlFor="weekly-report-content">周报正文</label><span>生成后可直接修改</span></div>
                    {loading && <div className="weekly-report-loading" role="status"><LoaderCircle size={18} className="weekly-report-spinner" />正在整理本周记录…<button onClick={cancel}>取消生成</button></div>}
                    <textarea id="weekly-report-content" value={report} disabled={loading || saving} placeholder="周报将按本周完成、工作进展、问题及风险、下周计划整理。"
                        onChange={event => { setReport(event.target.value); setNotice(''); }} />
                </>}
            {error && <p className="weekly-report-error" role="alert">{error}</p>}
            {notice && <p className="weekly-report-notice" role="status">{notice}</p>}
        </div>
        <footer className="weekly-report-footer">
            <button className="btn btn-light" onClick={() => void generate()} disabled={!configured || !source.sources.length || loading || saving}><RefreshCw size={15} />{report ? '重新生成' : error ? '重试生成' : '生成周报'}</button>
            <button className="btn btn-light" disabled={!report.trim() || loading || saving} onClick={() => {
                void navigator.clipboard.writeText(report).then(() => setNotice('已复制周报'), () => setError('复制失败，请选中周报正文后手动复制。'));
            }}><Copy size={15} />复制周报</button>
            <button className="btn btn-primary" disabled={!report.trim() || loading || saving} onClick={() => void save()}><Save size={15} />{saving ? '正在保存…' : '保存为随记'}</button>
        </footer>
        {settingsOpen && <AISettingsModal onClose={() => setSettingsOpen(false)} />}
    </section>;
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, Copy, FileText, LoaderCircle, RefreshCw, Save } from 'lucide-react';
import dayjs from 'dayjs';
import { useAppStore, waitForAppSave } from '../../state/appStore';
import { createAIProvider } from '../../services/ai';
import { WEEKLY_REPORT_PROMPT, currentReportWeek, reportPeriodError, parseWeeklyReport, reportAsHtml, weeklyReportInput, type WeeklyReportSource, type ReportPeriod } from '../../utils/weeklyReport';
import { AISettingsModal } from './AISettingsModal';
import './WeeklyReportPanel.css';

export function WeeklyReportPanel({ source, autoGenerate, onGenerate, onPeriodChange }: { source: WeeklyReportSource; autoGenerate: boolean; onGenerate: () => void; onPeriodChange: (period: ReportPeriod) => void }) {
    const request = useRef<AbortController | null>(null);
    const savedReport = useRef<{ id: string; title: string } | null>(null);
    const dateToggle = useRef<HTMLButtonElement>(null);
    const [periodOpen, setPeriodOpen] = useState(false);
    const [periodDraft, setPeriodDraft] = useState<ReportPeriod>({ start: source.start, end: source.end });
    const [reportPeriod, setReportPeriod] = useState<ReportPeriod | null>(null);
    const [report, setReport] = useState('');
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [sourcesOpen, setSourcesOpen] = useState(false);
    const settings = useAppStore(state => state.settings.ai);
    const profile = settings?.providers.find(provider => provider.id === settings.activeProviderId);
    const configured = Boolean(profile?.apiKey?.trim() && profile?.model?.trim() && profile?.apiEndpoint?.trim());
    const title = `周报 ${reportPeriod?.start ?? source.start} — ${reportPeriod?.end ?? source.end}`;
    const periodError = reportPeriodError(periodDraft);
    const staleReport = report && reportPeriod && (reportPeriod.start !== source.start || reportPeriod.end !== source.end);
    const closePeriod = () => { setPeriodOpen(false); dateToggle.current?.focus(); };

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
            setReportPeriod({ start: source.start, end: source.end });
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
        if (!autoGenerate) return;
        // Defer the initial request so React's development effect probe cannot send it twice.
        const start = window.setTimeout(() => void generate(), 0);
        return () => {
            window.clearTimeout(start);
            request.current?.abort(); request.current = null;
        };
    }, [generate, autoGenerate]);

    const cancel = () => { request.current?.abort(); request.current = null; setLoading(false); setNotice('已取消生成'); };
    const save = async () => {
        if (!report.trim() || loading || saving) return;
        setSaving(true); setError('');
        try {
            const store = useAppStore.getState();
            const content = reportAsHtml(report);
            if (savedReport.current?.title === title) store.updateNote(savedReport.current.id, { content });
            else savedReport.current = { id: store.addNote({ title, content, date: dayjs().format('YYYY-MM-DD'), kind: 'weekly-report' }).id, title };
            await waitForAppSave();
            store.setSelectedNoteId(savedReport.current.id);
            setNotice('已保存为随记');
        } catch (failure) {
            setError(failure instanceof Error ? failure.message : '保存失败，周报仍保留在这里，请重试。');
        } finally { setSaving(false); }
    };

    return <section className="ai-panel weekly-report-panel" aria-labelledby="weekly-report-title">
        <header className="weekly-report-header">
            <h2 id="weekly-report-title"><FileText size={18} aria-hidden="true" />工作周报</h2>
            <button ref={dateToggle} type="button" className="weekly-report-dates" disabled={saving} aria-label={`选择周报日期：${source.start} 至 ${source.end}`}
                aria-expanded={periodOpen} aria-controls="weekly-report-period" title="选择统计日期" onClick={() => {
                    if (!periodOpen) setPeriodDraft({ start: source.start, end: source.end });
                    setPeriodOpen(open => !open);
                }}>{source.start.replaceAll('-', '.')} — {source.end.replaceAll('-', '.')}<ChevronDown size={13} aria-hidden="true" /></button>
        </header>
        <div className="weekly-report-body">
            {periodOpen && <form id="weekly-report-period" className="weekly-report-period" aria-label="周报统计日期" onKeyDown={event => {
                if (event.key === 'Escape') { event.preventDefault(); closePeriod(); }
            }} onSubmit={event => {
                event.preventDefault();
                if (periodError || saving) return;
                if (periodDraft.start !== source.start || periodDraft.end !== source.end) {
                    request.current?.abort(); request.current = null; setLoading(false); setError(''); setNotice('');
                    onPeriodChange(periodDraft);
                }
                closePeriod();
            }}>
                <div className="weekly-report-period-fields">
                    <label>开始日期<input type="date" value={periodDraft.start} min="0001-01-01" max="9999-12-31" required autoFocus
                        aria-invalid={Boolean(periodError)} aria-describedby={periodError ? 'weekly-report-period-error' : undefined}
                        onChange={event => setPeriodDraft(period => ({ ...period, start: event.target.value }))} /></label>
                    <label>结束日期<input type="date" value={periodDraft.end} min="0001-01-01" max="9999-12-31" required
                        aria-invalid={Boolean(periodError)} aria-describedby={periodError ? 'weekly-report-period-error' : undefined}
                        onChange={event => setPeriodDraft(period => ({ ...period, end: event.target.value }))} /></label>
                </div>
                {periodError && <p id="weekly-report-period-error" className="weekly-report-error" role="alert">{periodError}</p>}
                <div className="weekly-report-period-actions">
                    <button type="button" className="btn btn-light" onClick={() => setPeriodDraft(currentReportWeek())}>本周</button>
                    <button type="button" className="btn btn-light" onClick={() => setPeriodDraft(currentReportWeek(dayjs().subtract(7, 'day').valueOf()))}>上周</button>
                    <button type="submit" className="btn btn-primary" disabled={Boolean(periodError) || saving}>应用日期</button>
                </div>
            </form>}
            <div className="weekly-report-meta">
                <span className="weekly-report-summary">{source.sources.length} 篇随记 · {source.completed} 项期间完成</span>
                <button type="button" className="weekly-report-source-toggle" aria-expanded={sourcesOpen} aria-controls="weekly-report-sources" onClick={() => setSourcesOpen(value => !value)}>查看来源<ChevronDown size={14} aria-hidden="true" /></button>
            </div>
            <div id="weekly-report-sources" className="weekly-report-sources" hidden={!sourcesOpen}>
                <p>汇总所选日期内编辑的随记，包含起止当天；当前草稿仅在今天属于该范围时参与。素材为当前正文，旧事项按完成时间区分，图片和附件不参与生成。</p>
                <ul>{source.sources.map(note => <li key={note.id}><span>{note.title}{note.draft ? '（含当前草稿）' : ''}</span><time>{dayjs(note.updatedAt).format('MM-DD HH:mm')}</time></li>)}</ul>
                {source.undatedCompleted > 0 && <p>{source.undatedCompleted} 项已勾选但未记录完成时间，会在周报中明确说明。</p>}
            </div>
            {!source.sources.length && <div className="weekly-report-empty"><FileText size={28} /><strong>所选日期内没有可汇总的随记</strong><p>请选择其他日期；已删除的随记和已生成的周报不参与。</p></div>}
            {source.sources.length > 0 && !configured && <div className="weekly-report-empty"><strong>先配置用于生成周报的 AI</strong><p>周报与待办提取使用同一个 AI 接口。</p><button className="btn btn-primary" onClick={() => setSettingsOpen(true)}>配置 AI</button></div>}
            {staleReport && <p className="weekly-report-notice" role="status">日期已切换，下方保留的是 {reportPeriod.start} 至 {reportPeriod.end} 的周报；请重新生成以更新。</p>}
            {(report || (source.sources.length > 0 && configured)) && <><div className="weekly-report-label"><label htmlFor="weekly-report-content">周报正文</label><span>可直接修改</span></div>
                {loading && <div className="weekly-report-loading" role="status"><LoaderCircle size={18} className="weekly-report-spinner" />正在整理所选日期的记录…<button onClick={cancel}>取消生成</button></div>}
                <textarea id="weekly-report-content" value={report} disabled={loading || saving} placeholder="周报将按本期完成、工作进展、问题及风险、后续计划整理。"
                    onChange={event => { if (!report.trim()) setReportPeriod({ start: source.start, end: source.end }); setReport(event.target.value); setNotice(''); }} />
            </>}
            {error && <p className="weekly-report-error" role="alert">{error}</p>}
            {notice && <p className="weekly-report-notice" role="status">{notice}</p>}
        </div>
        <footer className="weekly-report-footer">
            <button className="btn btn-light" onClick={onGenerate} disabled={!configured || !source.sources.length || loading || saving}><RefreshCw size={15} />{report ? '重新生成' : error ? '重试生成' : '生成周报'}</button>
            <button className="btn btn-light" disabled={!report.trim() || loading || saving} onClick={() => {
                void navigator.clipboard.writeText(report).then(() => setNotice('已复制周报'), () => setError('复制失败，请选中周报正文后手动复制。'));
            }}><Copy size={15} />复制周报</button>
            <button className="btn btn-primary" disabled={!report.trim() || loading || saving} onClick={() => void save()}><Save size={15} />{saving ? '正在保存…' : '保存为随记'}</button>
        </footer>
        {settingsOpen && <AISettingsModal onClose={() => setSettingsOpen(false)} />}
    </section>;
}

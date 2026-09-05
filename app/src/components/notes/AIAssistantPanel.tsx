import { useState, useEffect, useRef, useMemo } from 'react';
import { LoaderCircle, Settings, ArrowRight } from 'lucide-react';
import dayjs from 'dayjs';
import { nanoid } from 'nanoid';
import { Icon } from '../ui/Icon';
import type { Note, AIGeneratedTask, Subtask, RecurringTemplate } from '../../types';
import { useAppStore } from '../../state/appStore';
import { getNoteDate, isNoteDate } from '../../utils/noteDate';
import { createAIProvider } from '../../services/ai';
import { SYSTEM_PROMPT_TASK_EXTRACTION } from '../../services/ai/prompts';
import { TaskPreviewCard } from './TaskPreviewCard';
import { AISettingsModal } from './AISettingsModal';
import { noteTextForAI, parseGeneratedTasks } from '../../utils/noteAI';

// 解析周期提示为 schedule 对象
function parseRecurringHint(hint: string | undefined): RecurringTemplate['schedule'] | null {
    if (!hint) return null;

    const h = hint.toLowerCase().trim();

    // 每日
    if (h.includes('每日') || h.includes('每天') || h === 'daily') {
        return { type: 'daily' };
    }

    // 每周 + 星期几
    const weekdayMap: Record<string, number> = {
        '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 0, '天': 0,
        'monday': 1, 'tuesday': 2, 'wednesday': 3, 'thursday': 4, 'friday': 5, 'saturday': 6, 'sunday': 0,
        'mon': 1, 'tue': 2, 'wed': 3, 'thu': 4, 'fri': 5, 'sat': 6, 'sun': 0
    };

    // 匹配 "每周五"、"每周一"、"周五" 等
    const weeklyMatch = h.match(/(?:每)?周([一二三四五六日天])/);
    if (weeklyMatch) {
        const day = weekdayMap[weeklyMatch[1]] ?? 1;
        return { type: 'weekly', daysOfWeek: [day] };
    }

    // 英文 weekly 匹配
    const weeklyEnMatch = h.match(/(?:every\s+)?(?:week(?:ly)?(?:\s+on)?\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)/i);
    if (weeklyEnMatch) {
        const day = weekdayMap[weeklyEnMatch[1].toLowerCase()] ?? 1;
        return { type: 'weekly', daysOfWeek: [day] };
    }

    // 仅 "每周" 默认周一
    if (h.includes('每周') || h === 'weekly' || h.includes('every week')) {
        return { type: 'weekly', daysOfWeek: [1] };
    }

    // 每月 + 日期
    const monthlyMatch = h.match(/(?:每)?月(\d{1,2})[日号]?/);
    if (monthlyMatch) {
        const day = Math.min(31, Math.max(1, parseInt(monthlyMatch[1], 10)));
        return { type: 'monthly', dayOfMonth: day };
    }

    // 英文 monthly 匹配
    const monthlyEnMatch = h.match(/(?:every\s+)?month(?:ly)?(?:\s+on(?:\s+the)?)?\s*(\d{1,2})(?:st|nd|rd|th)?/i);
    if (monthlyEnMatch) {
        const day = Math.min(31, Math.max(1, parseInt(monthlyEnMatch[1], 10)));
        return { type: 'monthly', dayOfMonth: day };
    }

    // 仅 "每月" 默认1号
    if (h.includes('每月') || h === 'monthly' || h.includes('every month')) {
        return { type: 'monthly', dayOfMonth: 1 };
    }

    return null;
}

interface AIAssistantPanelProps {
    note: Note | null;
}

export function AIAssistantPanel({ note }: AIAssistantPanelProps) {
    const aiSettings = useAppStore((state) => state.settings.ai);
    const addTask = useAppStore((state) => state.addTask);
    const addRecurringTemplate = useAppStore((state) => state.addRecurringTemplate);
    const projects = useAppStore((state) => state.projects);
    const [loading, setLoading] = useState(false);
    const [tasks, setTasks] = useState<AIGeneratedTask[]>([]);
    const [error, setError] = useState<string | null>(null);
    const activeProviderConfig = aiSettings?.providers.find(provider => provider.id === aiSettings.activeProviderId);
    const hasAIConfig = Boolean(
        activeProviderConfig?.apiKey?.trim()
        && activeProviderConfig.model?.trim()
        && activeProviderConfig.apiEndpoint?.trim()
    );
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);

    const request = useRef<AbortController | null>(null);
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const [hasGenerated, setHasGenerated] = useState(false);
    const [generatedFrom, setGeneratedFrom] = useState('');
    const plainText = useMemo(() => noteTextForAI(note?.content || ''), [note?.content]);

    // 可用项目列表（排除回收站）
    const availableProjects = projects.filter(p => p.name !== '回收站');

    // 智能匹配项目
    const matchProjectId = (suggestedName: string | undefined): string => {
        if (!suggestedName || availableProjects.length === 0) {
            return availableProjects[0]?.id || '';
        }

        // 精确匹配
        const exactMatch = availableProjects.find(
            p => p.name.toLowerCase() === suggestedName.toLowerCase()
        );
        if (exactMatch) return exactMatch.id;

        // 模糊匹配
        const fuzzyMatch = availableProjects.find(
            p => p.name.toLowerCase().includes(suggestedName.toLowerCase()) ||
                suggestedName.toLowerCase().includes(p.name.toLowerCase())
        );
        if (fuzzyMatch) return fuzzyMatch.id;

        // 默认第一个项目
        return availableProjects[0]?.id || '';
    };

    useEffect(() => {
        if (!loading) return;
        const started = Date.now();
        const timer = window.setInterval(() => setElapsedSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
        return () => window.clearInterval(timer);
    }, [loading]);

    useEffect(() => () => { request.current?.abort(); }, []);

    const cancelGeneration = () => {
        request.current?.abort();
        request.current = null;
        setLoading(false);
    };

    const handleGenerate = async () => {
        if (!note || !plainText || request.current) return;
        if (!activeProviderConfig || !hasAIConfig) { setSettingsOpen(true); return; }
        const controller = new AbortController();
        request.current = controller;
        const timeout = window.setTimeout(() => controller.abort('timeout'), 120000);
        setLoading(true);
        setError(null);
        setSuccessMsg(null);
        setElapsedSeconds(0);
        try {
            const provider = createAIProvider({ ...activeProviderConfig, apiKey: activeProviderConfig.apiKey! });
            const userPrompt = [
                '上下文信息：',
                '参考日期：' + getNoteDate(note),
                '笔记标题：' + (note.title || '无标题'),
                '可用项目：' + availableProjects.map(p => p.name).join('、'),
                '',
                '笔记正文：',
                plainText,
            ].join('\n');
            const response = await provider.generateJson<unknown>(SYSTEM_PROMPT_TASK_EXTRACTION, userPrompt, controller.signal);
            if (controller.signal.aborted || request.current !== controller) return;
            setTasks(parseGeneratedTasks(response).map(task => ({ ...task, selected: true, projectId: matchProjectId(task.suggestedProject) })));
            setGeneratedFrom(plainText);
            setHasGenerated(true);
        } catch (error) {
            if (request.current !== controller) return;
            if (controller.signal.reason === 'timeout') setError('生成超时，请重试，或在设置中检查模型与接口。');
            else if (!controller.signal.aborted) setError(error instanceof Error ? error.message : '生成失败，请重试');
        } finally {
            window.clearTimeout(timeout);
            if (request.current === controller) { request.current = null; setLoading(false); }
        }
    };

    const handleToggleTask = (index: number) => {
        setTasks(prev => prev.map((t, i) => i === index ? { ...t, selected: !t.selected } : t));
    };

    const handleUpdateTask = (index: number, updates: Partial<AIGeneratedTask>) => {
        setTasks(prev => prev.map((t, i) => i === index ? { ...t, ...updates } : t));
    };

    const handleSave = () => {
        const selectedTasks = tasks.filter(t => t.selected);
        if (selectedTasks.length === 0 || loading) return;
        const invalid = selectedTasks.find(task => !task.title.trim()
            || (task.dueDate && !isNoteDate(task.dueDate))
            || !availableProjects.some(project => project.id === task.projectId));
        if (invalid) { setError('请检查选中任务的标题、截止日期和所属项目。'); return; }
        setError(null);

        let count = 0;
        let recurringCount = 0;
        const projectNames: string[] = [];

        selectedTasks.forEach(aiTask => {
            const projectIdToUse = aiTask.projectId || availableProjects[0]?.id;
            if (!projectIdToUse) return;

            const project = projects.find(p => p.id === projectIdToUse);
            if (project && !projectNames.includes(project.name)) {
                projectNames.push(project.name);
            }

            const subtasks: Subtask[] = (aiTask.subtasks || []).filter(st => st.title.trim()).map(st => ({
                id: nanoid(8),
                title: st.title.trim(),
                completed: false,
                createdAt: Date.now(),
                dueDate: st.dueDate,
                assignee: st.owner
            }));

            // 检查是否为周期任务，并解析周期规则
            const schedule = aiTask.isRecurring ? parseRecurringHint(aiTask.recurringHint) : null;

            if (schedule) {
                // 创建周期任务模板
                const templateId = nanoid(12);
                const now = dayjs();

                // 计算周期标识
                let periodKey = '';
                let dateStr = aiTask.dueDate || '';

                if (schedule.type === 'daily') {
                    periodKey = now.format('YYYY-MM-DD');
                    if (!dateStr) dateStr = now.format('YYYY-MM-DD');
                } else if (schedule.type === 'weekly') {
                    const startOfWeek = now.subtract((now.day() + 6) % 7, 'day');
                    periodKey = startOfWeek.format('YYYY-MM-DD');
                    if (!dateStr) {
                        const weekday = (schedule.daysOfWeek ?? [1])[0];
                        let target = startOfWeek.add((weekday + 6) % 7, 'day');
                        if (target.isBefore(now.startOf('day'))) target = target.add(7, 'day');
                        dateStr = target.format('YYYY-MM-DD');
                    }
                } else if (schedule.type === 'monthly') {
                    periodKey = now.format('YYYY-MM');
                    if (!dateStr) {
                        const dom = schedule.dayOfMonth ?? 1;
                        const startOfMonth = now.startOf('month');
                        const endOfMonth = now.endOf('month');
                        let target = startOfMonth.date(Math.min(dom, endOfMonth.date()));
                        if (target.isBefore(now.startOf('day'))) {
                            const nextStart = startOfMonth.add(1, 'month');
                            const nextEnd = nextStart.endOf('month');
                            target = nextStart.date(Math.min(dom, nextEnd.date()));
                        }
                        dateStr = target.format('YYYY-MM-DD');
                    }
                }

                const occurrence = dayjs(dateStr);
                periodKey = schedule.type === 'daily' ? occurrence.format('YYYY-MM-DD')
                    : schedule.type === 'monthly' ? occurrence.format('YYYY-MM')
                    : occurrence.subtract((occurrence.day() + 6) % 7, 'day').format('YYYY-MM-DD');

                // 保存周期任务模板
                addRecurringTemplate({
                    id: templateId,
                    projectId: projectIdToUse,
                    title: aiTask.title,
                    status: 'doing',
                    priority: aiTask.priority || 'medium',
                    schedule: schedule,
                    dueStrategy: 'sameDay',
                    owners: aiTask.owner,
                    defaults: {
                        notes: aiTask.notes,
                        nextStep: aiTask.nextStep
                    },
                    subtasks: subtasks.length > 0 ? subtasks : undefined,
                    active: true
                });

                // 创建当前周期的任务实例（关联模板）
                addTask({
                    projectId: projectIdToUse,
                    title: aiTask.title,
                    notes: aiTask.notes,
                    nextStep: aiTask.nextStep,
                    priority: aiTask.priority || 'medium',
                    dueDate: dateStr,
                    owners: aiTask.owner,
                    subtasks: subtasks.length > 0 ? subtasks.map(st => ({ ...st, id: nanoid(8), createdAt: Date.now(), completed: false })) : undefined,
                    extras: {
                        sourceNoteId: note?.id || '',
                        generatedByAI: 'true',
                        recurrenceId: templateId,
                        periodKey
                    }
                });
                recurringCount++;
            } else {
                // 普通任务（非周期）
                addTask({
                    projectId: projectIdToUse,
                    title: aiTask.title,
                    notes: aiTask.notes,
                    nextStep: aiTask.nextStep,
                    priority: aiTask.priority || 'medium',
                    dueDate: aiTask.dueDate,
                    owners: aiTask.owner,
                    subtasks: subtasks.length > 0 ? subtasks : undefined,
                    extras: {
                        sourceNoteId: note?.id || '',
                        generatedByAI: 'true'
                    }
                });
            }
            count++;
        });

        const projectStr = projectNames.length > 1
            ? `${projectNames.length} 个项目`
            : `"${projectNames[0] || '项目'}"`;
        const msg = recurringCount > 0
            ? `已将 ${count} 个任务保存到 ${projectStr}（含 ${recurringCount} 个周期任务模板）`
            : `已将 ${count} 个任务保存到 ${projectStr}`;
        setSuccessMsg(msg);
        setTasks(previous => previous.filter(task => !task.selected));
    };

    const selectedCount = tasks.filter(t => t.selected).length;

    return (
        <div className="ai-panel">
            <div className="ai-panel-header">
                <div className="ai-panel-title">待办生成</div>
                <button type="button" className="ai-panel-settings-btn" aria-label="配置生成接口" title="配置生成接口" onClick={() => setSettingsOpen(true)}><Settings size={16} /></button>
            </div>
            <div className="ai-panel-body">
                <div className="ai-intro">
                    <h3>从当前随记生成待办</h3>
                    <p>识别任务、截止日期和负责人，确认后加入待办。</p>
                    <div className="ai-source-note"><span>当前随记</span><strong>{note?.title || '尚未选择随记'}</strong></div>
                    <div className="ai-model-line"><span>生成模型</span><span>{hasAIConfig ? activeProviderConfig?.model : '尚未配置'}</span></div>
                    <button className="ai-panel-generate-btn" type="button" disabled={loading || !plainText}
                        onClick={() => void handleGenerate()}>
                        {loading && <LoaderCircle size={16} className="ai-spinner" />}
                        {loading ? '正在生成待办…' : !hasAIConfig ? '配置 AI' : error ? '重试生成' : tasks.length ? '重新生成' : '生成待办事项'}
                    </button>
                    {!plainText && <p className="ai-inline-tip">先在左侧写下要做的事情，即可开始生成。</p>}
                    {loading && <div className="ai-request-status" role="status">
                        <span>已等待 {elapsedSeconds} 秒</span>
                        <button type="button" onClick={cancelGeneration}>取消生成</button>
                    </div>}
                </div>
                {error && <div className="ai-error-banner" role="alert"><Icon name="warning" size={15} /><span>{error}</span></div>}
                {successMsg && <div className="ai-save-result" role="status">
                    <p><Icon name="check" size={15} />{successMsg}</p>
                    <button type="button" onClick={() => useAppStore.getState().setActiveView('tasks')}>查看待办事项<ArrowRight size={14} /></button>
                </div>}
                {hasGenerated && !tasks.length && !loading && !error && !successMsg && <p className="ai-inline-tip">没有识别到待办。可以补充具体行动后重新生成。</p>}
                {tasks.length > 0 && <>
                    {generatedFrom !== plainText && <p className="ai-inline-tip">随记内容已修改，下方结果来自上一次生成；需要时可重新生成。</p>}
                    <div className="ai-results-header">
                        <label><input type="checkbox" checked={selectedCount === tasks.length}
                            onChange={event => setTasks(previous => previous.map(task => ({ ...task, selected: event.target.checked })))} />
                            已选 {selectedCount} / {tasks.length} 项</label>
                        <span>可直接修改</span>
                    </div>
                    <div className="ai-tasks-list">
                        {tasks.map((task, index) => <TaskPreviewCard key={index} task={task} index={index} projects={availableProjects}
                            onToggle={handleToggleTask} onUpdate={handleUpdateTask} />)}
                    </div>
                </>}
            </div>
            {tasks.length > 0 && <div className="ai-actions">
                <button className="btn btn-primary" type="button" onClick={handleSave} disabled={selectedCount === 0 || loading}>加入待办（{selectedCount}）</button>
            </div>}
            {settingsOpen && <AISettingsModal onClose={() => setSettingsOpen(false)} onSaved={() => setSettingsOpen(false)} />}
        </div>
    );
}

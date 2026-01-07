import { useState, useEffect } from 'react';
import dayjs from 'dayjs';
import { nanoid } from 'nanoid';
import { Icon, type IconName } from '../ui/Icon';
import type { Note, AIGeneratedTask, Subtask, RecurringTemplate } from '../../types';
import { useAppStore } from '../../state/appStore';
import { createAIProvider } from '../../services/ai';
import { SYSTEM_PROMPT_TASK_EXTRACTION } from '../../services/ai/prompts';
import { TaskPreviewCard } from './TaskPreviewCard';
import { AISettingsModal } from './AISettingsModal';

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

// AI 生成阶段配置
const AI_STAGES = [
    { id: 'connect', name: '连接服务', icon: 'send' as IconName, progress: 10 },
    { id: 'analyze', name: '分析内容', icon: 'search' as IconName, progress: 30 },
    { id: 'process', name: 'AI 处理', icon: 'sparkles' as IconName, progress: 90 },
    { id: 'complete', name: '生成完成', icon: 'check' as IconName, progress: 100 }
] as const;

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
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);

    // 进度状态
    const [currentStage, setCurrentStage] = useState(0);
    const [progress, setProgress] = useState(0);
    const [startTime, setStartTime] = useState(0);
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const [estimatedRemaining, setEstimatedRemaining] = useState(0);

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

    // 计时器 Effect
    useEffect(() => {
        let timer: number;

        if (loading && startTime > 0) {
            // 立即执行一次
            const updateTime = () => {
                const elapsed = Math.floor((Date.now() - startTime) / 1000);
                setElapsedSeconds(elapsed);

                // 预估剩余时间
                if (progress > 0 && progress < 100) {
                    const totalEstimate = (elapsed / progress) * 100;
                    const remaining = Math.max(0, Math.ceil(totalEstimate - elapsed));
                    setEstimatedRemaining(remaining);
                }
            };

            // 立即执行一次
            updateTime();

            // 然后每秒更新
            timer = window.setInterval(updateTime, 1000);
        }

        return () => {
            if (timer) window.clearInterval(timer);
        };
    }, [loading, startTime, progress]);

    const handleGenerate = async () => {
        if (!note?.content) return;

        const activeProviderConfig = aiSettings?.providers.find(p => p.id === aiSettings.activeProviderId);
        if (!activeProviderConfig?.apiKey) {
            setSettingsOpen(true);
            return;
        }

        // 初始化状态
        setLoading(true);
        setError(null);
        setTasks([]);
        setSuccessMsg(null);
        setCurrentStage(0);
        setProgress(0);
        setStartTime(Date.now());
        setElapsedSeconds(0);
        setEstimatedRemaining(0);

        try {
            // 阶段 1: 连接服务 (0-10%)
            setCurrentStage(0);
            setProgress(10);
            await new Promise(resolve => setTimeout(resolve, 500));

            // 阶段 2: 分析内容 (10-30%)
            setCurrentStage(1);
            let analysisProgress = 10;
            const analysisInterval = setInterval(() => {
                analysisProgress += 2;
                if (analysisProgress <= 30) {
                    setProgress(analysisProgress);
                }
            }, 150);

            await new Promise(resolve => setTimeout(resolve, 1500));
            clearInterval(analysisInterval);
            setProgress(30);

            // 阶段 3: AI 处理 (30-90%)
            setCurrentStage(2);

            // 模拟进度增长（在实际 API 调用期间）
            const apiProgressInterval = setInterval(() => {
                setProgress(prev => {
                    if (prev < 90) {
                        return Math.min(prev + 1, 90);
                    }
                    return prev;
                });
            }, 100);

            const provider = createAIProvider({
                ...activeProviderConfig,
                apiKey: activeProviderConfig.apiKey!
            });

            const referenceDate = note?.updatedAt ? dayjs(note.updatedAt).format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD');
            const userPrompt = `上下文信息：
参考日期：${referenceDate}
笔记标题：${note?.title || '无标题'}
可用项目：${availableProjects.map(p => p.name).join('、')}

笔记正文：
${note.content}`;

            const response = await provider.generateJson<{ tasks: AIGeneratedTask[] }>(
                SYSTEM_PROMPT_TASK_EXTRACTION,
                userPrompt
            );

            clearInterval(apiProgressInterval);

            // 阶段 4: 完成 (90-100%)
            setCurrentStage(3);
            setProgress(95);
            await new Promise(resolve => setTimeout(resolve, 200));

            if (response && Array.isArray(response.tasks)) {
                // Initialize with selected state and matched projectId
                const initializedTasks = response.tasks.map(t => ({
                    ...t,
                    selected: true,
                    projectId: matchProjectId(t.suggestedProject)
                }));
                setTasks(initializedTasks);
                setProgress(100);
            } else {
                throw new Error('AI 返回的数据格式不正确');
            }
        } catch (err: any) {
            console.error('AI Generation Error:', err);
            setError(err.message || '生成失败，请重试');
        } finally {
            setLoading(false);
            setCurrentStage(0);
            setProgress(0);
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
        if (selectedTasks.length === 0) return;

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

            const subtasks: Subtask[] = (aiTask.subtasks || []).map(st => ({
                id: nanoid(8),
                title: st.title,
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
                        let target = startOfWeek.add((weekday + 7) % 7, 'day');
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
        setTasks([]);

        setTimeout(() => setSuccessMsg(null), 3000);
    };

    const hasApiKey = !!aiSettings?.providers.find(p => p.id === aiSettings.activeProviderId)?.apiKey;
    const selectedCount = tasks.filter(t => t.selected).length;

    return (
        <div className="ai-panel">
            <div className="ai-panel-header">
                <div className="ai-panel-title">
                    <Icon name="magic" size={18} />
                    <span>AI 助手</span>
                </div>
            </div>

            <div className="ai-panel-body">
                {error && (
                    <div className="ai-error-banner">
                        <Icon name="warning" size={14} />
                        {error}
                    </div>
                )}

                {successMsg && (
                    <div className="ai-success-banner">
                        <Icon name="check" size={14} />
                        {successMsg}
                    </div>
                )}

                {tasks.length === 0 && !loading && (
                    <div className="ai-panel-empty">
                        <div className="ai-icon-bg">
                            <Icon name="sparkles" size={24} />
                        </div>
                        <p>从笔记中提取待办事项</p>
                        <p className="ai-subtext">AI 将分析您的笔记内容，自动识别任务、截止日期、子任务和负责人。</p>

                        {!note?.content ? (
                            <div className="ai-tip">请输入笔记内容后开始</div>
                        ) : (
                            <button
                                className="ai-panel-generate-btn"
                                onClick={handleGenerate}
                                disabled={!note?.content}
                            >
                                <Icon name="magic" size={16} />
                                <span>{hasApiKey ? '生成任务' : '配置 AI 并生成'}</span>
                            </button>
                        )}
                    </div>
                )}

                {loading && (
                    <div className="ai-loading-state">
                        {/* 阶段指示器 */}
                        <div className="ai-stages-indicator">
                            {AI_STAGES.map((stage, index) => (
                                <div
                                    key={stage.id}
                                    className={`ai-stage-item ${index === currentStage ? 'active' : ''
                                        } ${index < currentStage ? 'completed' : ''}`}
                                >
                                    <div className="ai-stage-icon">
                                        <Icon
                                            name={stage.icon}
                                            size={20}
                                        />
                                    </div>
                                    <span className="ai-stage-name">{stage.name}</span>
                                </div>
                            ))}
                        </div>

                        {/* 进度条 */}
                        <div className="ai-progress-container">
                            <div className="ai-progress-info">
                                <span className="ai-progress-text">{progress}%</span>
                            </div>
                            <div className="ai-progress-bar">
                                <div
                                    className="ai-progress-fill"
                                    style={{ width: `${progress}%` }}
                                />
                            </div>
                        </div>

                        {/* 当前阶段文本 */}
                        <p className="ai-loading-text">
                            {AI_STAGES[currentStage].name}中...
                        </p>

                        {/* 时间信息 */}
                        <div className="ai-time-info">
                            <span className="ai-elapsed">
                                已用时: {elapsedSeconds}s
                            </span>
                            {estimatedRemaining > 0 && progress < 90 && (
                                <span className="ai-estimated">
                                    预计剩余: {estimatedRemaining}s
                                </span>
                            )}
                        </div>

                        {/* 当前模型信息 */}
                        {aiSettings?.activeProviderId && (
                            <div className="ai-model-info">
                                <span className="ai-model-label">当前模型：</span>
                                <span className="ai-model-name">
                                    {aiSettings.providers.find(p => p.id === aiSettings.activeProviderId)?.model || '未知'}
                                </span>
                            </div>
                        )}

                        {/* 提示文字 */}
                        <span className="ai-loading-tip">
                            {currentStage === 0 && '正在建立连接...'}
                            {currentStage === 1 && '正在解析笔记内容...'}
                            {currentStage === 2 && 'AI 正在生成任务，请稍候...'}
                            {currentStage === 3 && '即将完成...'}
                        </span>

                        {/* 取消按钮 */}
                        <button
                            className="btn btn-light ai-cancel-btn"
                            onClick={() => {
                                setLoading(false);
                                setCurrentStage(0);
                                setProgress(0);
                            }}
                        >
                            <Icon name="close" size={14} />
                            <span>取消</span>
                        </button>
                    </div>
                )}

                {tasks.length > 0 && (
                    <div className="ai-results">
                        <div className="ai-results-header">
                            <span>识别到 {tasks.length} 个任务</span>
                        </div>
                        <div className="ai-tasks-list">
                            {tasks.map((task, index) => (
                                <TaskPreviewCard
                                    key={index}
                                    task={task}
                                    index={index}
                                    projects={availableProjects}
                                    onToggle={handleToggleTask}
                                    onUpdate={handleUpdateTask}
                                />
                            ))}
                        </div>
                        <div className="ai-actions">
                            <button className="btn btn-light" onClick={() => setTasks([])}>取消</button>
                            <button
                                className="btn btn-primary"
                                onClick={handleSave}
                                disabled={selectedCount === 0}
                            >
                                保存选中任务 ({selectedCount})
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {settingsOpen && <AISettingsModal onClose={() => setSettingsOpen(false)} />}
        </div>
    );
}


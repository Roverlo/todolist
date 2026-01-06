import { useState, useEffect } from 'react';
import dayjs from 'dayjs';
import { nanoid } from 'nanoid';
import { Icon, type IconName } from '../ui/Icon';
import type { Note, AIGeneratedTask, Subtask } from '../../types';
import { useAppStore } from '../../state/appStore';
import { createAIProvider } from '../../services/ai';
import { SYSTEM_PROMPT_TASK_EXTRACTION } from '../../services/ai/prompts';
import { TaskPreviewCard } from './TaskPreviewCard';
import { AISettingsModal } from './AISettingsModal';

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
            const userPrompt = `Context:
Reference Date: ${referenceDate}
Note Title: ${note?.title || 'Untitled'}
Available Projects: ${availableProjects.map(p => p.name).join(', ')}

Content:
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
                    generatedByAI: 'true',
                    isRecurring: aiTask.isRecurring ? 'true' : 'false',
                    recurringHint: aiTask.recurringHint || ''
                }
            });
            count++;
        });

        const projectStr = projectNames.length > 1
            ? `${projectNames.length} 个项目`
            : `"${projectNames[0] || '项目'}"`;
        setSuccessMsg(`已将 ${count} 个任务保存到 ${projectStr}`);
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


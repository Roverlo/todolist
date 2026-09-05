import { useState } from 'react';
import { Icon } from '../ui/Icon';
import type { AIGeneratedTask, AIGeneratedSubtask, Project } from '../../types';
import '../ui/TaskPreviewCard.css';
import { CustomSelect } from '../ui/CustomSelect';

interface TaskPreviewCardProps {
    task: AIGeneratedTask;
    index: number;
    projects: Project[];
    onToggle: (index: number) => void;
    onUpdate: (index: number, updates: Partial<AIGeneratedTask>) => void;
}

export function TaskPreviewCard({ task, index, projects, onToggle, onUpdate }: TaskPreviewCardProps) {
    const [expanded, setExpanded] = useState(false);

    // 判断是否为 AI 推荐的项目
    const isRecommendedProject = () => {
        if (!task.suggestedProject || !task.projectId) return false;
        const selectedProject = projects.find(p => p.id === task.projectId);
        return selectedProject?.name.toLowerCase().includes(task.suggestedProject.toLowerCase());
    };

    // 添加子任务
    const handleAddSubtask = () => {
        const newSubtask: AIGeneratedSubtask = { title: '', dueDate: undefined, owner: undefined };
        onUpdate(index, { subtasks: [...(task.subtasks || []), newSubtask] });
    };

    // 更新子任务
    const handleUpdateSubtask = (subIndex: number, updates: Partial<AIGeneratedSubtask>) => {
        const newSubtasks = [...(task.subtasks || [])];
        newSubtasks[subIndex] = { ...newSubtasks[subIndex], ...updates };
        onUpdate(index, { subtasks: newSubtasks });
    };

    // 删除子任务
    const handleDeleteSubtask = (subIndex: number) => {
        const newSubtasks = (task.subtasks || []).filter((_, i) => i !== subIndex);
        onUpdate(index, { subtasks: newSubtasks });
    };

    return (
        <div className={`task-preview-card ${task.selected ? 'selected' : ''}`}>
            <div className="task-preview-header">
                <input type="checkbox" className="task-preview-checkbox" aria-label={`选择任务 ${index + 1}`} checked={Boolean(task.selected)} onChange={() => onToggle(index)} />

                <div className="task-preview-content">
                    <div className="task-preview-title-row">
                        <input
                            className="task-preview-title-input"
                            value={task.title}
                            onChange={(e) => onUpdate(index, { title: e.target.value })}
                            onClick={(e) => e.stopPropagation()}
                            placeholder="输入任务标题"
                            aria-label={`任务 ${index + 1} 标题`}
                        />
                        {task.isRecurring && (
                            <span className="task-preview-recurring-badge" title={task.recurringHint || '周期任务'}>
                                <Icon name="refresh" size={10} />
                                周期
                            </span>
                        )}
                    </div>
                    <div className="task-preview-meta-row">
                        <div
                            className="task-preview-chip date editable"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <Icon name="calendar" size={10} />
                            <input
                                type="date"
                                aria-label={`任务 ${index + 1} 截止日期`}
                                className="chip-input"
                                value={task.dueDate || ''}
                                placeholder="无截止日期"
                                onChange={(e) => onUpdate(index, { dueDate: e.target.value })}
                            />
                        </div>
                        <CustomSelect className="task-preview-priority" aria-label={`任务 ${index + 1} 优先级`} value={task.priority || 'medium'}
                            options={[{ value: 'high', label: '高' }, { value: 'medium', label: '中' }, { value: 'low', label: '低' }]}
                            onChange={value => onUpdate(index, { priority: value as 'high' | 'medium' | 'low' })} />
                        <div
                            className="task-preview-chip owner editable"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <Icon name="user" size={10} />
                            <input
                                type="text"
                                className="chip-input"
                                value={task.owner || ''}
                                placeholder="负责人"
                                aria-label={`任务 ${index + 1} 负责人`}
                                onChange={(e) => onUpdate(index, { owner: e.target.value })}
                            />
                        </div>
                    </div>
                </div>

                <button type="button"
                    className="task-preview-expand"
                    aria-expanded={expanded}
                    aria-label={`${expanded ? '收起' : '展开'}任务 ${index + 1} 详情`}
                    onClick={() => setExpanded(!expanded)}
                >
                    <Icon name={expanded ? 'chevronDown' : 'chevronRight'} size={14} />
                </button>
            </div>

            {expanded && (
                <div className="task-preview-body">
                    {/* 项目选择 */}
                    <div className="task-preview-section">
                        <label className="task-preview-section-label">
                            <Icon name="folder" size={12} />
                            所属项目
                            {isRecommendedProject() && (
                                <span className="task-preview-ai-badge">AI 推荐</span>
                            )}
                        </label>
                        <CustomSelect
                            aria-label={`任务 ${index + 1} 所属项目`}
                            value={task.projectId || ''}
                            onChange={value => onUpdate(index, { projectId: value })}
                            options={projects.map(project => ({ value: project.id, label: project.name }))} />
                    </div>

                    {/* 周期提示 */}
                    {task.isRecurring && task.recurringHint && (
                        <div className="task-preview-recurring-hint">
                            <Icon name="refresh" size={12} />
                            <span>检测到周期任务：{task.recurringHint}</span>
                            <span className="task-preview-recurring-tip">（加入待办时同时创建周期规则）</span>
                        </div>
                    )}

                    {/* 任务详情 */}
                    <div className="task-preview-section">
                        <label className="task-preview-section-label">
                            <Icon name="note" size={12} />
                            任务详情
                        </label>
                        <textarea
                            className="task-preview-textarea"
                            value={task.notes || ''}
                            placeholder="添加详细描述..."
                            onChange={(e) => onUpdate(index, { notes: e.target.value })}
                            onClick={(e) => e.stopPropagation()}
                            rows={2}
                        />
                    </div>

                    {/* 下一步计划 */}
                    <div className="task-preview-section">
                        <label className="task-preview-section-label">
                            <Icon name="chevronRight" size={12} />
                            下一步计划
                        </label>
                        <textarea
                            className="task-preview-textarea"
                            value={task.nextStep || ''}
                            placeholder="添加下一步行动..."
                            onChange={(e) => onUpdate(index, { nextStep: e.target.value })}
                            onClick={(e) => e.stopPropagation()}
                            rows={2}
                        />
                    </div>

                    {/* 子任务 */}
                    <div className="task-preview-section">
                        <label className="task-preview-section-label">
                            <Icon name="check" size={12} />
                            子任务 ({task.subtasks?.length || 0})
                        </label>
                        <div className="task-preview-subtasks">
                            {(task.subtasks || []).map((st, i) => (
                                <div key={i} className="task-preview-subtask-item">
                                    <div className="subtask-bullet"></div>
                                    <input
                                        type="text"
                                        className="subtask-title-input"
                                        value={st.title}
                                        placeholder="子任务标题"
                                        onChange={(e) => handleUpdateSubtask(i, { title: e.target.value })}
                                        onClick={(e) => e.stopPropagation()}
                                    />
                                    {st.owner && <span className="subtask-meta">@{st.owner}</span>}
                                    {st.dueDate && <span className="subtask-meta">{st.dueDate}</span>}
                                    <button
                                        className="subtask-delete-btn"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleDeleteSubtask(i);
                                        }}
                                        title="删除子任务"
                                    >
                                        <Icon name="close" size={10} />
                                    </button>
                                </div>
                            ))}
                            <button
                                className="task-preview-add-subtask-btn"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleAddSubtask();
                                }}
                            >
                                <Icon name="plus" size={12} />
                                添加子任务
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}


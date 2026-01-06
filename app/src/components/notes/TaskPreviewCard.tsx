import { useState } from 'react';
import { Icon } from '../ui/Icon';
import type { AIGeneratedTask, AIGeneratedSubtask, Project } from '../../types';
import '../ui/TaskPreviewCard.css';

interface TaskPreviewCardProps {
    task: AIGeneratedTask;
    index: number;
    projects: Project[];
    onToggle: (index: number) => void;
    onUpdate: (index: number, updates: Partial<AIGeneratedTask>) => void;
}

export function TaskPreviewCard({ task, index, projects, onToggle, onUpdate }: TaskPreviewCardProps) {
    const [expanded, setExpanded] = useState(true);

    const handlePriorityClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        const nextPriority = task.priority === 'high' ? 'low' : task.priority === 'medium' ? 'high' : 'medium';
        onUpdate(index, { priority: nextPriority });
    };

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
                <div
                    className={`task-preview-checkbox ${task.selected ? 'checked' : ''}`}
                    onClick={(e) => {
                        e.stopPropagation();
                        onToggle(index);
                    }}
                >
                    {task.selected && <Icon name="check" size={12} />}
                </div>

                <div className="task-preview-content" onClick={() => setExpanded(!expanded)}>
                    <div className="task-preview-title-row">
                        <input
                            className="task-preview-title-input"
                            value={task.title}
                            onChange={(e) => onUpdate(index, { title: e.target.value })}
                            onClick={(e) => e.stopPropagation()}
                            placeholder="输入任务标题"
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
                                type="text"
                                className="chip-input"
                                value={task.dueDate || ''}
                                placeholder="无截止日期"
                                onChange={(e) => onUpdate(index, { dueDate: e.target.value })}
                            />
                        </div>
                        <span
                            className={`task-preview-chip priority ${task.priority || 'medium'}`}
                            onClick={handlePriorityClick}
                        >
                            {task.priority === 'high' ? '高' : task.priority === 'low' ? '低' : '中'}
                        </span>
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
                                onChange={(e) => onUpdate(index, { owner: e.target.value })}
                            />
                        </div>
                    </div>
                </div>

                <div
                    className="task-preview-expand"
                    onClick={() => setExpanded(!expanded)}
                >
                    <Icon name={expanded ? 'chevronDown' : 'chevronRight'} size={14} />
                </div>
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
                        <select
                            className="task-preview-project-select"
                            value={task.projectId || ''}
                            onChange={(e) => onUpdate(index, { projectId: e.target.value })}
                            onClick={(e) => e.stopPropagation()}
                        >
                            {projects.map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* 周期提示 */}
                    {task.isRecurring && task.recurringHint && (
                        <div className="task-preview-recurring-hint">
                            <Icon name="refresh" size={12} />
                            <span>检测到周期任务：{task.recurringHint}</span>
                            <span className="task-preview-recurring-tip">（保存后可转为周期模板）</span>
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


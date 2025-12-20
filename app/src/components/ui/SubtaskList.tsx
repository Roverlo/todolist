import { useState, useRef, useEffect, useCallback } from 'react';
import { nanoid } from 'nanoid';
import dayjs from 'dayjs';
import type { Subtask } from '../../types';
import {
    DndContext,
    closestCenter,
    PointerSensor,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
    SortableContext,
    useSortable,
    verticalListSortingStrategy,
    arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';


interface SubtaskListProps {
    subtasks: Subtask[];
    onChange: (subtasks: Subtask[]) => void;
    hideProgress?: boolean;
    owners?: string[];  // 合并后的责任人建议列表
}

interface InlineSubtaskItemProps {
    subtask: Subtask;
    allAssignees: string[];
    onUpdate: (updates: Partial<Subtask>) => void;
    onToggle: () => void;
    onDelete: () => void;
    isOverdue: (dueDate?: string) => boolean;
    index: number;
}

const InlineSubtaskItem = ({
    subtask: st,
    allAssignees,
    onUpdate,
    onToggle,
    onDelete,
    isOverdue,
    index,
}: InlineSubtaskItemProps) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: st.id });

    const titleRef = useRef<HTMLSpanElement>(null);

    const style = {
        transform: CSS.Translate.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };

    // 处理标题编辑
    const handleTitleBlur = useCallback(() => {
        if (titleRef.current) {
            const newTitle = titleRef.current.innerText.trim();
            if (newTitle && newTitle !== st.title) {
                onUpdate({ title: newTitle });
            } else if (!newTitle) {
                // 如果清空了，恢复原标题
                titleRef.current.innerText = st.title;
            }
        }
    }, [st.title, onUpdate]);

    // 处理标题回车 - 允许换行，Shift+Enter 保存
    const handleTitleKeyDown = useCallback((e: React.KeyboardEvent) => {
        // Escape 取消编辑并恢复
        if (e.key === 'Escape') {
            if (titleRef.current) {
                titleRef.current.innerText = st.title;
                titleRef.current.blur();
            }
        }
    }, [st.title]);

    // 处理日期变更
    const handleDueDateChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        onUpdate({ dueDate: e.target.value || undefined });
    }, [onUpdate]);

    // 处理责任人变更
    const handleAssigneeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        onUpdate({ assignee: e.target.value || undefined });
    }, [onUpdate]);

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`subtask-item subtask-item-inline ${st.completed ? 'completed' : ''} ${isDragging ? 'dragging' : ''}`}
        >
            {/* 序号 */}
            <span className='subtask-index'>{index + 1}.</span>

            {/* 主内容区 */}
            <div className='subtask-content-inline'>
                {/* 可编辑标题 */}
                <span
                    ref={titleRef}
                    className='subtask-title-editable'
                    contentEditable
                    suppressContentEditableWarning
                    onBlur={handleTitleBlur}
                    onKeyDown={handleTitleKeyDown}
                >
                    {st.title}
                </span>

                {/* Meta 信息行 - inline 编辑 */}
                <div className='subtask-meta-inline'>
                    <label className='subtask-meta-label'>
                        <span className='subtask-meta-prefix'>责任人</span>
                        <input
                            type='text'
                            value={st.assignee || ''}
                            onChange={handleAssigneeChange}
                            className='subtask-inline-input'
                            placeholder='未指定'
                            list={`subtask-assignee-${st.id}`}
                        />
                        <datalist id={`subtask-assignee-${st.id}`}>
                            {allAssignees.map((name) => (
                                <option key={name} value={name} />
                            ))}
                        </datalist>
                    </label>

                    <label className='subtask-meta-label'>
                        <span className='subtask-meta-prefix'>截止</span>
                        <input
                            type='date'
                            value={st.dueDate || ''}
                            onChange={handleDueDateChange}
                            className={`subtask-inline-date ${!st.completed && isOverdue(st.dueDate) ? 'overdue' : ''}`}
                        />
                        {!st.completed && isOverdue(st.dueDate) && (
                            <span className='subtask-overdue-tag'>逾期</span>
                        )}
                    </label>

                    {st.completedAt && (
                        <span className='subtask-completed-info'>
                            ⏱ 完成于 {dayjs(st.completedAt).format('MM-DD HH:mm')}
                        </span>
                    )}
                </div>
            </div>

            {/* 操作按钮 */}
            <div className='subtask-actions-inline'>
                <label className='subtask-checkbox-wrapper' title='标记完成'>
                    <input
                        type='checkbox'
                        checked={st.completed}
                        onChange={onToggle}
                        className='subtask-checkbox'
                    />
                    <span className='subtask-checkbox-custom' />
                </label>

                {/* 拖拽手柄 */}
                <button
                    type='button'
                    className='subtask-drag-handle'
                    {...attributes}
                    {...listeners}
                    title='拖拽排序'
                >
                    ⋮⋮
                </button>

                <button
                    type='button'
                    className='subtask-delete'
                    onClick={onDelete}
                    title='删除'
                >
                    ×
                </button>
            </div>
        </div>
    );
};

export const SubtaskList = ({ subtasks, onChange, hideProgress, owners = [] }: SubtaskListProps) => {
    const [newTitle, setNewTitle] = useState('');
    const [newDueDate, setNewDueDate] = useState('');
    const [newAssignee, setNewAssignee] = useState('');

    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const adjustHeight = (ref: React.RefObject<HTMLTextAreaElement | null>) => {
        const el = ref.current;
        if (el) {
            el.style.height = 'auto';
            el.style.height = `${el.scrollHeight}px`;
        }
    };

    useEffect(() => {
        adjustHeight(textareaRef);
    }, [newTitle]);

    const handleAdd = () => {
        if (!newTitle.trim()) return;
        const newSubtask: Subtask = {
            id: nanoid(8),
            title: newTitle.trim(),
            completed: false,
            createdAt: Date.now(),
            dueDate: newDueDate || undefined,
            assignee: newAssignee || undefined,
        };
        onChange([...subtasks, newSubtask]);
        setNewTitle('');
        setNewDueDate('');
        setNewAssignee('');
    };

    const handleToggle = (id: string) => {
        onChange(
            subtasks.map((st) =>
                st.id === id
                    ? {
                        ...st,
                        completed: !st.completed,
                        completedAt: !st.completed ? Date.now() : undefined,
                    }
                    : st
            )
        );
    };

    const handleDelete = (id: string) => {
        onChange(subtasks.filter((st) => st.id !== id));
    };

    // 实时更新子任务
    const handleUpdate = (id: string, updates: Partial<Subtask>) => {
        onChange(
            subtasks.map((st) =>
                st.id === id ? { ...st, ...updates } : st
            )
        );
    };

    const completedCount = subtasks.filter((st) => st.completed).length;
    const totalCount = subtasks.length;
    const progress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

    // 合并所有可用的责任人选项
    const allAssignees = [...owners].sort();

    // 检查子任务是否逾期
    const isOverdue = (dueDate?: string) => {
        if (!dueDate) return false;
        return dayjs(dueDate).isBefore(dayjs(), 'day');
    };

    // 拖拽传感器配置
    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8,
            },
        })
    );

    // 拖拽结束处理
    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (over && active.id !== over.id) {
            const oldIndex = subtasks.findIndex((st) => st.id === active.id);
            const newIndex = subtasks.findIndex((st) => st.id === over.id);
            onChange(arrayMove(subtasks, oldIndex, newIndex));
        }
    };

    return (
        <div className='subtask-list'>
            {!hideProgress && totalCount > 0 && (
                <div className='subtask-progress'>
                    <div className='subtask-progress-bar'>
                        <div
                            className='subtask-progress-fill'
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                    <span className='subtask-progress-text'>
                        {completedCount}/{totalCount} 完成
                    </span>
                </div>
            )}

            {/* 空状态提示 */}
            {subtasks.length === 0 && (
                <div className='subtask-empty-state'>
                    <div className='subtask-empty-icon'>📝</div>
                    <p className='subtask-empty-text'>暂无子任务</p>
                    <p className='subtask-empty-hint'>将大任务拆分为可执行的小步骤</p>
                </div>
            )}

            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
            >
                <SortableContext
                    items={subtasks.map((st) => st.id)}
                    strategy={verticalListSortingStrategy}
                >
                    <div className='subtask-items'>
                        {subtasks.map((st, index) => (
                            <InlineSubtaskItem
                                key={st.id}
                                index={index}
                                subtask={st}
                                allAssignees={allAssignees}
                                onUpdate={(updates) => handleUpdate(st.id, updates)}
                                onToggle={() => handleToggle(st.id)}
                                onDelete={() => handleDelete(st.id)}
                                isOverdue={isOverdue}
                            />
                        ))}
                    </div>
                </SortableContext>
            </DndContext>

            {/* 添加新子任务 */}
            <div className='subtask-add-row'>
                <textarea
                    ref={textareaRef}
                    rows={1}
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder='添加子任务...'
                    className='subtask-add-input'
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleAdd();
                        }
                    }}
                />
                <input
                    type='text'
                    onFocus={(e) => (e.target.type = 'date')}
                    onBlur={(e) => (e.target.type = e.target.value ? 'date' : 'text')}
                    value={newDueDate}
                    onChange={(e) => setNewDueDate(e.target.value)}
                    className='subtask-add-date'
                    placeholder='截止日期'
                />
                <input
                    type='text'
                    value={newAssignee}
                    onChange={(e) => setNewAssignee(e.target.value)}
                    className='subtask-add-assignee'
                    placeholder='责任人'
                    list='subtask-add-assignee-options'
                />
                <datalist id='subtask-add-assignee-options'>
                    {allAssignees.map((name) => (
                        <option key={name} value={name} />
                    ))}
                </datalist>
                <button
                    type='button'
                    onClick={handleAdd}
                    className='subtask-add-btn'
                    disabled={!newTitle.trim()}
                >
                    添加
                </button>
            </div>
        </div>
    );
};

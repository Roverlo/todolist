import { useRef, useCallback, useState, useEffect, useLayoutEffect } from 'react';
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
    mainDueDate?: string;  // 主任务截止日期，用于冲突检测
}

interface InlineSubtaskItemProps {
    subtask: Subtask;
    allAssignees: string[];
    onUpdate: (updates: Partial<Subtask>) => void;
    onToggle: () => void;
    onDelete: () => void;
    isOverdue: (dueDate?: string) => boolean;
    index: number;
    mainDueDate?: string;  // 主任务截止日期
}

const InlineSubtaskItem = ({
    subtask: st,
    allAssignees,
    onUpdate,
    onToggle,
    onDelete,
    isOverdue,
    index,
    mainDueDate,
}: InlineSubtaskItemProps) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: st.id });



    const style = {
        transform: CSS.Translate.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };

    // 处理标题编辑

    // 本地状态用于防止输入过程中的频繁更新和光标跳动
    const [localTitle, setLocalTitle] = useState(st.title);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // 同步外部标题变化（仅当非编辑状态或强制同步时）
    useEffect(() => {
        if (document.activeElement !== textareaRef.current) {
            setLocalTitle(st.title);
        }
    }, [st.title]);

    // 自动调整高度
    const adjustHeight = () => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'inherit'; // Reset
            textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
        }
    };

    useLayoutEffect(() => {
        adjustHeight();
    }, [localTitle]);

    const handleTitleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setLocalTitle(e.target.value);
    };

    const handleTitleBlur = () => {
        if (localTitle.trim() !== st.title) {
            if (localTitle.trim()) {
                onUpdate({ title: localTitle.trim() });
            } else {
                setLocalTitle(st.title); // 恢复原标题
                // Optional: ask to delete? But here we just revert.
            }
        }
    };

    const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            e.currentTarget.blur();
        }
    };


    // 本地状态用于防止输入过程中的频繁更新
    const [localAssignee, setLocalAssignee] = useState(st.assignee || '');

    useEffect(() => {
        setLocalAssignee(st.assignee || '');
    }, [st.assignee]);

    // 处理日期变更
    const handleDueDateChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        onUpdate({ dueDate: e.target.value || undefined });
    }, [onUpdate]);

    // 处理责任人变更 - 仅更地状态
    const handleAssigneeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setLocalAssignee(e.target.value);
    };

    // 处理责任人失焦 - 提交更新
    const handleAssigneeBlur = () => {
        if (localAssignee !== (st.assignee || '')) {
            onUpdate({ assignee: localAssignee || undefined });
        }
    };

    // 处理责任人回车
    const handleAssigneeKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.currentTarget.blur();
        }
    };

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
                {/* 可编辑标题 */}
                <textarea
                    ref={textareaRef}
                    className='subtask-title-editable'
                    value={localTitle}
                    onChange={handleTitleChange}
                    onBlur={handleTitleBlur}
                    onKeyDown={handleTitleKeyDown}
                    rows={1}
                />

                {/* Meta 信息行 - inline 编辑 */}
                <div className='subtask-meta-inline'>
                    <label className='subtask-meta-label'>
                        {/* 截止日期冲突警告 */}
                        {mainDueDate && st.dueDate && st.dueDate > mainDueDate && (
                            <span
                                title="该日期晚于主任务截止日期"
                                style={{
                                    color: '#f59e0b',
                                    fontSize: '12px',
                                    cursor: 'help',
                                    marginRight: '2px',
                                    lineHeight: 1
                                }}
                            >
                                ⚠️
                            </span>
                        )}
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

                    <label className='subtask-meta-label'>
                        <span className='subtask-meta-prefix'>责任人</span>
                        <input
                            type='text'
                            value={localAssignee}
                            onChange={handleAssigneeChange}
                            onBlur={handleAssigneeBlur}
                            onKeyDown={handleAssigneeKeyDown}
                            className='subtask-inline-input'
                            placeholder='例如:张三/李四'
                            list={`subtask-assignee-${st.id}`}
                        />
                        <datalist id={`subtask-assignee-${st.id}`}>
                            {allAssignees.map((name) => (
                                <option key={name} value={name} />
                            ))}
                        </datalist>
                    </label>

                    {st.completedAt && (
                        <>
                            <div className='subtask-meta-spacer' />
                            <span className='subtask-completed-info'>
                                ⏱ 完成于 {dayjs(st.completedAt).format('MM-DD HH:mm')}
                            </span>
                        </>
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

export const SubtaskList = ({ subtasks, onChange, hideProgress, owners = [], mainDueDate }: SubtaskListProps) => {

    // 添加空白子任务
    const handleAddEmpty = () => {
        const newSubtask: Subtask = {
            id: nanoid(8),
            title: '请点击此处编辑子任务',
            completed: false,
            createdAt: Date.now(),
        };
        onChange([...subtasks, newSubtask]);
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
                                mainDueDate={mainDueDate}
                            />
                        ))}
                    </div>
                </SortableContext>
            </DndContext>

            {/* 添加新子任务 */}
            <button
                type='button'
                className='subtask-add-trigger'
                onClick={handleAddEmpty}
            >
                + 添加子任务
            </button>
        </div>
    );
};

import { useRef, useState, useEffect, useLayoutEffect } from 'react';
import { nanoid } from 'nanoid';
import dayjs from 'dayjs';
import type { Subtask, SubtaskStatus } from '../../types';
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
    mainDueDate?: string;  // 主任务截止日期，用于冲突检测
}

interface InlineSubtaskItemProps {
    subtask: Subtask;
    onUpdate: (updates: Partial<Subtask>) => void;
    onDelete: () => void;
    isOverdue: (dueDate?: string) => boolean;
    index: number;
    mainDueDate?: string;  // 主任务截止日期
}

const InlineSubtaskItem = ({
    subtask: st,
    onUpdate,
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

    // Status logic: fallback to doing/done if status is undefined
    const validStatus = st.status || (st.completed ? 'done' : 'doing');

    const [isStatusOpen, setIsStatusOpen] = useState(false);
    const statusRef = useRef<HTMLDivElement>(null);

    const style = {
        transform: CSS.Translate.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        position: 'relative' as const,
        zIndex: isDragging ? 999 : (isStatusOpen ? 10 : 1), // Elevate if dragging or dropdown open
    };

    // Outside click to close dropdown
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (statusRef.current && !statusRef.current.contains(event.target as Node)) {
                setIsStatusOpen(false);
            }
        };

        if (isStatusOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isStatusOpen]);

    // Handle title edit
    const [localTitle, setLocalTitle] = useState(st.title);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        if (document.activeElement !== textareaRef.current) {
            setLocalTitle(st.title);
        }
    }, [st.title]);

    const adjustHeight = () => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
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
                setLocalTitle(st.title);
            }
        }
    };

    const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        // Allow Enter to insert newline naturally, stop propagation to prevent other handlers
        if (e.key === 'Enter') {
            e.stopPropagation();
        }
    };

    // Handle Assignee
    const [localAssignee, setLocalAssignee] = useState(st.assignee || '');
    useEffect(() => {
        setLocalAssignee(st.assignee || '');
    }, [st.assignee]);

    const handleAssigneeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setLocalAssignee(e.target.value);
    };

    const handleAssigneeBlur = () => {
        if (localAssignee !== (st.assignee || '')) {
            onUpdate({ assignee: localAssignee || undefined });
        }
    };

    const handleAssigneeKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.currentTarget.blur();
        }
    };

    const handleStatusSelect = (status: SubtaskStatus) => {
        onUpdate({
            status,
            completed: status === 'done',
            completedAt: status === 'done' ? Date.now() : undefined
        });
        setIsStatusOpen(false);
    };

    const getStatusLabel = (s: SubtaskStatus) => {
        switch (s) {
            case 'doing': return '进行中';
            case 'done': return '已完成';
            case 'suspended': return '挂起';
            default: return '进行中'; // Fallback for 'todo'
        }
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`b4-item ${st.completed ? 'completed' : ''}`}
        >
            <div className='b4-main-content'>
                <div className='b4-index'>{index + 1}.</div>
                <div className='b4-input-wrapper'>
                    <textarea
                        ref={textareaRef}
                        className='b4-input'
                        value={localTitle}
                        onChange={handleTitleChange}
                        onBlur={handleTitleBlur}
                        onKeyDown={handleTitleKeyDown}
                        onPointerDown={(e) => e.stopPropagation()}
                        rows={1}
                        placeholder="输入子任务内容..."
                    />
                </div>
            </div>

            <div className='b4-footer-single-row'>
                {/* Actions: Drag + Delete - First */}
                <div className='b4-capsule b4-actions-capsule'>
                    <button
                        type='button'
                        className='btn-action-icon subtask-drag-handle'
                        {...attributes}
                        {...listeners}
                        title='拖拽排序'
                    >
                        ⋮⋮
                    </button>
                    <button type='button' className='btn-action-icon btn-action-delete' onClick={onDelete} title='删除'>×</button>
                </div>

                {/* Status Pill & Dropdown */}
                <div className='status-container' ref={statusRef}>
                    <div
                        className={`b4-capsule status-${validStatus}`}
                        onClick={() => setIsStatusOpen(!isStatusOpen)}
                    >
                        <span className="status-dot">●</span>
                        {getStatusLabel(validStatus)}
                    </div>

                    {isStatusOpen && (
                        <div className='status-dropdown-menu'>
                            <div className='status-option' onClick={() => handleStatusSelect('doing')}>
                                <span className="status-dot dot-doing">●</span> 进行中
                            </div>
                            <div className='status-option' onClick={() => handleStatusSelect('done')}>
                                <span className="status-dot dot-done">●</span> 已完成
                            </div>
                            <div className='status-option' onClick={() => handleStatusSelect('suspended')}>
                                <span className="status-dot dot-suspended">●</span> 挂起
                            </div>
                        </div>
                    )}
                </div>

                {/* Due Date */}
                <div className={`b4-capsule ${!st.completed && isOverdue(st.dueDate) ? 'overdue' : ''}`}>
                    {mainDueDate && st.dueDate && st.dueDate > mainDueDate && (
                        <span title="该日期晚于主任务截止日期" style={{ color: '#f59e0b', marginRight: '4px' }}>⚠️</span>
                    )}
                    <input
                        type='date'
                        value={st.dueDate || ''}
                        onChange={(e) => onUpdate({ dueDate: e.target.value || undefined })}
                        className='b4-capsule-input'
                    />
                </div>

                {/* Assignee */}
                <div className='b4-capsule'>
                    <span className='b4-capsule-icon' title='多个责任人请用斜杠(/)隔开'>👤</span>
                    <input
                        type='text'
                        value={localAssignee}
                        onChange={handleAssigneeChange}
                        onBlur={handleAssigneeBlur}
                        onKeyDown={handleAssigneeKeyDown}
                        className='b4-capsule-input b4-assignee-input'
                        placeholder='张三/李四'
                    />
                </div>
            </div>
        </div>
    );
};

export const SubtaskList = ({ subtasks, onChange, hideProgress, mainDueDate }: SubtaskListProps) => {

    const handleAddEmpty = () => {
        const newSubtask: Subtask = {
            id: nanoid(8),
            title: '', // Empty title to focus on
            completed: false,
            status: 'doing', // Default to doing
            createdAt: Date.now(),
        };
        onChange([...subtasks, newSubtask]);
    };

    const handleDelete = (id: string) => {
        onChange(subtasks.filter((st) => st.id !== id));
    };

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

    const isOverdue = (dueDate?: string) => {
        if (!dueDate) return false;
        return dayjs(dueDate).isBefore(dayjs(), 'day');
    };

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8,
            },
        })
    );

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (over && active.id !== over.id) {
            const oldIndex = subtasks.findIndex((st) => st.id === active.id);
            const newIndex = subtasks.findIndex((st) => st.id === over.id);
            onChange(arrayMove(subtasks, oldIndex, newIndex));
        }
    };

    return (
        <div className='subtask-list' style={{ marginTop: '12px' }}>
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

            {subtasks.length === 0 && (
                <div className='subtask-empty-state'>
                    <div className='subtask-empty-icon'>📝</div>
                    <p className='subtask-empty-text'>暂无子任务</p>
                    <button onClick={handleAddEmpty} style={{ cursor: 'pointer', color: 'var(--primary)', border: 'none', background: 'none' }}>+ 添加第一条子任务</button>
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
                    <div className='subtask-items-container' style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {subtasks.map((st, index) => (
                            <InlineSubtaskItem
                                key={st.id}
                                index={index}
                                subtask={st}
                                onUpdate={(updates) => handleUpdate(st.id, updates)}
                                onDelete={() => handleDelete(st.id)}
                                isOverdue={isOverdue}
                                mainDueDate={mainDueDate}
                            />
                        ))}
                    </div>
                </SortableContext>
            </DndContext>

            {subtasks.length > 0 && (
                <button
                    type='button'
                    className='subtask-add-trigger'
                    onClick={handleAddEmpty}
                    style={{ marginTop: '12px' }}
                >
                    + 添加子任务
                </button>
            )}
        </div>
    );
};


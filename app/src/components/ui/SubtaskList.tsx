import { useState, useRef, useEffect } from 'react';
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

interface SortableSubtaskItemProps {
    subtask: Subtask;
    isEditing: boolean;
    editTextareaRef: React.RefObject<HTMLTextAreaElement | null>;
    editTitle: string;
    setEditTitle: (v: string) => void;
    editDueDate: string;
    setEditDueDate: (v: string) => void;
    editAssignee: string;
    setEditAssignee: (v: string) => void;
    allAssignees: string[];
    onSaveEdit: () => void;
    onCancelEdit: () => void;
    onToggle: () => void;
    onEdit: () => void;
    onDelete: () => void;
    isOverdue: (dueDate?: string) => boolean;
    index: number;
}

const SortableSubtaskItem = ({
    subtask: st,
    isEditing,
    editTextareaRef,
    editTitle,
    setEditTitle,
    editDueDate,
    setEditDueDate,
    editAssignee,
    setEditAssignee,
    allAssignees,
    onSaveEdit,
    onCancelEdit,
    onToggle,
    onEdit,
    onDelete,
    isOverdue,
    index,
}: SortableSubtaskItemProps) => {
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

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`subtask-item ${st.completed ? 'completed' : ''} ${isDragging ? 'dragging' : ''}`}
        >
            {isEditing ? (
                // 编辑模式
                <div className='subtask-edit-mode'>
                    <textarea
                        ref={editTextareaRef}
                        rows={1}
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        className='subtask-edit-input'
                        placeholder='子任务标题'
                        autoFocus
                        style={{
                            resize: 'none',
                            overflow: 'hidden',
                            minHeight: '32px',
                        }}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                onSaveEdit();
                            }
                            if (e.key === 'Escape') {
                                onCancelEdit();
                            }
                        }}
                    />
                    <div className='subtask-edit-meta'>
                        <input
                            type='text'
                            onFocus={(e) => (e.target.type = 'date')}
                            onBlur={(e) => (e.target.type = e.target.value ? 'date' : 'text')}
                            value={editDueDate}
                            onChange={(e) => setEditDueDate(e.target.value)}
                            className='subtask-edit-date'
                            placeholder='截止日期'
                        />
                        <input
                            type='text'
                            value={editAssignee}
                            onChange={(e) => setEditAssignee(e.target.value)}
                            className='subtask-edit-assignee'
                            placeholder='责任人'
                            list={`subtask-assignee-options-${st.id}`}
                        />
                        <datalist id={`subtask-assignee-options-${st.id}`}>
                            {allAssignees.map((name) => (
                                <option key={name} value={name} />
                            ))}
                        </datalist>
                    </div>
                    <div className='subtask-edit-actions'>
                        <button
                            type='button'
                            className='subtask-edit-save'
                            onClick={onSaveEdit}
                            disabled={!editTitle.trim()}
                        >
                            保存
                        </button>
                        <button
                            type='button'
                            className='subtask-edit-cancel'
                            onClick={onCancelEdit}
                        >
                            取消
                        </button>
                    </div>
                </div>
            ) : (
                // 显示模式
                <>

                    <span className='subtask-index'>{index + 1}.</span>
                    <div className='subtask-content' onDoubleClick={onEdit}>
                        <span className='subtask-title'>{st.title}</span>
                        {(st.assignee || st.dueDate || st.completedAt) && (
                            <div className='subtask-meta'>
                                {st.assignee && (
                                    <span className='subtask-meta-item'>
                                        责任人 {st.assignee}
                                    </span>
                                )}
                                {st.dueDate && (
                                    <span className={`subtask-meta-item ${!st.completed && isOverdue(st.dueDate) ? 'subtask-overdue' : ''}`}>
                                        截止 {dayjs(st.dueDate).format('MM-DD')}
                                        {!st.completed && isOverdue(st.dueDate) && ' (逾期)'}
                                    </span>
                                )}
                                {st.completedAt && (
                                    <span className='subtask-meta-item'>
                                        ⏱ 完成于 {dayjs(st.completedAt).format('MM-DD HH:mm')}
                                    </span>
                                )}
                            </div>
                        )}
                    </div>
                    <div className='subtask-actions'>
                        <label className='subtask-checkbox-wrapper' title='标记完成' style={{ marginRight: 4 }}>
                            <input
                                type='checkbox'
                                checked={st.completed}
                                onChange={onToggle}
                                className='subtask-checkbox'
                            />
                            <span className='subtask-checkbox-custom' />
                        </label>

                        <button
                            type='button'
                            className='subtask-edit-btn'
                            onClick={onEdit}
                            title='编辑'
                        >
                            ✎
                        </button>
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
                </>
            )}
        </div>
    );
};

export const SubtaskList = ({ subtasks, onChange, hideProgress, owners = [] }: SubtaskListProps) => {
    const [newTitle, setNewTitle] = useState('');
    const [newDueDate, setNewDueDate] = useState('');
    const [newAssignee, setNewAssignee] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editTitle, setEditTitle] = useState('');
    const [editDueDate, setEditDueDate] = useState('');
    const [editAssignee, setEditAssignee] = useState('');

    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const editTextareaRef = useRef<HTMLTextAreaElement>(null);

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

    useEffect(() => {
        if (editingId) {
            adjustHeight(editTextareaRef);
        }
    }, [editTitle, editingId]);

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

    const handleEdit = (st: Subtask) => {
        setEditingId(st.id);
        setEditTitle(st.title);
        setEditDueDate(st.dueDate || '');
        setEditAssignee(st.assignee || '');
    };

    const handleSaveEdit = () => {
        if (!editTitle.trim() || !editingId) return;
        onChange(
            subtasks.map((st) =>
                st.id === editingId
                    ? {
                        ...st,
                        title: editTitle.trim(),
                        dueDate: editDueDate || undefined,
                        assignee: editAssignee || undefined,
                    }
                    : st
            )
        );
        setEditingId(null);
        setEditTitle('');
        setEditDueDate('');
        setEditAssignee('');
    };

    const handleCancelEdit = () => {
        setEditingId(null);
        setEditTitle('');
        setEditDueDate('');
        setEditAssignee('');
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
                distance: 8, // 8px 拖动距离才触发，避免误触
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
                            <SortableSubtaskItem
                                key={st.id}
                                index={index}
                                subtask={st}
                                isEditing={editingId === st.id}
                                editTextareaRef={editTextareaRef}
                                editTitle={editTitle}
                                setEditTitle={setEditTitle}
                                editDueDate={editDueDate}
                                setEditDueDate={setEditDueDate}
                                editAssignee={editAssignee}
                                setEditAssignee={setEditAssignee}
                                allAssignees={allAssignees}
                                onSaveEdit={handleSaveEdit}
                                onCancelEdit={handleCancelEdit}
                                onToggle={() => handleToggle(st.id)}
                                onEdit={() => handleEdit(st)}
                                onDelete={() => handleDelete(st.id)}
                                isOverdue={isOverdue}
                            />
                        ))}
                    </div>
                </SortableContext>
            </DndContext>

            {/* 添加新子任务 */}
            <div className='subtask-add'>
                <textarea
                    ref={textareaRef}
                    rows={1}
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder='添加子任务...'
                    className='subtask-input'
                    style={{
                        resize: 'none',
                        overflow: 'hidden',
                        minHeight: '32px',
                        paddingTop: '8px',
                        paddingBottom: '8px',
                        fontFamily: 'inherit',
                        lineHeight: 'inherit',
                    }}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleAdd();
                        }
                    }}
                />
                <div className='subtask-add-meta'>
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
                        placeholder='责任人 如小明/小红'
                        list='subtask-add-assignee-options'
                    />
                    <datalist id='subtask-add-assignee-options'>
                        {allAssignees.map((name) => (
                            <option key={name} value={name} />
                        ))}
                    </datalist>
                </div>
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

import { useState, useRef, useEffect } from 'react';
import { nanoid } from 'nanoid';
import type { Subtask } from '../../types';

interface SubtaskListProps {
    subtasks: Subtask[];
    onChange: (subtasks: Subtask[]) => void;
    hideProgress?: boolean;
}

export const SubtaskList = ({ subtasks, onChange, hideProgress }: SubtaskListProps) => {
    const [newTitle, setNewTitle] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const adjustHeight = () => {
        const el = textareaRef.current;
        if (el) {
            el.style.height = 'auto';
            el.style.height = `${el.scrollHeight}px`;
        }
    };

    useEffect(() => {
        adjustHeight();
    }, [newTitle]);

    const handleAdd = () => {
        if (!newTitle.trim()) return;
        const newSubtask: Subtask = {
            id: nanoid(8),
            title: newTitle.trim(),
            completed: false,
            createdAt: Date.now(),
        };
        onChange([...subtasks, newSubtask]);
        setNewTitle('');
    };

    const handleToggle = (id: string) => {
        onChange(
            subtasks.map((st) =>
                st.id === id ? { ...st, completed: !st.completed } : st
            )
        );
    };

    const handleDelete = (id: string) => {
        onChange(subtasks.filter((st) => st.id !== id));
    };

    const completedCount = subtasks.filter((st) => st.completed).length;
    const totalCount = subtasks.length;
    const progress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

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

            <div className='subtask-items'>
                {subtasks.map((st) => (
                    <div key={st.id} className={`subtask-item ${st.completed ? 'completed' : ''}`}>
                        <input
                            type='checkbox'
                            checked={st.completed}
                            onChange={() => handleToggle(st.id)}
                            className='subtask-checkbox'
                        />
                        <span className='subtask-title'>{st.title}</span>
                        <button
                            type='button'
                            className='subtask-delete'
                            onClick={() => handleDelete(st.id)}
                            title='删除'
                        >
                            ✕
                        </button>
                    </div>
                ))}
            </div>

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
                        // make it look like an input
                        fontFamily: 'inherit',
                        lineHeight: 'inherit'
                    }}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleAdd();
                        }
                    }}
                />
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

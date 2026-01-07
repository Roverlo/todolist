import { useState, useRef, useEffect } from 'react';
import { Icon } from '../ui/Icon';
import { useAppStore } from '../../state/appStore';

interface NoteTagPopupProps {
    noteId: string;
    onClose: () => void;
    position: { x: number; y: number };
}

export function NoteTagPopup({ noteId, onClose, position }: NoteTagPopupProps) {
    const notes = useAppStore((state) => state.notes);
    const allTags = useAppStore((state) => state.tags);
    const updateNote = useAppStore((state) => state.updateNote);
    const addNoteTag = useAppStore((state) => state.addNoteTag);
    const refreshNoteTagCounts = useAppStore((state) => state.refreshNoteTagCounts);

    const note = notes.find(n => n.id === noteId);
    const selectedTags = note?.tags || [];

    const [newTagName, setNewTagName] = useState('');
    const popupRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // 可选标签（排除系统标签）
    const availableTags = allTags.filter(tag => !tag.isSystem);

    // 点击外部关闭
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        setTimeout(() => inputRef.current?.focus(), 50);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);

    const handleToggleTag = (tagName: string) => {
        if (!note) return;
        const newTags = selectedTags.includes(tagName)
            ? selectedTags.filter(t => t !== tagName)
            : [...selectedTags, tagName];
        updateNote(noteId, { tags: newTags });
        refreshNoteTagCounts();
    };

    const handleCreateAndAdd = () => {
        const name = newTagName.trim();
        if (!name) return;

        // 如果标签不存在则创建
        if (!allTags.find(t => t.name === name)) {
            addNoteTag({
                name,
                icon: '🏷️',
                isSystem: false,
            });
        }

        // 添加到笔记
        if (note && !selectedTags.includes(name)) {
            updateNote(noteId, { tags: [...selectedTags, name] });
            refreshNoteTagCounts();
        }
        setNewTagName('');
    };

    // 计算弹窗位置
    const style: React.CSSProperties = {
        position: 'fixed',
        top: position.y,
        left: position.x,
        zIndex: 1000,
    };

    return (
        <div className="note-tag-popup" ref={popupRef} style={style}>
            <div className="note-tag-popup-header">
                <span className="note-tag-popup-title">管理标签</span>
                <button className="note-tag-popup-close" onClick={onClose}>
                    <Icon name="close" size={14} />
                </button>
            </div>

            <div className="note-tag-popup-search">
                <input
                    ref={inputRef}
                    type="text"
                    placeholder="搜索或创建标签..."
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && newTagName.trim()) {
                            handleCreateAndAdd();
                        }
                        if (e.key === 'Escape') {
                            onClose();
                        }
                    }}
                />
            </div>

            <div className="note-tag-popup-list">
                {availableTags
                    .filter(tag =>
                        !newTagName.trim() ||
                        tag.name.toLowerCase().includes(newTagName.toLowerCase())
                    )
                    .map(tag => {
                        const isSelected = selectedTags.includes(tag.name);
                        return (
                            <button
                                key={tag.id}
                                className={'note-tag-popup-item' + (isSelected ? ' selected' : '')}
                                onClick={() => handleToggleTag(tag.name)}
                            >
                                <span className="note-tag-popup-icon">{tag.icon}</span>
                                <span className="note-tag-popup-name">{tag.name}</span>
                                {isSelected && (
                                    <Icon name="check" size={14} className="note-tag-popup-check" />
                                )}
                            </button>
                        );
                    })
                }

                {/* 创建新标签 */}
                {newTagName.trim() && !allTags.find(t => t.name.toLowerCase() === newTagName.toLowerCase()) && (
                    <button
                        className="note-tag-popup-item create"
                        onClick={handleCreateAndAdd}
                    >
                        <Icon name="plus" size={14} />
                        <span>创建 "{newTagName.trim()}"</span>
                    </button>
                )}

                {availableTags.length === 0 && !newTagName.trim() && (
                    <div className="note-tag-popup-empty">
                        暂无标签，输入名称创建
                    </div>
                )}
            </div>
        </div>
    );
}

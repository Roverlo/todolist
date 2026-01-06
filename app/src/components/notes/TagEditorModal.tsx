import { useState } from 'react';
import { Icon } from '../ui/Icon';
import { useAppStore } from '../../state/appStore';

interface TagEditorModalProps {
    onClose: () => void;
}

const EMOJI_PRESETS = ['🏷️', '💼', '🏠', '💡', '📚', '🎯', '🔥', '⭐', '📝', '🎨', '🚀', '💪', '🎓', '🌟', '✨', '❤️'];

export function TagEditorModal({ onClose }: TagEditorModalProps) {
    const tags = useAppStore((state) => state.tags);
    const addNoteTag = useAppStore((state) => state.addNoteTag);
    const deleteNoteTag = useAppStore((state) => state.deleteNoteTag);

    const [newTagName, setNewTagName] = useState('');
    const [newTagIcon, setNewTagIcon] = useState('🏷️');

    const handleAddTag = () => {
        if (newTagName.trim()) {
            addNoteTag({
                name: newTagName.trim(),
                icon: newTagIcon,
                isSystem: false,
            });
            setNewTagName('');
            setNewTagIcon('🏷️');
        }
    };

    const handleDeleteTag = (tagId: string) => {
        const tag = tags.find(t => t.id === tagId);
        if (tag && !tag.isSystem) {
            if (confirm(`确定要删除标签"${tag.name}"吗？\n关联的笔记不会被删除，但会移除该标签。`)) {
                deleteNoteTag(tagId);
            }
        }
    };

    return (
        <div className="tag-editor-overlay" onClick={onClose}>
            <div
                className="tag-editor-modal"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="tag-editor-header">
                    <h3 className="tag-editor-title">标签管理</h3>
                    <button className="tag-editor-close" onClick={onClose}>
                        <Icon name="close" size={20} />
                    </button>
                </div>

                <div className="tag-editor-body">
                    {/* 新建标签 */}
                    <div className="tag-editor-new">
                        <h4>新建标签</h4>
                        <div className="tag-editor-form">
                            <div className="tag-editor-icon-picker">
                                <div className="tag-editor-icon-selected">{newTagIcon}</div>
                                <div className="tag-editor-icon-list">
                                    {EMOJI_PRESETS.map(emoji => (
                                        <button
                                            key={emoji}
                                            className={'tag-editor-icon-btn' + (newTagIcon === emoji ? ' active' : '')}
                                            onClick={() => setNewTagIcon(emoji)}
                                        >
                                            {emoji}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="tag-editor-input-group">
                                <input
                                    type="text"
                                    placeholder="标签名称"
                                    value={newTagName}
                                    onChange={(e) => setNewTagName(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
                                />
                                <button
                                    className="btn btn-primary"
                                    onClick={handleAddTag}
                                    disabled={!newTagName.trim()}
                                >
                                    <Icon name="plus" size={16} />
                                    <span>添加</span>
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* 已有标签列表 */}
                    <div className="tag-editor-list">
                        <h4>已有标签</h4>
                        {tags.map(tag => (
                            <div key={tag.id} className="tag-editor-item">
                                <span className="tag-editor-item-icon">{tag.icon}</span>
                                <span className="tag-editor-item-name">{tag.name}</span>
                                <span className="tag-editor-item-count">({tag.count})</span>
                                {tag.isSystem ? (
                                    <span className="tag-editor-item-badge">系统</span>
                                ) : (
                                    <button
                                        className="tag-editor-item-delete"
                                        onClick={() => handleDeleteTag(tag.id)}
                                        title="删除标签"
                                    >
                                        <Icon name="trash" size={14} />
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

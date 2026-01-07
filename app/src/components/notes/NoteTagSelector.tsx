import { useState, useRef, useEffect } from 'react';
import { Icon } from '../ui/Icon';
import { useAppStore } from '../../state/appStore';

interface NoteTagSelectorProps {
    selectedTags: string[];  // 标签名数组
    onChange: (tags: string[]) => void;
}

export function NoteTagSelector({ selectedTags, onChange }: NoteTagSelectorProps) {
    const allTags = useAppStore((state) => state.tags);
    const addNoteTag = useAppStore((state) => state.addNoteTag);

    const [showDropdown, setShowDropdown] = useState(false);
    const [newTagName, setNewTagName] = useState('');
    const dropdownRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // 过滤掉系统标签和已选标签
    const availableTags = allTags.filter(
        tag => !tag.isSystem && !selectedTags.includes(tag.name)
    );

    // 点击外部关闭下拉
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setShowDropdown(false);
                setNewTagName('');
            }
        };
        if (showDropdown) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showDropdown]);

    // 添加标签
    const handleAddTag = (tagName: string) => {
        if (!selectedTags.includes(tagName)) {
            onChange([...selectedTags, tagName]);
        }
        setShowDropdown(false);
        setNewTagName('');
    };

    // 移除标签
    const handleRemoveTag = (tagName: string) => {
        onChange(selectedTags.filter(t => t !== tagName));
    };

    // 创建新标签并添加
    const handleCreateAndAdd = () => {
        const name = newTagName.trim();
        if (name && !allTags.find(t => t.name === name)) {
            addNoteTag({
                name,
                icon: '🏷️',
                isSystem: false,
            });
        }
        if (name) {
            handleAddTag(name);
        }
    };

    // 获取标签的图标
    const getTagIcon = (tagName: string): string => {
        const tag = allTags.find(t => t.name === tagName);
        return tag?.icon || '🏷️';
    };

    return (
        <div className="note-tag-selector" ref={dropdownRef}>
            <div className="note-tag-selector-label">
                <Icon name="tag" size={12} />
                <span>标签</span>
            </div>

            <div className="note-tag-selector-content">
                {/* 已选标签 */}
                {selectedTags.map(tagName => (
                    <span key={tagName} className="note-tag-chip">
                        <span className="note-tag-chip-icon">{getTagIcon(tagName)}</span>
                        <span className="note-tag-chip-name">{tagName}</span>
                        <button
                            className="note-tag-chip-remove"
                            onClick={() => handleRemoveTag(tagName)}
                            title="移除标签"
                        >
                            <Icon name="close" size={10} />
                        </button>
                    </span>
                ))}

                {/* 添加按钮 */}
                <button
                    className="note-tag-add-btn"
                    onClick={() => {
                        setShowDropdown(!showDropdown);
                        setTimeout(() => inputRef.current?.focus(), 50);
                    }}
                    title="添加标签"
                >
                    <Icon name="plus" size={12} />
                </button>

                {/* 下拉菜单 */}
                {showDropdown && (
                    <div className="note-tag-dropdown">
                        {/* 搜索/创建输入框 */}
                        <div className="note-tag-dropdown-input">
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
                                        setShowDropdown(false);
                                        setNewTagName('');
                                    }
                                }}
                            />
                        </div>

                        {/* 可选标签列表 */}
                        <div className="note-tag-dropdown-list">
                            {availableTags
                                .filter(tag =>
                                    !newTagName.trim() ||
                                    tag.name.toLowerCase().includes(newTagName.toLowerCase())
                                )
                                .map(tag => (
                                    <button
                                        key={tag.id}
                                        className="note-tag-dropdown-item"
                                        onClick={() => handleAddTag(tag.name)}
                                    >
                                        <span className="note-tag-dropdown-icon">{tag.icon}</span>
                                        <span className="note-tag-dropdown-name">{tag.name}</span>
                                        <span className="note-tag-dropdown-count">({tag.count})</span>
                                    </button>
                                ))
                            }

                            {/* 创建新标签选项 */}
                            {newTagName.trim() && !allTags.find(t => t.name.toLowerCase() === newTagName.toLowerCase()) && (
                                <button
                                    className="note-tag-dropdown-item create"
                                    onClick={handleCreateAndAdd}
                                >
                                    <Icon name="plus" size={14} />
                                    <span>创建 "{newTagName.trim()}"</span>
                                </button>
                            )}

                            {/* 空状态 */}
                            {availableTags.length === 0 && !newTagName.trim() && (
                                <div className="note-tag-dropdown-empty">
                                    暂无可用标签，输入名称创建
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

import { useState } from 'react';
import { useAppStore } from '../../state/appStore';
import { Icon } from '../ui/Icon';
import { TagEditorModal } from './TagEditorModal';

export function NotesTags() {
    const tags = useAppStore((state) => state.tags);
    const activeTagId = useAppStore((state) => state.activeNoteTagId);
    const setActiveTag = useAppStore((state) => state.setActiveNoteTag);

    const [showEditor, setShowEditor] = useState(false);
    const [expanded, setExpanded] = useState(false); // 默认折叠以节省空间

    return (
        <>
            <div className="notes-tags">
                <div
                    className="notes-tags-header"
                    onClick={() => setExpanded(!expanded)}
                    style={{ cursor: 'pointer' }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Icon name={expanded ? 'chevronDown' : 'chevronRight'} size={12} />
                        <span className="notes-tags-title">标签 ({tags.length})</span>
                    </div>

                    {expanded && (
                        <button
                            className="notes-tags-add"
                            title="管理标签"
                            onClick={(e) => {
                                e.stopPropagation();
                                setShowEditor(true);
                            }}
                        >
                            <Icon name="plus" size={12} />
                        </button>
                    )}
                </div>

                {expanded && (
                    <div className="notes-tags-list">
                        {tags.map(tag => (
                            <button
                                key={tag.id}
                                className={'notes-tag-item' + (activeTagId === tag.id ? ' active' : '')}
                                onClick={() => setActiveTag(tag.id)}
                            >
                                <span className="notes-tag-icon">{tag.icon}</span>
                                <span className="notes-tag-name">{tag.name}</span>
                                <span className="notes-tag-count">({tag.count})</span>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {showEditor && <TagEditorModal onClose={() => setShowEditor(false)} />}
        </>
    );
}

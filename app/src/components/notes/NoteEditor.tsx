import { useState, useEffect, useCallback } from 'react';
import { Icon } from '../ui/Icon';
import type { Note } from '../../types';

interface NoteEditorProps {
    note: Note | null;
    onSave: (title: string, content: string) => void;
    onCreate?: () => void;
}

export function NoteEditor({ note, onSave, onCreate }: NoteEditorProps) {
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [hasChanges, setHasChanges] = useState(false);
    const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
    const [lastSaved, setLastSaved] = useState<number | null>(null);

    // 同步 note 数据
    useEffect(() => {
        if (note) {
            // 如果只有本地有变更且是同一个笔记，保留本地内容？
            // 简单起见，切换笔记时总是重置为 note 内容
            // 但为了防止自动保存前的瞬间切换导致丢数据，理想情况下父组件切换时应强制保存
            // 目前假设父组件切换前会触发 onBlur 或其他机制，或者依靠 debounced save

            // 为了避免输入时被 note 更新打断，只有 ID 变化时才重置
            // 但 note 对象引用变化可能太频繁，这里假设 note 只在切换或保存后更新
            setTitle(note.title || '');
            setContent(note.content);
            setHasChanges(false);
            setSaveStatus('saved');
            setLastSaved(note.updatedAt);
        } else {
            setTitle('');
            setContent('');
            setHasChanges(false);
            setSaveStatus('saved');
            setLastSaved(null);
        }
    }, [note?.id]); // ⚠️ 关键：只在 ID 变化时重置，避免打字时重置

    const handleSave = useCallback(() => {
        setSaveStatus('saving');
        onSave(title, content);
        setHasChanges(false);
        setTimeout(() => {
            setSaveStatus('saved');
            setLastSaved(Date.now());
        }, 500);
    }, [title, content, onSave]);

    // 自动保存（1秒无输入后 - 加快自动保存频率）
    useEffect(() => {
        if (hasChanges && note) { // 只有有变更且有 note 时才保存
            const timer = setTimeout(() => {
                handleSave();
            }, 1000);
            return () => clearTimeout(timer);
        }
    }, [hasChanges, content, title, handleSave, note]);

    const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setTitle(e.target.value);
        setHasChanges(true);
        setSaveStatus('unsaved');
    };

    const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setContent(e.target.value);
        setHasChanges(true);
        setSaveStatus('unsaved');
    };

    // 快捷键保存 (Ctrl+S)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                if (hasChanges && note) {
                    handleSave();
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [hasChanges, handleSave, note]);

    // 格式化最后保存时间
    const formatLastSaved = () => {
        if (!lastSaved) return '';
        const seconds = Math.floor((Date.now() - lastSaved) / 1000);
        if (seconds < 60) return '刚刚保存';
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes}分钟前保存`;
        const hours = Math.floor(minutes / 60);
        return `${hours}小时前保存`;
    };

    if (!note) {
        return (
            <div className="note-editor-empty">
                <Icon name="note" className="note-editor-empty-icon" />
                <h3>开始您的随记之旅</h3>
                <p>记录当下的想法、灵感或待办事项。<br />所有内容将自动保存并安全存储。</p>
                {onCreate && (
                    <button className="note-editor-empty-btn" onClick={onCreate}>
                        <Icon name="plus" size={16} />
                        <span>创建新随记</span>
                    </button>
                )}
            </div>
        );
    }

    const wordCount = content.length;
    const charCount = content.replace(/\s/g, '').length;

    return (
        <div className="note-editor">
            <input
                className="note-editor-title"
                type="text"
                placeholder="标题（可选）"
                value={title}
                onChange={handleTitleChange}
            />

            <textarea
                className="note-editor-content"
                placeholder="在此记录你的想法...&#10;&#10;💡 提示：&#10;- 支持 Markdown 格式&#10;- Ctrl+S 快速保存&#10;- 停止输入1秒后自动保存"
                value={content}
                onChange={handleContentChange}
            />

            <div className="note-editor-footer">
                <div className="note-editor-meta">
                    <span className="note-editor-count">
                        字数: {wordCount} ({charCount}字符)
                    </span>

                    {saveStatus === 'saving' && (
                        <span className="note-editor-status saving">
                            <Icon name="refresh" size={12} />
                            保存中...
                        </span>
                    )}

                    {saveStatus === 'saved' && lastSaved && (
                        <span className="note-editor-status saved">
                            <Icon name="check" size={12} />
                            {formatLastSaved()}
                        </span>
                    )}

                    {saveStatus === 'unsaved' && (
                        <span className="note-editor-status unsaved">
                            <Icon name="warning" size={12} />
                            未保存
                        </span>
                    )}

                    {note && (
                        <span className="note-editor-created">
                            创建于 {new Date(note.createdAt).toLocaleString('zh-CN', {
                                year: 'numeric',
                                month: '2-digit',
                                day: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit'
                            })}
                        </span>
                    )}
                </div>

                <div className="note-editor-actions">
                    <button
                        className="btn btn-light"
                        onClick={() => {
                            // 导出功能
                            const blob = new Blob([`# ${title}\n\n${content}`], { type: 'text/markdown' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `${title || '未命名随记'}.md`;
                            a.click();
                            URL.revokeObjectURL(url);
                        }}
                        title="导出为 Markdown"
                    >
                        <Icon name="save" size={16} />
                        <span>导出</span>
                    </button>

                    <button
                        className="btn btn-primary"
                        onClick={handleSave}
                        disabled={saveStatus === 'saving'}
                        title="Ctrl+S"
                    >
                        <Icon name="check" size={16} />
                        <span>保存</span>
                    </button>
                </div>
            </div>
        </div>
    );
}

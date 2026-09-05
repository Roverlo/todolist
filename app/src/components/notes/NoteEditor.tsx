import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../ui/Icon';
import type { Note } from '../../types';
import { useAppStore } from '../../state/appStore';
import { getNoteDate, isNoteDate } from '../../utils/noteDate';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import { TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import TextAlign from '@tiptap/extension-text-align';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import { FontSize } from './extensions/FontSize';
import { EditorToolbar } from './EditorToolbar';
import { NoteTagSelector } from './NoteTagSelector';
import './RichTextEditor.css';

interface NoteEditorProps {
    note: Note | null;
    onSave: (title: string, content: string, tags?: string[]) => void;
    onCreate?: () => void;
}

export function NoteEditor(props: NoteEditorProps) {
    return <NoteEditorContent key={props.note?.id} {...props} />;
}

function NoteEditorContent({ note, onSave, onCreate }: NoteEditorProps) {
    const [title, setTitle] = useState(note?.title || '');
    const [tags, setTags] = useState<string[]>(note?.tags || []);
    const [hasChanges, setHasChanges] = useState(false);
    const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
    const [lastSaved, setLastSaved] = useState<number | null>(note?.updatedAt ?? null);
    const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

    useEffect(() => {
        setPortalTarget(document.getElementById('editor-toolbar-portal'));
    }, []);

    const editor = useEditor({
        extensions: [
            StarterKit,
            Underline,
            TextStyle,
            FontSize,
            Color,
            Highlight.configure({
                multicolor: true,
            }),
            TextAlign.configure({
                types: ['heading', 'paragraph'],
            }),
            Image,
            Placeholder.configure({
                placeholder: '在此记录你的想法...\n\n💡 提示：\n- 支持 Markdown 快捷键\n- Ctrl+S 快速保存',
            }),
        ],
        content: note?.content || '',
        onUpdate: () => {
            setHasChanges(true);
            setSaveStatus('unsaved');
        },
    });

    const handleSave = useCallback(() => {
        if (!editor) return;

        setSaveStatus('saving');
        const contentHtml = editor.getHTML();
        onSave(title, contentHtml, tags);
        setHasChanges(false);
        setTimeout(() => {
            setSaveStatus('saved');
            setLastSaved(Date.now());
        }, 500);
    }, [title, tags, editor, onSave]);

    // Auto save (3s debounce)
    useEffect(() => {
        if (hasChanges && note) {
            const timer = setTimeout(() => {
                handleSave();
            }, 3000);
            return () => clearTimeout(timer);
        }
    }, [hasChanges, title, handleSave, note]);

    const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setTitle(e.target.value);
        setHasChanges(true);
        setSaveStatus('unsaved');
    };

    const handleTagsChange = (newTags: string[]) => {
        setTags(newTags);
        setHasChanges(true);
        setSaveStatus('unsaved');
    };

    // Keyboard shortcuts (Ctrl+S)
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

    // Use usage of storage if available or text length
    const charCount = editor?.storage.characterCount?.characters?.() ?? editor?.getText().length ?? 0;

    return (
        <div className="note-editor">
            <label className="note-editor-date">
                所属日期
                <input
                    type="date"
                    aria-label="所属日期"
                    value={getNoteDate(note)}
                    max="9999-12-31"
                    required
                    onChange={(e) => {
                        if (isNoteDate(e.target.value)) {
                            useAppStore.getState().updateNote(note.id, { date: e.target.value });
                        }
                    }}
                />
            </label>
            <input
                className="note-editor-title"
                type="text"
                placeholder="标题（可选）"
                value={title}
                onChange={handleTitleChange}
            />

            {/* Render Toolbar via Portal if target exists */}
            {portalTarget && editor && createPortal(
                <EditorToolbar editor={editor} />,
                portalTarget
            )}

            <div
                className="note-editor-content-wrapper"
                onClick={(e) => {
                    // Only focus if clicking the wrapper itself directly, not the editor content
                    if (editor && e.target === e.currentTarget) {
                        editor.commands.focus('end');
                    }
                }}
            >
                <EditorContent editor={editor} className="editor-content" />
            </div>

            <div className="note-editor-footer">
                <div className="note-editor-meta">
                    {/* 标签选择器（胶囊样式） */}
                    <NoteTagSelector
                        selectedTags={tags}
                        onChange={handleTagsChange}
                    />

                    <span className="note-editor-count">
                        字数: {charCount}
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
                            const html = editor?.getHTML() || '';
                            const blob = new Blob([html], { type: 'text/html' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `${title || '未命名随记'}.html`;
                            a.click();
                            URL.revokeObjectURL(url);
                        }}
                        title="导出为 HTML"
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

import { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../ui/Icon';
import type { Note } from '../../types';
import { useEditor, EditorContent } from '@tiptap/react';
import { RichTextProvider } from 'reactjs-tiptap-editor';
import { localeActions } from 'reactjs-tiptap-editor/locale-bundle';
import { noteExtensions } from './extensions/NoteExtensions';
import { useToastStore } from '../../state/toastStore';
import { EditorToolbar } from './EditorToolbar';
import { NoteTagSelector } from './NoteTagSelector';
import 'reactjs-tiptap-editor/style.css';
import './RichTextEditor.css';

localeActions.setLang('zh_CN');

interface NoteEditorProps {
    note: Note | null;
    onSave: (title: string, content: string, tags?: string[]) => void;
    onCreate?: () => void;
    onDraftChange?: (draft: Pick<Note, 'id' | 'title' | 'content'>) => void;
}

export function NoteEditor(props: NoteEditorProps) {
    return <NoteEditorContent key={props.note?.id} {...props} />;
}

function NoteEditorContent({ note, onSave, onCreate, onDraftChange }: NoteEditorProps) {
    const [title, setTitle] = useState(note?.title || '');
    const [tags, setTags] = useState<string[]>(note?.tags || []);
    const [contentHtml, setContentHtml] = useState(note?.content || '');
    const [revision, setRevision] = useState(0);
    const [hasChanges, setHasChanges] = useState(false);
    const [saveStatus, setSaveStatus] = useState<'saved' | 'unsaved'>('saved');
    const [lastSaved, setLastSaved] = useState<number | null>(note?.updatedAt ?? null);
    const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
    const pendingSave = useRef(false);
    const draft = useRef({ title, tags, contentHtml, onSave });
    const noteId = note?.id;

    useEffect(() => {
        if (noteId) onDraftChange?.({ id: noteId, title, content: contentHtml });
    }, [noteId, title, contentHtml, onDraftChange]);

    useLayoutEffect(() => {
        draft.current = { title, tags, contentHtml, onSave };
    }, [title, tags, contentHtml, onSave]);

    const markChanged = useCallback(() => {
        pendingSave.current = true;
        setRevision(value => value + 1);
        setHasChanges(true);
        setSaveStatus('unsaved');
    }, []);

    useEffect(() => {
        setPortalTarget(document.getElementById('editor-toolbar-portal'));
    }, []);

    const editor = useEditor({
        immediatelyRender: false,
        extensions: noteExtensions,
        content: note?.content || '',
        editorProps: { attributes: { 'aria-label': '随记正文', role: 'textbox', 'aria-multiline': 'true' } },
        onUpdate: ({ editor }) => {
            setContentHtml(editor.getHTML());
            markChanged();
        },
    });

    const saveDraft = useCallback(() => {
        if (!pendingSave.current) return false;
        try {
            const current = draft.current;
            current.onSave(current.title, current.contentHtml, current.tags);
            pendingSave.current = false;
            return true;
        } catch (error) {
            useToastStore.getState().addToast(error instanceof Error ? error.message : '随记保存失败，请重试', 'error');
            return false;
        }
    }, []);

    const handleSave = useCallback(() => {
        if (saveDraft()) {
            setHasChanges(false);
            setSaveStatus('saved');
            setLastSaved(Date.now());
        }
    }, [saveDraft]);

    // Flush the old note's snapshot before its editor is destroyed on navigation.
    useEffect(() => {
        const flush = () => { saveDraft(); };
        window.addEventListener('pagehide', flush);
        return () => {
            window.removeEventListener('pagehide', flush);
            flush();
        };
    }, [saveDraft]);

    // Auto save (3s debounce)
    useEffect(() => {
        if (hasChanges && note) {
            const timer = setTimeout(() => {
                handleSave();
            }, 3000);
            return () => clearTimeout(timer);
        }
    }, [hasChanges, revision, handleSave, note]);

    const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setTitle(e.target.value);
        markChanged();
    };

    const handleTagsChange = (newTags: string[]) => {
        setTags(newTags);
        markChanged();
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

    const charCount = editor?.getText().length ?? 0;

    return (
        <div className="note-editor">
            <input
                className="note-editor-title"
                type="text"
                placeholder="标题（可选）"
                value={title}
                onChange={handleTitleChange}
            />

            {editor && <RichTextProvider editor={editor}>
                {portalTarget ? createPortal(<EditorToolbar editor={editor} />, portalTarget) : <EditorToolbar editor={editor} />}
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
            </RichTextProvider>}

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

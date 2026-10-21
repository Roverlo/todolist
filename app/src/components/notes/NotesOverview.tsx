import { memo, useEffect, useMemo, type CSSProperties, type ReactNode } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import { RichTextProvider } from 'reactjs-tiptap-editor';
import { useAppStore } from '../../state/appStore';
import { noteExtensions } from './extensions/NoteExtensions';
import { noteTaskTimeSettings } from '../../utils/noteTaskTime';
import 'reactjs-tiptap-editor/style.css';
import './RichTextEditor.css';

// Reuse the editor's schema and attachment renderer; never inject stored HTML directly.
const JournalDocument = memo(function JournalDocument({ content }: { content: string }) {
    const editor = useEditor({
        immediatelyRender: false,
        editable: false,
        extensions: noteExtensions,
        content,
        parseOptions: { preserveWhitespace: 'full' },
        editorProps: {
            attributes: { 'aria-label': '汇总日记正文', tabindex: '-1' },
            // Read-only summaries must not run editor paste/drop or formatting shortcuts.
            handlePaste: () => true,
            handleDrop: () => true,
            handleKeyDown: (_view, event) => !['Tab', 'Escape', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)
                && !((event.ctrlKey || event.metaKey) && ['a', 'c', 'f'].includes(event.key.toLowerCase())),
        },
    });
    useEffect(() => {
        if (editor && editor.getHTML() !== content) editor.commands.setContent(content, { emitUpdate: false, parseOptions: { preserveWhitespace: 'full' } });
    }, [editor, content]);
    return editor && <div className="note-editor notes-overview-body"><RichTextProvider editor={editor}><EditorContent editor={editor} className="editor-content" /></RichTextProvider></div>;
});

export function NotesOverview({ settingsButton }: { settingsButton?: ReactNode }) {
    const notes = useAppStore(state => state.notes);
    const time = noteTaskTimeSettings(useAppStore(state => state.settings.noteTaskTime));
    const visible = useMemo(() => notes.filter(note => !note.deletedAt)
        .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id)), [notes]);
    const content = useMemo(() => visible.map(note => {
        const heading = document.createElement('h2');
        heading.textContent = note.title || '未命名随记';
        return `${heading.outerHTML}<p><em>${new Date(note.createdAt).toLocaleString('zh-CN')}</em></p>${note.content || '<p></p>'}`;
    }).join('<hr>'), [visible]);
    return <section className="notes-overview" aria-label="汇总日记">
        <header className="notes-overview-header"><div><h1>汇总日记</h1>
            <p>所有随记汇成一篇日记，内容自动更新。</p></div>
            <div className="notes-overview-actions"><button type="button" className="btn btn-light" onClick={() => {
                const store = useAppStore.getState();
                store.setNoteSearchText('');
                store.setActiveNoteTag('all');
                store.setNoteViewMode('tree');
            }}>返回随记</button>{settingsButton}</div></header>
        <div className="notes-overview-meta"><span>已收录 {visible.length} 篇随记</span><span>按创建时间从早到晚 · 只读</span></div>
        <div className="notes-overview-content" data-show-created={time.showCreated} data-show-completed={time.showCompleted}
            style={{ '--note-task-created-color': time.createdColor, '--note-task-completed-color': time.completedColor } as CSSProperties}>
            {visible.length ? <article className="notes-overview-journal" aria-label="汇总日记正文"><JournalDocument content={content} /></article>
                : <div className="note-editor-empty"><h3>还没有随记</h3><p>新建随记后，内容会自动汇入这篇日记。</p></div>}
        </div>
    </section>;
}

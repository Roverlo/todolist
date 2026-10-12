import { memo, useEffect, useMemo, type CSSProperties, type ReactNode } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import { RichTextProvider } from 'reactjs-tiptap-editor';
import { useAppStore } from '../../state/appStore';
import { noteExtensions } from './extensions/NoteExtensions';
import { noteTaskTimeSettings } from '../../utils/noteTaskTime';
import type { Note } from '../../types';
import 'reactjs-tiptap-editor/style.css';
import './RichTextEditor.css';

// Reuse the editor's schema and attachment renderer; never inject stored HTML directly.
const NotePreview = memo(function NotePreview({ note }: { note: Note }) {
    const editor = useEditor({
        immediatelyRender: false,
        editable: false,
        extensions: noteExtensions,
        content: note.content,
        parseOptions: { preserveWhitespace: 'full' },
        editorProps: {
            attributes: { 'aria-label': `随记内容：${note.title || '未命名随记'}`, tabindex: '-1' },
            // Read-only summaries must not run editor paste/drop or formatting shortcuts.
            handlePaste: () => true,
            handleDrop: () => true,
            handleKeyDown: (_view, event) => !['Tab', 'Escape', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)
                && !((event.ctrlKey || event.metaKey) && ['a', 'c', 'f'].includes(event.key.toLowerCase())),
        },
    });
    useEffect(() => {
        if (editor && editor.getHTML() !== note.content) editor.commands.setContent(note.content, { emitUpdate: false, parseOptions: { preserveWhitespace: 'full' } });
    }, [editor, note.content]);
    return editor && <div className="note-editor notes-overview-body"><RichTextProvider editor={editor}><EditorContent editor={editor} className="editor-content" /></RichTextProvider></div>;
});

export function NotesOverview({ settingsButton }: { settingsButton?: ReactNode }) {
    const notes = useAppStore(state => state.notes);
    const selectNote = useAppStore(state => state.setSelectedNoteId);
    const time = noteTaskTimeSettings(useAppStore(state => state.settings.noteTaskTime));
    const visible = useMemo(() => notes.filter(note => !note.deletedAt)
        .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id)), [notes]);
    return <section className="notes-overview" aria-label="全部随记汇总">
        <header className="notes-overview-header"><div><h1>全部随记汇总</h1>
            <p>共 {visible.length} 篇 · 按创建时间从早到晚 · 内容随原随记自动更新</p></div>{settingsButton}</header>
        <div className="notes-overview-content" data-show-created={time.showCreated} data-show-completed={time.showCompleted}
            style={{ '--note-task-created-color': time.createdColor, '--note-task-completed-color': time.completedColor } as CSSProperties}>
            {visible.length ? visible.map(note => <article className="notes-overview-note" key={note.id} aria-label={note.title || '未命名随记'}>
                <header><div><h2>{note.title || '未命名随记'}</h2><time dateTime={new Date(note.createdAt).toISOString()}>{new Date(note.createdAt).toLocaleString('zh-CN')}</time></div>
                    <button type="button" className="btn btn-light" onClick={() => {
                        const store = useAppStore.getState();
                        store.setNoteSearchText('');
                        store.setActiveNoteTag('all');
                        selectNote(note.id);
                    }}>打开随记</button></header>
                <NotePreview note={note} />
            </article>) : <div className="note-editor-empty"><h3>还没有随记</h3><p>新建随记后，内容会自动出现在这里。</p></div>}
        </div>
    </section>;
}

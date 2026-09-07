import { useState, useMemo } from 'react';
import { useAppStore, useAppStoreShallow } from '../../state/appStore';
import { NoteEditor } from './NoteEditor';
import { NotesRecycleBin } from './NotesRecycleBin';
import { AIAssistantPanel } from './AIAssistantPanel';
import { AISettingsModal } from './AISettingsModal';
import { Icon } from '../ui/Icon';
import { PanelRight, Settings } from 'lucide-react';
import type { Note } from '../../types';
import './NotesCenter.css';

export function NotesMain() {
    const { notes, updateNote, addNote, refreshNoteTagCounts, selectedNoteId, setSelectedNoteId } = useAppStoreShallow(state => ({
        notes: state.notes,
        updateNote: state.updateNote,
        addNote: state.addNote,
        refreshNoteTagCounts: state.refreshNoteTagCounts,
        selectedNoteId: state.selectedNoteId,
        setSelectedNoteId: state.setSelectedNoteId
    }));

    const noteViewMode = useAppStore((state) => state.noteViewMode);

    // Initial tag refresh is handled by store or separate effect if needed.
    // Reducing potential for render loops.

    const [aiPanelOpen, setAiPanelOpen] = useState(true);
    const [aiSettingsOpen, setAiSettingsOpen] = useState(false);
    const [draft, setDraft] = useState<Pick<Note, 'id' | 'title' | 'content'> | null>(null);

    const activeNote = useMemo(() => notes.find(n => n.id === selectedNoteId) || null, [notes, selectedNoteId]);

    const handleSaveNote = (title: string, content: string, tags?: string[]) => {
        if (activeNote) {
            updateNote(activeNote.id, { title, content, tags });
            refreshNoteTagCounts();
        }
    };

    const handleCreateNote = () => {
        const newNote = addNote({ title: '', content: '' });
        setSelectedNoteId(newNote.id);
    };

    const toolbarActions = (
        <div className="notes-center-actions">
            <button onClick={() => setAiPanelOpen(!aiPanelOpen)} className="btn btn-light" aria-pressed={aiPanelOpen}
                aria-label={aiPanelOpen ? '隐藏 AI 助手' : '显示 AI 助手'} title="AI助手：一键生成待办事项">
                <PanelRight size={16} />
                <span>AI助手<span className="notes-ai-description">：一键生成待办事项</span></span>
            </button>
            <button onClick={() => setAiSettingsOpen(true)} className="btn btn-light notes-settings-btn" aria-label="AI 设置" title="AI 设置">
                <Settings size={17} />
            </button>
        </div>
    );

    return (
        <div className="notes-main-root">
            {/* Editing actions share the full-width toolbar; empty/trash views keep a small header. */}
            {(!activeNote || noteViewMode === 'trash') && <div className="notes-center-header">
                <div className="notes-center-title">
                    <Icon name="note" size={18} />
                    <span className="notes-center-title-text">随记编辑器</span>
                </div>
                {toolbarActions}
            </div>}

            <div id="editor-toolbar-portal" />

            <div className="notes-center-main">
                <section className="notes-document" aria-label="随记编辑区">
                    <main className="notes-center-editor">
                        {noteViewMode === 'trash' ? (
                            <NotesRecycleBin />
                        ) : (
                            <NoteEditor note={activeNote} onSave={handleSaveNote} onCreate={handleCreateNote} onDraftChange={setDraft} toolbarActions={toolbarActions} />
                        )}
                    </main>
                </section>

                <aside className="notes-center-ai-panel" aria-label="AI 助手面板" hidden={!aiPanelOpen}>
                    <AIAssistantPanel key={activeNote?.id} note={activeNote && draft?.id === activeNote.id ? { ...activeNote, ...draft } : activeNote} />
                </aside>
            </div>

            {aiSettingsOpen && <AISettingsModal onClose={() => setAiSettingsOpen(false)} />}
        </div>
    );
}

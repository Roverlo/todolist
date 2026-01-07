import { useState, useMemo } from 'react';
import { useAppStore, useAppStoreShallow } from '../../state/appStore';
import { NoteEditor } from './NoteEditor';
import { NotesRecycleBin } from './NotesRecycleBin';
import { AIAssistantPanel } from './AIAssistantPanel';
import { AISettingsModal } from './AISettingsModal';
import { Icon } from '../ui/Icon';
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

    return (
        <div className="notes-main-root" style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', overflow: 'hidden', background: 'var(--bg)' }}>
            {/* Header / Toolbar */}
            <div className="notes-center-header" style={{ position: 'relative', zIndex: 10 }}>
                <div className="notes-center-title" style={{ paddingRight: '20px' }}>
                    <Icon name="note" size={18} />
                    <span className="notes-center-title-text" style={{ fontSize: '14px' }}>随记编辑器</span>
                </div>

                {/* Portal Target for Editor Toolbar */}
                <div id="editor-toolbar-portal" style={{ flex: 1, display: 'flex', alignItems: 'center', marginLeft: '-10px' }}></div>

                <div className="notes-center-actions">
                    <button onClick={() => setAiPanelOpen(!aiPanelOpen)} className={`btn btn-light ${aiPanelOpen ? 'active' : ''}`} title={aiPanelOpen ? '隐藏 AI 助手' : '显示 AI 助手'}>
                        <Icon name="magic" size={16} />
                        <span>{aiPanelOpen ? '隐藏 AI 助手' : '显示 AI 助手'}</span>
                    </button>
                    <button onClick={() => setAiSettingsOpen(true)} className="btn btn-light" title="AI 设置">
                        <Icon name="settings" size={16} />
                    </button>
                </div>
            </div>

            {/* Main Content Area */}
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                {/* Editor or Recycle Bin */}
                <main className="notes-center-editor" style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, borderRight: aiPanelOpen ? '1px solid var(--border)' : 'none' }}>
                    {noteViewMode === 'trash' ? (
                        <NotesRecycleBin />
                    ) : (
                        <NoteEditor note={activeNote} onSave={handleSaveNote} onCreate={handleCreateNote} />
                    )}
                </main>

                {/* AI Panel */}
                {aiPanelOpen && (
                    <aside className="notes-center-ai-panel" style={{ width: '320px', flexShrink: 0, background: 'var(--bg-secondary)', borderLeft: '1px solid var(--border)' }}>
                        <AIAssistantPanel note={activeNote} />
                    </aside>
                )}
            </div>

            {aiSettingsOpen && <AISettingsModal onClose={() => setAiSettingsOpen(false)} />}
        </div>
    );
}

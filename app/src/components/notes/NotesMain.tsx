import { useState, useMemo } from 'react';
import { useAppStore, useAppStoreShallow } from '../../state/appStore';
import { NoteEditor } from './NoteEditor';
import { NotesRecycleBin } from './NotesRecycleBin';
import { AIAssistantPanel } from './AIAssistantPanel';
import { AISettingsModal } from './AISettingsModal';
import { Icon } from '../ui/Icon';
import { FileText, PanelRight, Settings } from 'lucide-react';
import { WeeklyReportPanel } from './WeeklyReportPanel';
import { collectWeeklyNotes, type WeeklyReportSource } from '../../utils/weeklyReport';
import { EditorToolButton } from './EditorToolbarControls';
import type { Note } from '../../types';

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
    const [weeklySource, setWeeklySource] = useState<WeeklyReportSource | null>(null);
    const [aiMode, setAiMode] = useState<'tasks' | 'weekly'>('tasks');
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
            <EditorToolButton onClick={() => { setAiPanelOpen(aiMode === 'weekly' || !aiPanelOpen); setAiMode('tasks'); }} className="editor-toolbar-text-button" active={aiPanelOpen && aiMode === 'tasks'}
                label={aiPanelOpen && aiMode === 'tasks' ? '隐藏 AI 助手' : '显示 AI 助手'} icon={PanelRight} description="根据随记内容生成待办事项。">
                <span>AI助手<span className="notes-ai-description">：一键生成待办事项</span></span>
            </EditorToolButton>
            <EditorToolButton onClick={() => setAiSettingsOpen(true)} label="AI 设置" icon={Settings} aria-haspopup="dialog" />
        </div>
    );

    const weeklyAction = <EditorToolButton onClick={() => {
        if (aiMode !== 'weekly') setWeeklySource(collectWeeklyNotes(notes, noteViewMode !== 'trash' && draft?.id === activeNote?.id ? draft : null));
        setAiMode('weekly'); setAiPanelOpen(true);
    }} className="editor-toolbar-text-button" label="一键生成周报" icon={FileText} active={aiPanelOpen && aiMode === 'weekly'} description="汇总本周编辑的随记与已完成事项，生成后可编辑、复制或保存。">
        <span><span className="notes-report-prefix">一键<span className="notes-report-verb">生成</span></span>周报</span>
    </EditorToolButton>;

    return (
        <div className="notes-main-root">
            {/* Editing actions share the full-width toolbar; empty/trash views keep a small header. */}
            {(!activeNote || noteViewMode === 'trash') && <div className="notes-center-header">
                <div className="notes-center-title">
                    <Icon name="note" size={18} />
                    <span className="notes-center-title-text">随记编辑器</span>
                </div>
                <div className="notes-ai-actions">{toolbarActions}{weeklyAction}</div>
            </div>}

            <div id="editor-toolbar-portal" />

            <div className="notes-center-main">
                <section className="notes-document" aria-label="随记编辑区">
                    <main className="notes-center-editor">
                        {noteViewMode === 'trash' ? (
                            <NotesRecycleBin />
                        ) : (
                            <NoteEditor note={activeNote} onSave={handleSaveNote} onCreate={handleCreateNote} onDraftChange={setDraft} toolbarActions={toolbarActions} toolbarSecondaryActions={weeklyAction} />
                        )}
                    </main>
                </section>

                <aside className="notes-center-ai-panel" aria-label="AI 助手面板" hidden={!aiPanelOpen}>
                    {aiMode === 'weekly' && weeklySource
                        ? <WeeklyReportPanel source={weeklySource} onBack={() => setAiMode('tasks')} />
                        : <AIAssistantPanel key={activeNote?.id} note={activeNote && draft?.id === activeNote.id ? { ...activeNote, ...draft } : activeNote} />}
                </aside>
            </div>

            {aiSettingsOpen && <AISettingsModal onClose={() => setAiSettingsOpen(false)} />}
        </div>
    );
}

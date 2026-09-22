import { useState, useMemo } from 'react';
import { useAppStore, useAppStoreShallow } from '../../state/appStore';
import { NoteEditor } from './NoteEditor';
import { NotesRecycleBin } from './NotesRecycleBin';
import { AIAssistantPanel } from './AIAssistantPanel';
import { AISettingsModal } from './AISettingsModal';
import { Icon } from '../ui/Icon';
import { FileText, ListTodo, PanelRightClose, PanelRightOpen, Settings } from 'lucide-react';
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

    const [aiSettingsOpen, setAiSettingsOpen] = useState(false);
    const [weeklySource, setWeeklySource] = useState<WeeklyReportSource | null>(null);
    const [aiMode, setAiMode] = useState<'tasks' | 'weekly'>('weekly');
    const [aiPanelOpen, setAiPanelOpen] = useState(true);
    const [draft, setDraft] = useState<Pick<Note, 'id' | 'title' | 'content'> | null>(null);

    const activeNote = useMemo(() => notes.find(n => n.id === selectedNoteId) || null, [notes, selectedNoteId]);
    const weeklyPreview = useMemo(() => collectWeeklyNotes(notes, noteViewMode !== 'trash' && draft?.id === activeNote?.id ? draft : null),
        [notes, noteViewMode, draft, activeNote?.id]);
    const startWeeklyReport = () => setWeeklySource(collectWeeklyNotes(notes, noteViewMode !== 'trash' && draft?.id === activeNote?.id ? draft : null));

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
        <div className="notes-main-root">
            <div className="notes-command-bar">
                <div className="notes-editor-tools">
                    {(!activeNote || noteViewMode === 'trash') && <div className="notes-center-header">
                        <div className="notes-center-title"><Icon name="note" size={18} /><span className="notes-center-title-text">随记编辑器</span></div>
                    </div>}
                    <div id="editor-toolbar-portal" />
                </div>
                <section className="notes-ai-tools" aria-labelledby="notes-ai-heading">
                    <div className="notes-ai-heading"><h2 id="notes-ai-heading">AI 助手</h2>
                        <EditorToolButton className="notes-ai-toggle" onClick={() => setAiPanelOpen(open => !open)} label={aiPanelOpen ? '收起 AI 面板' : '展开 AI 面板'}
                            icon={aiPanelOpen ? PanelRightClose : PanelRightOpen} aria-expanded={aiPanelOpen} aria-controls="notes-ai-panel"><span>{aiPanelOpen ? '收起' : '展开'}</span></EditorToolButton>
                        <EditorToolButton onClick={() => setAiSettingsOpen(true)} label="AI 设置" icon={Settings} aria-haspopup="dialog" />
                    </div>
                    <div className="notes-ai-actions" role="group" aria-label="AI 功能">
                        <EditorToolButton onClick={() => {
                            if (aiMode !== 'weekly' || !weeklySource) startWeeklyReport();
                            setAiMode('weekly');
                            setAiPanelOpen(true);
                        }} className="notes-ai-action" label="一键生成周报" icon={FileText} active={aiMode === 'weekly'}
                            description="汇总本周编辑的随记与已完成事项，生成后可编辑、复制或保存。"><span>一键生成周报</span></EditorToolButton>
                        <EditorToolButton onClick={() => { setAiMode('tasks'); setAiPanelOpen(true); setWeeklySource(null); }} className="notes-ai-action" active={aiMode === 'tasks'}
                            label="一键生成待办事项" icon={ListTodo} description="根据当前随记生成待办事项。"><span>一键生成待办事项</span></EditorToolButton>
                    </div>
                </section>
            </div>

            <div className="notes-center-main">
                <section className="notes-document" aria-label="随记编辑区">
                    <main className="notes-center-editor">
                        {noteViewMode === 'trash' ? (
                            <NotesRecycleBin />
                        ) : (
                            <NoteEditor note={activeNote} onSave={handleSaveNote} onCreate={handleCreateNote} onDraftChange={setDraft} />
                        )}
                    </main>
                </section>

                <aside id="notes-ai-panel" className="notes-center-ai-panel" aria-label="AI 助手面板" hidden={!aiPanelOpen}>
                    {aiMode === 'weekly'
                        ? <WeeklyReportPanel source={weeklySource ?? weeklyPreview} autoGenerate={weeklySource !== null}
                            onGenerate={startWeeklyReport} />
                        : <AIAssistantPanel key={activeNote?.id} note={activeNote && draft?.id === activeNote.id ? { ...activeNote, ...draft } : activeNote} />}
                </aside>
            </div>

            {aiSettingsOpen && <AISettingsModal onClose={() => setAiSettingsOpen(false)} />}
        </div>
    );
}

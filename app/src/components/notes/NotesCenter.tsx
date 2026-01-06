import { useState, useMemo, useEffect } from 'react';
import { useAppStore } from '../../state/appStore';
import { Icon } from '../ui/Icon';
import { NotesSidebar } from './NotesSidebar';
import { NoteEditor } from './NoteEditor';
import { AIAssistantPanel } from './AIAssistantPanel';
import { AISettingsModal } from './AISettingsModal';
import './NotesCenter.css';
import type { Note } from '../../types';

interface NotesCenterProps {
    onClose?: () => void;
}

export function NotesCenter({ onClose }: NotesCenterProps) {
    const notes = useAppStore((state) => state.notes);
    const addNote = useAppStore((state) => state.addNote);
    const updateNote = useAppStore((state) => state.updateNote);
    const refreshNoteTagCounts = useAppStore((state) => state.refreshNoteTagCounts);

    const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
    // const [isCreating, setIsCreating] = useState(false); // Removed: Immediate creation logic
    const [aiPanelOpen, setAiPanelOpen] = useState(true);
    const [aiSettingsOpen, setAiSettingsOpen] = useState(false);

    // 初始化：刷新标签计数
    useEffect(() => {
        refreshNoteTagCounts();
    }, [refreshNoteTagCounts]);

    // 当前选中的笔记
    const activeNote = useMemo(() => {
        return notes.find(n => n.id === selectedNoteId) || null;
    }, [notes, selectedNoteId]);

    // 选择笔记
    const handleSelectNote = (note: Note) => {
        setSelectedNoteId(note.id);
    };

    // 新建笔记 (立即创建)
    const handleCreateNote = () => {
        const newNote = addNote({
            title: '',
            content: '',
        });
        // setIsCreating(false); // Removed
        setSelectedNoteId(newNote.id);
    };

    // 保存笔记 (仅更新)
    const handleSaveNote = (title: string, content: string) => {
        if (activeNote) {
            updateNote(activeNote.id, { title, content });
        }
    };

    return (
        <div className="notes-center-root">
            {/* 顶部标题栏 - 优化版 */}
            <header className="notes-center-header">
                <div className="notes-center-title">
                    <Icon name="note" size={18} />
                    <span className="notes-center-title-text">随记中心</span>
                </div>

                <div className="notes-center-actions">
                    <button
                        onClick={() => setAiPanelOpen(!aiPanelOpen)}
                        className={`btn btn-light ${aiPanelOpen ? 'active' : ''}`}
                        title={aiPanelOpen ? '隐藏 AI 面板' : '显示 AI 面板'}
                    >
                        <Icon name="magic" size={16} />
                        <span>{aiPanelOpen ? '隐藏' : '显示'} AI</span>
                    </button>
                    <button
                        onClick={() => setAiSettingsOpen(true)}
                        className="btn btn-light"
                        title="AI 设置"
                    >
                        <Icon name="settings" size={16} />
                    </button>
                    {onClose && (
                        <button
                            onClick={onClose}
                            className="btn btn-light"
                            title="关闭"
                        >
                            <Icon name="close" size={16} />
                        </button>
                    )}
                </div>
            </header>

            {/* 主内容区：三栏布局 */}
            <div className="notes-center-main">
                {/* 左侧边栏 */}
                <aside className="notes-center-sidebar">
                    <NotesSidebar
                        selectedNoteId={selectedNoteId}
                        onSelectNote={handleSelectNote}
                        onCreateNote={handleCreateNote}
                    />
                </aside>

                {/* 中间编辑区 */}
                <main className="notes-center-editor">
                    <NoteEditor
                        note={activeNote}
                        onSave={handleSaveNote}
                        onCreate={handleCreateNote}
                    />
                </main>

                {/* 右侧 AI 面板 */}
                {aiPanelOpen && (
                    <aside className="notes-center-ai-panel">
                        <AIAssistantPanel
                            note={activeNote}
                        />
                    </aside>
                )}
            </div>

            {/* AI 设置弹窗 */}
            {aiSettingsOpen && (
                <AISettingsModal onClose={() => setAiSettingsOpen(false)} />
            )}
        </div>
    );
}

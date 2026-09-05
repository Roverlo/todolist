import { useMemo, useEffect } from 'react';
import { useAppStore } from '../../state/appStore';
import dayjs from 'dayjs';

import { NotesCalendar } from './NotesCalendar';
import { NotesTags } from './NotesTags';
import { NotesTree } from './NotesTree';
import { NotesSearch } from './NotesSearch';
import { NotesToolbar } from './NotesToolbar';
import { Icon } from '../ui/Icon';
import type { Note, NoteTreeNode } from '../../types';
import { getNoteDate } from '../../utils/noteDate';

interface NotesSidebarProps {
    selectedNoteId: string | null;
    onSelectNote: (note: Note) => void;
    onCreateNote: () => void;
}

export function NotesSidebar({ selectedNoteId, onSelectNote, onCreateNote }: NotesSidebarProps) {
    const notes = useAppStore((state) => state.notes);
    const tags = useAppStore((state) => state.tags);
    const searchText = useAppStore((state) => state.noteSearchText) || '';
    const activeTagId = useAppStore((state) => state.activeNoteTagId);
    const treeExpandedState = useAppStore((state) => state.noteTreeExpandedState) || {};
    const toggleTreeNode = useAppStore((state) => state.toggleNoteTreeNode);
    const setTreeNodeExpanded = useAppStore((state) => state.setNoteTreeNodeExpanded);
    const noteViewMode = useAppStore((state) => state.noteViewMode);
    const setNoteViewMode = useAppStore((state) => state.setNoteViewMode);
    const deletedNotesCount = useAppStore((state) => state.notes.filter(n => n.deletedAt).length);

    const selectedDate = useAppStore((state) => state.selectedNoteDate);
    const setSelectedDate = useAppStore((state) => state.setSelectedNoteDate);
    const currentMonth = useAppStore((state) => state.noteCalendarMonth);
    const setCurrentMonth = useAppStore((state) => state.setNoteCalendarMonth);

    // 筛选笔记
    const filteredNotes = useMemo(() => {
        let result = notes.filter(n => !n.deletedAt);

        // 按日期筛选
        if (selectedDate) {
            result = result.filter(note => {
                return getNoteDate(note) === selectedDate;
            });
        }

        // 按标签筛选
        if (activeTagId && activeTagId !== 'all') {
            if (activeTagId === 'uncategorized') {
                // 未分类：没有任何标签的笔记
                result = result.filter(note => !note.tags || note.tags.length === 0);
            } else {
                const tag = tags.find(t => t.id === activeTagId);
                if (tag) {
                    result = result.filter(note =>
                        note.tags?.includes(tag.name)
                    );
                }
            }
        }

        // 按搜索文本筛选
        if (searchText.trim()) {
            const lowerSearch = searchText.toLowerCase();
            result = result.filter(note =>
                note.title.toLowerCase().includes(lowerSearch) ||
                note.content.toLowerCase().includes(lowerSearch)
            );
        }

        return result.sort((a, b) => getNoteDate(b).localeCompare(getNoteDate(a)) || b.updatedAt - a.updatedAt);
    }, [notes, selectedDate, activeTagId, tags, searchText]);

    // 构建树形结构
    const tree = useMemo(() => {
        return buildNoteTree(filteredNotes, treeExpandedState);
    }, [filteredNotes, treeExpandedState]);

    // 展开选中日期所在的月份
    useEffect(() => {
        const now = selectedDate ? dayjs(selectedDate) : dayjs();
        const currentYearId = `year-${now.year()}`;
        const currentMonthId = `month-${now.format('YYYY-MM')}`;

        setTreeNodeExpanded(currentYearId, true);
        setTreeNodeExpanded(currentMonthId, true);
    }, [selectedDate, setTreeNodeExpanded]);

    const handleNodeClick = (node: NoteTreeNode) => {
        if (node.type === 'note' && node.noteId) {
            const note = notes.find(n => n.id === node.noteId);
            if (note) {
                onSelectNote(note);
            }
        } else if (node.children) {
            toggleTreeNode(node.id);
        }
    };

    return (
        <div className="notes-sidebar">
            {/* 搜索框 (置顶) */}
            <NotesSearch />



            <div className="notes-sidebar-calendar-container">
                <NotesCalendar
                    selectedDate={selectedDate ? dayjs(selectedDate) : null}
                    onDateSelect={(date) => setSelectedDate(date.format('YYYY-MM-DD'))}
                    currentMonth={dayjs(currentMonth)}
                    onMonthChange={(date) => setCurrentMonth(date.format('YYYY-MM'))}
                />
                <button className="btn btn-primary notes-calendar-create-btn" onClick={onCreateNote}>
                    <Icon name="plus" size={14} />
                    {selectedDate ? `${selectedDate} 新建随记` : '新建随记'}
                </button>
                {selectedDate && (
                    <button
                        className="notes-calendar-clear-btn"
                        onClick={() => setSelectedDate(null)}
                    >
                        清除筛选 ({filteredNotes.length} 条)
                    </button>
                )}
            </div>

            {/* 快捷导航栏 (控制中枢) - 移至日历下方 */}
            <NotesToolbar
                onToday={() => {
                    const today = dayjs();
                    setSelectedDate(today.format('YYYY-MM-DD'));
                    useAppStore.getState().setNoteSearchText('');
                    useAppStore.getState().setActiveNoteTag('all');
                    setNoteViewMode('tree');
                    const todayNote = notes.find(n => !n.deletedAt && getNoteDate(n) === today.format('YYYY-MM-DD'));
                    if (todayNote) {
                        onSelectNote(todayNote);
                        const yearId = `year-${today.year()}`;
                        const monthId = `month-${today.format('YYYY-MM')}`;
                        setTreeNodeExpanded(yearId, true);
                        setTreeNodeExpanded(monthId, true);
                    } else {
                        onCreateNote();
                    }
                }}
                onPrev={() => {
                    if (!selectedNoteId) return;
                    const index = filteredNotes.findIndex(n => n.id === selectedNoteId);
                    if (index >= 0 && index < filteredNotes.length - 1) {
                        onSelectNote(filteredNotes[index + 1]);
                    }
                }}
                onNext={() => {
                    if (!selectedNoteId) return;
                    const index = filteredNotes.findIndex(n => n.id === selectedNoteId);
                    if (index > 0) {
                        onSelectNote(filteredNotes[index - 1]);
                    }
                }}
                onLocate={() => {
                    if (!selectedNoteId) return;
                    const note = notes.find(n => n.id === selectedNoteId);
                    if (note) {
                        const date = dayjs(getNoteDate(note));
                        setSelectedDate(getNoteDate(note));
                        const yearId = `year-${date.year()}`;
                        const monthId = `month-${date.format('YYYY-MM')}`;
                        setTreeNodeExpanded(yearId, true);
                        setTreeNodeExpanded(monthId, true);

                        setTimeout(() => {
                            const el = document.querySelector(`[data-node-id="note-${selectedNoteId}"]`);
                            if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
                        }, 100);
                    }
                }}
                canPrev={!!selectedNoteId && filteredNotes.findIndex(n => n.id === selectedNoteId) >= 0 && filteredNotes.findIndex(n => n.id === selectedNoteId) < filteredNotes.length - 1}
                canNext={!!selectedNoteId && filteredNotes.findIndex(n => n.id === selectedNoteId) > 0}
                hasActiveNote={!!selectedNoteId}
            />

            {/* 标签 */}
            <NotesTags />

            {/* 树形笔记列表 */}
            <div className="notes-sidebar-tree">
                <NotesTree
                    tree={tree}
                    selectedNoteId={selectedNoteId}
                    onNodeClick={handleNodeClick}
                    onCreateNote={onCreateNote}
                />
            </div>


            {/* 回收站 */}
            <div className="notes-sidebar-footer">
                <button
                    className={`notes-footer-item ${noteViewMode === 'trash' ? 'active' : ''}`}
                    onClick={() => setNoteViewMode('trash')}
                >
                    <Icon name="trash" size={16} />
                    <span>回收站</span>
                    <span className="notes-footer-badge">
                        {deletedNotesCount}
                    </span>
                </button>
            </div>
        </div>
    );
}

// 构建树形结构的辅助函数
function buildNoteTree(notes: Note[], expandedState: Record<string, boolean>): NoteTreeNode {
    const pinnedNotes = notes.filter(n => n.isPinned);
    const regularNotes = notes.filter(n => !n.isPinned);

    // 按日期分组
    const groupedByYear = new Map<number, Map<number, Note[]>>();

    regularNotes.forEach(note => {
        const date = dayjs(getNoteDate(note));
        const year = date.year();
        const month = date.month() + 1;

        if (!groupedByYear.has(year)) {
            groupedByYear.set(year, new Map());
        }
        const yearMap = groupedByYear.get(year)!;

        if (!yearMap.has(month)) {
            yearMap.set(month, []);
        }
        yearMap.get(month)!.push(note);
    });

    // 构建树
    const children: NoteTreeNode[] = [];

    // 置顶分组
    if (pinnedNotes.length > 0) {
        const pinnedChildren = pinnedNotes.map(note => ({
            id: `note-${note.id}`,
            type: 'note' as const,
            label: note.title || '未命名随记',
            icon: '📄',
            collapsed: false,
            count: 0,
            noteId: note.id,
            tags: note.tags,
        }));

        children.push({
            id: 'pinned-group',
            type: 'pinned-group',
            label: '置顶笔记',
            icon: '📌',
            children: pinnedChildren,
            collapsed: expandedState['pinned-group'] === false,
            count: pinnedNotes.length,
        });
    }

    // 年份节点
    Array.from(groupedByYear.entries())
        .sort(([a], [b]) => b - a)
        .forEach(([year, monthMap]) => {
            const yearId = `year-${year}`;
            const yearCount = Array.from(monthMap.values()).reduce((sum, notes) => sum + notes.length, 0);

            const monthChildren: NoteTreeNode[] = Array.from(monthMap.entries())
                .sort(([a], [b]) => b - a)
                .map(([month, monthNotes]) => {
                    const monthId = `month-${year}-${String(month).padStart(2, '0')}`;

                    const noteChildren = monthNotes
                        .sort((a, b) => getNoteDate(b).localeCompare(getNoteDate(a)) || b.updatedAt - a.updatedAt)
                        .map(note => {
                            const noteDate = dayjs(getNoteDate(note));
                            return {
                                id: `note-${note.id}`,
                                type: 'note' as const,
                                label: `${noteDate.format('DD日')} - ${note.title || '未命名随记'}`,
                                icon: '📄',
                                collapsed: false,
                                count: 0,
                                noteId: note.id,
                                tags: note.tags,
                            };
                        });

                    return {
                        id: monthId,
                        type: 'month' as const,
                        label: `${month}月`,
                        icon: '📅',
                        children: noteChildren,
                        collapsed: expandedState[monthId] === false,
                        count: monthNotes.length,
                        date: `${year}-${String(month).padStart(2, '0')}`,
                    };
                });

            children.push({
                id: yearId,
                type: 'year',
                label: `${year}年`,
                icon: '📅',
                children: monthChildren,
                collapsed: expandedState[yearId] === false,
                count: yearCount,
                date: String(year),
            });
        });

    return {
        id: 'root',
        type: 'root',
        label: `我的随记 (${notes.length})`,
        icon: '📁',
        children,
        collapsed: false,
        count: notes.length,
    };
}

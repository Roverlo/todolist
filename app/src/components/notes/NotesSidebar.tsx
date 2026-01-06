import { useState, useMemo, useEffect } from 'react';
import { useAppStore } from '../../state/appStore';
import dayjs from 'dayjs';
import { Icon } from '../ui/Icon';
import { NotesCalendar } from './NotesCalendar';
import { NotesTags } from './NotesTags';
import { NotesTree } from './NotesTree';
import { NotesSearch } from './NotesSearch';
import { NotesToolbar } from './NotesToolbar';
import type { Note, NoteTreeNode } from '../../types';

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

    const [selectedDate, setSelectedDate] = useState<dayjs.Dayjs | null>(null);
    const [currentMonth, setCurrentMonth] = useState(dayjs().startOf('month'));

    // 筛选笔记
    const filteredNotes = useMemo(() => {
        let result = [...notes];

        // 按日期筛选
        if (selectedDate) {
            result = result.filter(note => {
                const noteDate = dayjs(note.updatedAt);
                return noteDate.isSame(selectedDate, 'day');
            });
        }

        // 按标签筛选
        if (activeTagId && activeTagId !== 'all') {
            const tag = tags.find(t => t.id === activeTagId);
            if (tag) {
                result = result.filter(note =>
                    note.tags?.includes(tag.name)
                );
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

        return result;
    }, [notes, selectedDate, activeTagId, tags, searchText]);

    // 构建树形结构
    const tree = useMemo(() => {
        return buildNoteTree(filteredNotes, treeExpandedState);
    }, [filteredNotes, treeExpandedState]);

    // 初始化：展开当前月份
    useEffect(() => {
        const now = dayjs();
        const currentYearId = `year-${now.year()}`;
        const currentMonthId = `month-${now.format('YYYY-MM')}`;

        setTreeNodeExpanded(currentYearId, true);
        setTreeNodeExpanded(currentMonthId, true);
    }, [setTreeNodeExpanded]);

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
                    selectedDate={selectedDate}
                    onDateSelect={(date) => setSelectedDate(date)}
                    currentMonth={currentMonth}
                    onMonthChange={setCurrentMonth}
                />
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
                    const todayNote = notes.find(n => dayjs(n.updatedAt).isSame(today, 'day'));
                    if (todayNote) {
                        onSelectNote(todayNote);
                        const yearId = `year-${today.year()}`;
                        const monthId = `month-${today.format('YYYY-MM')}`;
                        setTreeNodeExpanded(yearId, true);
                        setTreeNodeExpanded(monthId, true);
                        setCurrentMonth(today.startOf('month')); // Sync calendar
                    } else {
                        onCreateNote();
                    }
                }}
                onPrev={() => {
                    if (!selectedNoteId) return;
                    const index = filteredNotes.findIndex(n => n.id === selectedNoteId);
                    if (index < filteredNotes.length - 1) {
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
                        const date = dayjs(note.updatedAt);
                        const yearId = `year-${date.year()}`;
                        const monthId = `month-${date.format('YYYY-MM')}`;
                        setTreeNodeExpanded(yearId, true);
                        setTreeNodeExpanded(monthId, true);
                        setCurrentMonth(date.startOf('month')); // Sync calendar

                        setTimeout(() => {
                            const el = document.querySelector(`[data-node-id="note-${selectedNoteId}"]`);
                            if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
                        }, 100);
                    }
                }}
                canPrev={!!selectedNoteId && filteredNotes.findIndex(n => n.id === selectedNoteId) < filteredNotes.length - 1}
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
                <button className="notes-footer-item">
                    <Icon name="trash" size={16} />
                    <span>回收站</span>
                    <span className="notes-footer-badge">0</span>
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
        const date = dayjs(note.updatedAt);
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
                        .sort((a, b) => b.updatedAt - a.updatedAt)
                        .map(note => {
                            const noteDate = dayjs(note.updatedAt);
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

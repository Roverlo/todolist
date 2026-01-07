import { useMemo, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAppStore } from '../../state/appStore';
import { Icon } from '../ui/Icon';
import { ConfirmModal } from '../ui/ConfirmModal';
import dayjs from 'dayjs';
import './NotesCenter.css';

const stripHtml = (html: string) => {
    if (!html) return '';
    const temp = document.createElement('div');
    temp.innerHTML = html;
    return temp.textContent || temp.innerText || '';
};

export function NotesRecycleBin() {
    const notes = useAppStore((state) => state.notes);
    const restoreNotes = useAppStore((state) => state.restoreNotes);
    const permanentDeleteNotes = useAppStore((state) => state.permanentDeleteNotes);
    const emptyTrash = useAppStore((state) => state.emptyNoteTrash);
    const setNoteViewMode = useAppStore((state) => state.setNoteViewMode);

    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [lastClickedId, setLastClickedId] = useState<string | null>(null);

    // Tooltip state
    const [isTooltipHovered, setIsTooltipHovered] = useState(false);
    const [tooltipPos, setTooltipPos] = useState<{ top: number, left: number } | null>(null);
    const tooltipRef = useRef<HTMLDivElement>(null);

    const [confirmModal, setConfirmModal] = useState<{
        open: boolean;
        title: string;
        message: string;
        action: () => void;
    }>({
        open: false,
        title: '',
        message: '',
        action: () => { }
    });

    const deletedNotes = useMemo(() => {
        return notes.filter(n => n.deletedAt).sort((a, b) => (b.deletedAt || 0) - (a.deletedAt || 0));
    }, [notes]);

    const handleRestoreSelected = () => {
        if (selectedIds.size > 0) {
            restoreNotes(Array.from(selectedIds));
            setSelectedIds(new Set());
        }
    };

    const handleDeleteForeverSelected = () => {
        if (selectedIds.size === 0) return;
        setConfirmModal({
            open: true,
            title: '永久删除确认',
            message: `确定要永久删除选中的 ${selectedIds.size} 条随记吗？此操作无法恢复。`,
            action: () => {
                permanentDeleteNotes(Array.from(selectedIds));
                setSelectedIds(new Set());
            }
        });
    };

    const handleEmptyTrash = () => {
        setConfirmModal({
            open: true,
            title: '清空回收站确认',
            message: '确定要清空回收站吗？所有笔记将永久丢失。',
            action: () => emptyTrash()
        });
    };

    const handleRowClick = (e: React.MouseEvent, id: string) => {
        if (e.shiftKey && lastClickedId) {
            // Shift + Click: range selection
            const ids = deletedNotes.map(n => n.id);
            const startIdx = ids.indexOf(lastClickedId);
            const endIdx = ids.indexOf(id);
            if (startIdx !== -1 && endIdx !== -1) {
                const [from, to] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
                const rangeIds = ids.slice(from, to + 1);
                const newSelected = new Set(selectedIds);
                rangeIds.forEach(rid => newSelected.add(rid));
                setSelectedIds(newSelected);
            }
        } else if (e.ctrlKey || e.metaKey) {
            // Ctrl/Meta + Click: toggle single
            const newSelected = new Set(selectedIds);
            if (newSelected.has(id)) {
                newSelected.delete(id);
            } else {
                newSelected.add(id);
            }
            setSelectedIds(newSelected);
        } else {
            // Normal click
            // If the item is the ONLY one selected, clicking it again deselects it (User request)
            if (selectedIds.has(id) && selectedIds.size === 1) {
                setSelectedIds(new Set());
            } else {
                // Otherwise (unselected, or part of multi-select), select strictly this one
                setSelectedIds(new Set([id]));
            }
        }
        setLastClickedId(id);
    };

    const handleMouseEnter = () => {
        if (tooltipRef.current) {
            const rect = tooltipRef.current.getBoundingClientRect();
            setTooltipPos({
                top: rect.bottom + 8,
                left: rect.left
            });
            setIsTooltipHovered(true);
        }
    };

    return (
        <div className="notes-recycle-bin">
            <div className="recycle-bin-toolbar">
                <div className="notes-center-title" style={{ color: 'var(--text-main)' }}>
                    <button className="btn-icon" onClick={() => setNoteViewMode('tree')} title="返回随记列表" style={{ marginRight: 8 }}>
                        <Icon name="arrow-left" size={16} />
                    </button>
                    <Icon name="trash" size={16} style={{ color: 'var(--text-secondary)' }} />
                    <span className="notes-center-title-text" style={{ color: 'var(--text-main)', fontSize: 14 }}>
                        回收站 ({deletedNotes.length})
                    </span>

                    <div
                        ref={tooltipRef}
                        onMouseEnter={handleMouseEnter}
                        onMouseLeave={() => setIsTooltipHovered(false)}
                        style={{
                            marginLeft: 12,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                            cursor: 'help',
                            opacity: 0.8,
                            fontSize: 12,
                            color: 'var(--primary)'
                        }}
                    >
                        <Icon name="info" size={13} />
                        <span>支持批量选中</span>
                    </div>

                    {isTooltipHovered && tooltipPos && createPortal(
                        <div
                            className="custom-about-tooltip"
                            style={{
                                top: tooltipPos.top,
                                left: tooltipPos.left,
                                position: 'fixed',
                                zIndex: 9999,
                                width: 'auto',
                                minWidth: 280,
                            }}
                        >
                            <div className="tooltip-section">
                                <span className="tooltip-label">操作说明：</span>
                                <ul style={{ margin: 0, paddingLeft: 18, lineHeight: '1.6', color: 'var(--text-secondary)' }}>
                                    <li><b>单项选择/取消</b>：点击选中笔记，再次点击取消选中。</li>
                                    <li><b>多项选择</b>：按住 Ctrl (Mac按Cmd) 键点击，可同时选中多条。</li>
                                    <li><b>批量选择</b>：按住 Shift 键先点一条，再点另一条，可选中中间所有笔记。</li>
                                    <li><b>快速还原</b>：双击列表中的笔记即可直接还原。</li>
                                </ul>
                            </div>
                        </div>,
                        document.body
                    )}

                    {selectedIds.size > 0 && (
                        <span style={{ marginLeft: 8, opacity: 0.7, fontSize: 12 }}>已选 {selectedIds.size} 项</span>
                    )}
                </div>

                <div className="recycle-bin-toolbar-actions">
                    {selectedIds.size > 0 && (
                        <>
                            <button className="btn btn-light btn-sm" onClick={handleRestoreSelected} title="还原选中笔记">
                                <Icon name="undo" size={14} />
                                <span>还原</span>
                            </button>
                            <button className="btn btn-danger btn-sm" onClick={handleDeleteForeverSelected} title="永久删除选中笔记">
                                <Icon name="close" size={14} />
                                <span>删除</span>
                            </button>
                            <div style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 4px' }}></div>
                        </>
                    )}

                    {deletedNotes.length > 0 && (
                        <button className="btn btn-light btn-sm" onClick={handleEmptyTrash} title="清空所有删除的笔记">
                            <Icon name="trash" size={14} />
                            <span>清空</span>
                        </button>
                    )}
                </div>
            </div>

            <div className="recycle-bin-table-container">
                {deletedNotes.length === 0 ? (
                    <div className="recycle-bin-empty">
                        <Icon name="trash" size={48} style={{ opacity: 0.2 }} />
                        <p>回收站是空的</p>
                    </div>
                ) : (
                    <table className="recycle-bin-table">
                        <thead>
                            <tr>
                                <th className="rb-icon-cell"></th>
                                <th className="rb-date-cell">删除日期</th>
                                <th>内容摘要</th>
                            </tr>
                        </thead>
                        <tbody>
                            {deletedNotes.map(note => (
                                <tr
                                    key={note.id}
                                    className={selectedIds.has(note.id) ? 'selected' : ''}
                                    onClick={(e) => handleRowClick(e, note.id)}
                                    // Removed onDoubleClick here to avoid conflict with row selection logic if needed, 
                                    // but user guide says double click restores, so keeping it.
                                    onDoubleClick={() => restoreNotes([note.id])}
                                >
                                    <td className="rb-icon-cell">
                                        <Icon name="note" size={14} />
                                    </td>
                                    <td className="rb-date-cell">
                                        {dayjs(note.deletedAt).format('YYYY-MM-DD HH:mm')}
                                    </td>
                                    <td className="rb-content-cell">
                                        <div className="rb-content-wrapper">
                                            {note.title && <span className="rb-note-title">{note.title}</span>}
                                            <span className="rb-note-preview">
                                                {stripHtml(note.content).substring(0, 100) || '无内容'}
                                            </span>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            <ConfirmModal
                open={confirmModal.open}
                title={confirmModal.title}
                message={confirmModal.message}
                isDanger={true}
                onConfirm={confirmModal.action}
                onClose={() => setConfirmModal(prev => ({ ...prev, open: false }))}
            />
        </div>
    );
}

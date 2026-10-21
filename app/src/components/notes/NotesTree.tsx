import { useCallback, useEffect, useRef, useState, type HTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../ui/Icon';
import { ContextMenu } from './ContextMenu';
import type { ContextMenuItem } from './ContextMenu';
import { ConfirmModal } from '../ui/ConfirmModal';
import { NoteExportModal } from './NoteExportModal';
import { NoteTagPopup } from './NoteTagPopup';
import { useAppStore } from '../../state/appStore';
import type { NoteTreeNode, Note } from '../../types';
import { getNoteDate } from '../../utils/noteDate';
import { useToastStore } from '../../state/toastStore';

interface NotesTreeProps {
    tree: NoteTreeNode;
    selectedNoteId: string | null;
    onNodeClick: (node: NoteTreeNode) => void;
    onCreateNote?: () => void;
}

interface ExportState {
    open: boolean;
    notes: Note[];
    fileName: string;
}

export function NotesTree({ tree, selectedNoteId, onNodeClick, onCreateNote }: NotesTreeProps) {
    const [contextMenu, setContextMenu] = useState<{
        x: number;
        y: number;
        node: NoteTreeNode;
    } | null>(null);

    const [exportModal, setExportModal] = useState<ExportState>({
        open: false,
        notes: [],
        fileName: '',
    });

    const [deleteNode, setDeleteNode] = useState<NoteTreeNode | null>(null);
    const [renameNote, setRenameNote] = useState<{ id: string; title: string } | null>(null);
    const renameDialogRef = useRef<HTMLDialogElement>(null);
    const renameNoteId = renameNote?.id;

    const deleteNote = useAppStore((state) => state.deleteNote);
    const updateNote = useAppStore((state) => state.updateNote);
    const toggleNotePin = useAppStore((state) => state.toggleNotePin);
    const notes = useAppStore((state) => state.notes);
    const [draggedId, setDraggedId] = useState<string | null>(null);
    const dragPreview = useRef<HTMLDivElement>(null);
    const dragPosition = useRef({ x: 0, y: 0 });
    const pointerDrag = useRef<{ sourceId: string; x: number; y: number; active: boolean } | null>(null);
    const suppressDragClick = useRef(false);
    const [dropTargetId, setDropTargetId] = useState<string | null>(null);
    const [mergedId, setMergedId] = useState<string | null>(null);
    const merging = useRef(false);
    const mergeProgress = useRef<HTMLDialogElement>(null);
    const [mergeChoice, setMergeChoice] = useState<{ sourceId: string; targetId: string } | null>(null);
    const mergeChoiceDialog = useRef<HTMLDialogElement>(null);
    const resetDrag = useCallback(() => {
        pointerDrag.current = null;
        setDraggedId(null);
        setDropTargetId(null);
    }, []);

    useEffect(() => { if (mergeChoice) mergeChoiceDialog.current?.showModal(); }, [mergeChoice]);
    useEffect(() => {
        if (!mergedId) return;
        const timer = window.setTimeout(() => setMergedId(null), 800);
        return () => window.clearTimeout(timer);
    }, [mergedId]);
    useEffect(() => {
        const cancel = (event: KeyboardEvent) => { if (event.key === 'Escape') resetDrag(); };
        window.addEventListener('keydown', cancel);
        window.addEventListener('blur', resetDrag);
        return () => { window.removeEventListener('keydown', cancel); window.removeEventListener('blur', resetDrag); };
    }, [resetDrag]);

    const merge = async (sourceId: string, targetId: string) => {
        if (merging.current || sourceId === targetId) return;
        merging.current = true;
        resetDrag();
        mergeChoiceDialog.current?.close();
        setMergeChoice(null);
        mergeProgress.current?.showModal();
        try {
            await useAppStore.getState().mergeNotes(sourceId, targetId);
            const store = useAppStore.getState();
            const target = store.notes.find(note => note.id === targetId)!;
            const date = getNoteDate(target);
            store.setNoteSearchText('');
            store.setActiveNoteTag('all');
            store.setNoteTreeNodeExpanded(`year-${date.slice(0, 4)}`, true);
            store.setNoteTreeNodeExpanded(`month-${date.slice(0, 7)}`, true);
            if (target.isPinned) store.setNoteTreeNodeExpanded('pinned-group', true);
            store.setSelectedNoteId(targetId);
            setMergedId(targetId);
            useToastStore.getState().addToast(`已合并到“${target.title || '未命名随记'}”，来源随记已移入回收站`, 'success');
        } catch (error) {
            useToastStore.getState().addToast(`合并失败，两篇原文已保留：${error instanceof Error ? error.message : String(error)}`, 'error', 8000);
        } finally {
            mergeProgress.current?.close();
            merging.current = false;
        }
    };

    const dropTarget = (element: HTMLElement, x: number, y: number) => {
        const target = document.elementFromPoint(x, y)?.closest<HTMLElement>('.tree-node[data-note-id]');
        return target?.closest('.notes-tree') === element.closest('.notes-tree') ? target?.dataset.noteId ?? null : null;
    };
    const getDragProps = (node: NoteTreeNode): HTMLAttributes<HTMLDivElement> => node.type !== 'note' ? {} : {
        'data-note-id': node.noteId,
        draggable: false,
        'data-dragging': node.noteId === draggedId || undefined,
        'data-merge-target': node.noteId === dropTargetId || undefined,
        'data-merge-complete': node.noteId === mergedId || undefined,
        // Capture the pointer: very short Windows drags can finish before native drop fires.
        onPointerDown: event => {
            if (event.button !== 0) return;
            suppressDragClick.current = false;
            if (merging.current || !node.noteId || (event.target as Element).closest('button')) return;
            setMergedId(null);
            pointerDrag.current = { sourceId: node.noteId, x: event.clientX, y: event.clientY, active: false };
            event.currentTarget.setPointerCapture(event.pointerId);
        },
        onPointerMove: event => {
            const drag = pointerDrag.current;
            if (!drag || merging.current) return;
            if (!drag.active && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 6) return;
            drag.active = true;
            suppressDragClick.current = true;
            event.preventDefault();
            dragPosition.current = {
                x: Math.max(8, Math.min(event.clientX + 16, window.innerWidth - 276)),
                y: Math.max(8, Math.min(event.clientY + 16, window.innerHeight - 100)),
            };
            // Move the floating layer directly; the note rows keep their original positions.
            if (dragPreview.current) dragPreview.current.style.transform = `translate3d(${dragPosition.current.x}px, ${dragPosition.current.y}px, 0)`;
            setDraggedId(drag.sourceId);
            const targetId = dropTarget(event.currentTarget, event.clientX, event.clientY);
            setDropTargetId(targetId === drag.sourceId ? null : targetId);
        },
        onPointerUp: event => {
            const drag = pointerDrag.current;
            const targetId = drag?.active ? dropTarget(event.currentTarget, event.clientX, event.clientY) : null;
            resetDrag();
            if (drag?.active && targetId && targetId !== drag.sourceId) void merge(drag.sourceId, targetId);
        },
        onPointerCancel: resetDrag,
        onLostPointerCapture: resetDrag,
        onClickCapture: event => {
            if (!suppressDragClick.current) return;
            suppressDragClick.current = false;
            event.preventDefault();
            event.stopPropagation();
        },
    } as HTMLAttributes<HTMLDivElement>;

    useEffect(() => {
        if (renameNoteId) {
            renameDialogRef.current?.showModal();
            renameDialogRef.current?.querySelector('input')?.select();
        }
    }, [renameNoteId]);

    const startRename = (node: NoteTreeNode) => {
        const note = notes.find(n => n.id === node.noteId && !n.deletedAt);
        if (note) setRenameNote({ id: note.id, title: note.title });
    };

    const closeRename = () => {
        renameDialogRef.current?.close();
        setRenameNote(null);
    };

    const [tagPopup, setTagPopup] = useState<{
        noteId: string;
        x: number;
        y: number;
    } | null>(null);

    const handleContextMenu = (e: React.MouseEvent, node: NoteTreeNode) => {
        e.preventDefault();
        e.stopPropagation();
        const rect = e.currentTarget.getBoundingClientRect();
        setContextMenu(e.type === 'contextmenu'
            ? { x: e.clientX, y: e.clientY, node }
            : { x: rect.left, y: rect.bottom, node });
    };

    const getContextMenuItems = (node: NoteTreeNode): ContextMenuItem[] => {
        if (node.type === 'note' && node.noteId) {
            const note = notes.find(n => n.id === node.noteId);
            const isPinned = note?.isPinned || false;

            return [
                {
                    id: 'new-sibling',
                    label: '新建相邻笔记',
                    icon: 'plus',
                    onClick: () => {
                        if (note) useAppStore.getState().setSelectedNoteDate(getNoteDate(note));
                        onCreateNote?.();
                    },
                },
                { id: 'div1', label: '', divider: true },
                {
                    id: 'rename',
                    label: '重命名',
                    icon: 'edit',
                    onClick: () => startRename(node),
                },
                {
                    id: 'pin',
                    label: isPinned ? '取消置顶' : '置顶',
                    icon: 'pin',
                    onClick: () => toggleNotePin(node.noteId!),
                },
                {
                    id: 'tags',
                    label: '标签设置',
                    icon: 'tag',
                    onClick: () => {
                        setContextMenu(null);
                        // 在操作菜单的位置打开标签设置
                        if (contextMenu) {
                            setTagPopup({
                                noteId: node.noteId!,
                                x: contextMenu.x,
                                y: contextMenu.y,
                            });
                        }
                    },
                },
                { id: 'div2', label: '', divider: true },
                {
                    id: 'merge', label: '合并到其他随记…', icon: 'note',
                    disabled: notes.filter(item => !item.deletedAt).length < 2,
                    onClick: () => setMergeChoice({ sourceId: node.noteId!, targetId: '' }),
                },
                {
                    id: 'delete',
                    label: '删除',
                    icon: 'trash',
                    danger: true,
                    onClick: () => {
                        if (node.noteId) {
                            setDeleteNode(node);
                        }
                    },
                },
            ];
        }

        if (node.type === 'year' || node.type === 'month') {
            // 获取该节点下的所有笔记
            const getNotesInNode = (): string[] => {
                return notes.filter(n => !n.deletedAt && getNoteDate(n).slice(0, node.type === 'year' ? 4 : 7) === node.date)
                    .map(n => n.id);
            };

            const openExportModal = () => {
                const noteIds = getNotesInNode();
                const notesToExport = notes.filter(n => noteIds.includes(n.id));
                setExportModal({
                    open: true,
                    notes: notesToExport,
                    fileName: `${node.label}笔记`,
                });
            };

            return [
                {
                    id: 'new-note',
                    label: '新建笔记',
                    icon: 'plus',
                    onClick: () => {
                        useAppStore.getState().setSelectedNoteDate(node.type === 'year' ? `${node.date}-01-01` : `${node.date}-01`);
                        onCreateNote?.();
                    },
                },
                { id: 'div1', label: '', divider: true },
                {
                    id: 'export',
                    label: '导出为 Markdown',
                    icon: 'save',
                    onClick: openExportModal,
                },
                { id: 'div2', label: '', divider: true },
                {
                    id: 'stats',
                    label: '共 ' + node.count + ' 条笔记',
                    icon: 'info',
                    disabled: true,
                },
            ];
        }

        if (node.type === 'root' || node.type === 'pinned-group') {
            return [
                {
                    id: 'new-note',
                    label: '新建随记',
                    icon: 'plus',
                    onClick: onCreateNote,
                },
            ];
        }

        return [];
    };

    return (
        <>
            <div className="notes-tree">
                {tree.children && tree.children.map(node => (
                    <TreeNode
                        key={node.id}
                        node={node}
                        level={0}
                        selectedNoteId={selectedNoteId}
                        onNodeClick={onNodeClick}
                        onContextMenu={handleContextMenu}
                        getDragProps={getDragProps}
                    />
                ))}

                {contextMenu && (
                    <ContextMenu
                        x={contextMenu.x}
                        y={contextMenu.y}
                        items={getContextMenuItems(contextMenu.node)}
                        onClose={() => setContextMenu(null)}
                    />
                )}
            </div>

            <p className="notes-merge-hint">拖到另一篇随记，松开合并</p>
            {draggedId && createPortal(<div ref={dragPreview} className="notes-drag-preview" role="status"
                data-can-merge={!!dropTargetId} style={{ transform: `translate3d(${dragPosition.current.x}px, ${dragPosition.current.y}px, 0)` }}>
                <div className="notes-drag-title"><Icon name="note" size={16} /><strong>{notes.find(note => note.id === draggedId)?.title || '未命名随记'}</strong></div>
                <span>{dropTargetId ? `松开，合并到“${notes.find(note => note.id === dropTargetId)?.title || '未命名随记'}”` : '拖到另一篇随记，松开合并'}</span>
            </div>, document.body)}
            <dialog ref={mergeProgress} className="note-rename-dialog" aria-label="正在合并随记" onCancel={event => event.preventDefault()}>
                <p role="status">正在保存合并内容…</p>
            </dialog>
            {mergeChoice && <dialog ref={mergeChoiceDialog} className="note-rename-dialog" aria-label="合并随记" onCancel={() => setMergeChoice(null)}>
                <form onSubmit={event => { event.preventDefault(); if (mergeChoice.targetId) void merge(mergeChoice.sourceId, mergeChoice.targetId); }}>
                    <h3>合并随记</h3><p>按创建时间拼接两篇正文，保留目标名称。来源随记移入回收站。</p>
                    <label className="form-item">合并到<select className="input-field" required value={mergeChoice.targetId} onChange={event => setMergeChoice({ ...mergeChoice, targetId: event.target.value })}>
                        <option value="">选择目标随记</option>{notes.filter(note => !note.deletedAt && note.id !== mergeChoice.sourceId).map(note => <option key={note.id} value={note.id}>{note.title || '未命名随记'}</option>)}
                    </select></label>
                    <footer className="modal-actions"><button type="button" className="btn btn-light" onClick={() => setMergeChoice(null)}>取消</button><button className="btn btn-primary" disabled={!mergeChoice.targetId}>合并</button></footer>
                </form>
            </dialog>}

            {renameNote && (
                <dialog ref={renameDialogRef} className="note-rename-dialog" aria-labelledby="note-rename-title"
                    onCancel={() => setRenameNote(null)}>
                    <form onSubmit={event => {
                        event.preventDefault();
                        const title = renameNote.title.trim();
                        if (!title) return;
                        updateNote(renameNote.id, { title });
                        closeRename();
                    }}>
                        <header className="modal-header">
                            <h3 id="note-rename-title">重命名随记</h3>
                            <button type="button" className="create-btn-icon" aria-label="关闭" onClick={closeRename}>✕</button>
                        </header>
                        <label className="form-item">
                            随记名称
                            <input className="input-field" autoFocus value={renameNote.title} placeholder="输入随记名称"
                                onChange={event => setRenameNote({ ...renameNote, title: event.target.value })}
                                onKeyDown={event => {
                                    if (event.key === 'Enter' && event.nativeEvent.isComposing) event.preventDefault();
                                }} />
                        </label>
                        <footer className="modal-actions">
                            <button type="button" className="btn btn-light" onClick={closeRename}>取消</button>
                            <button type="submit" className="btn btn-primary" disabled={!renameNote.title.trim()}>保存</button>
                        </footer>
                    </form>
                </dialog>
            )}

            <ConfirmModal
                open={!!deleteNode}
                title="移至回收站"
                message="确定要删除这条笔记吗？删除后将移至回收站，可随时恢复。"
                confirmText="确认删除"
                cancelText="取消"
                isDanger={true}
                onConfirm={() => {
                    if (deleteNode && deleteNode.noteId) {
                        deleteNote(deleteNode.noteId);
                        setDeleteNode(null);
                    }
                }}
                onClose={() => setDeleteNode(null)}
            />

            <NoteExportModal
                open={exportModal.open}
                onClose={() => setExportModal({ open: false, notes: [], fileName: '' })}
                notes={exportModal.notes}
                defaultFileName={exportModal.fileName}
            />

            {tagPopup && (
                <NoteTagPopup
                    noteId={tagPopup.noteId}
                    position={{ x: tagPopup.x, y: tagPopup.y }}
                    onClose={() => setTagPopup(null)}
                />
            )}
        </>
    );
}

interface TreeNodeProps {
    node: NoteTreeNode;
    level: number;
    selectedNoteId: string | null;
    onNodeClick: (node: NoteTreeNode) => void;
    onContextMenu: (e: React.MouseEvent, node: NoteTreeNode) => void;
    getDragProps: (node: NoteTreeNode) => HTMLAttributes<HTMLDivElement>;
}

function TreeNode({ node, level, selectedNoteId, onNodeClick, onContextMenu, getDragProps }: TreeNodeProps) {
    const isSelected = node.type === 'note' && node.noteId === selectedNoteId;
    const hasChildren = !!node.children && node.children.length > 0;
    const indent = level * 16;

    return (
        <>
            <div
                {...getDragProps(node)}
                className={'tree-node level-' + level + (isSelected ? ' selected' : '')}
                data-node-id={node.id}
                style={{ paddingLeft: indent + 'px' }}
                onClick={() => onNodeClick(node)}
                onContextMenu={(e) => onContextMenu(e, node)}
            >
                {hasChildren && (
                    <button
                        className="tree-toggle"
                        onClick={(e) => {
                            e.stopPropagation();
                            onNodeClick(node);
                        }}
                    >
                        <Icon
                            name={node.collapsed ? 'chevronRight' : 'chevronDown'}
                            size={12}
                        />
                    </button>
                )}
                {!hasChildren && <span className="tree-toggle-spacer" />}

                <span className="tree-icon">{node.icon}</span>
                <span className="tree-label" title={node.label}>{node.label}</span>

                {node.tags && node.tags.length > 0 && (
                    <span className="tree-tags">
                        {node.tags.slice(0, 2).map((tag, i) => (
                            <span key={i} className="tree-tag">#{tag}</span>
                        ))}
                    </span>
                )}

                {node.count > 0 && (
                    <span className="tree-count">({node.count})</span>
                )}
                {node.type === 'note' && <button type="button" className="tree-toggle tree-menu-btn"
                    title="更多操作" aria-label={`随记操作：${node.label}`}
                    onClick={event => onContextMenu(event, node)}>
                    <span aria-hidden="true">⋯</span>
                </button>}
            </div>

            {hasChildren && !node.collapsed && (
                <div className="tree-children">
                    {node.children!.map(child => (
                        <TreeNode
                            key={child.id}
                            node={child}
                            level={level + 1}
                            selectedNoteId={selectedNoteId}
                            onNodeClick={onNodeClick}
                            onContextMenu={onContextMenu}
                            getDragProps={getDragProps}
                        />
                    ))}
                </div>
            )}
        </>
    );
}

import { useEffect, useRef, useState } from 'react';
import { Icon } from '../ui/Icon';
import { ContextMenu } from './ContextMenu';
import type { ContextMenuItem } from './ContextMenu';
import { ConfirmModal } from '../ui/ConfirmModal';
import { NoteExportModal } from './NoteExportModal';
import { NoteTagPopup } from './NoteTagPopup';
import { useAppStore } from '../../state/appStore';
import type { NoteTreeNode, Note } from '../../types';
import { getNoteDate } from '../../utils/noteDate';

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
        setContextMenu({ x: e.clientX, y: e.clientY, node });
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
                        // 使用最后的右键菜单位置
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
                        onRename={startRename}
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
    onRename: (node: NoteTreeNode) => void;
}

function TreeNode({ node, level, selectedNoteId, onNodeClick, onContextMenu, onRename }: TreeNodeProps) {
    const isSelected = node.type === 'note' && node.noteId === selectedNoteId;
    const hasChildren = !!node.children && node.children.length > 0;
    const indent = level * 16;

    return (
        <>
            <div
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
                {node.type === 'note' && <button type="button" className="tree-toggle tree-rename-btn"
                    title="重命名" aria-label={`重命名：${node.label}`}
                    onClick={event => { event.stopPropagation(); onRename(node); }}>
                    <Icon name="edit" size={14} />
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
                            onRename={onRename}
                        />
                    ))}
                </div>
            )}
        </>
    );
}

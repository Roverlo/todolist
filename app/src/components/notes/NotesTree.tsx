import { useState } from 'react';
import { Icon } from '../ui/Icon';
import { ContextMenu } from './ContextMenu';
import type { ContextMenuItem } from './ContextMenu';
import { ConfirmModal } from '../ui/ConfirmModal';
import { NoteExportModal } from './NoteExportModal';
import { useAppStore } from '../../state/appStore';
import type { NoteTreeNode, Note } from '../../types';

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

    const deleteNote = useAppStore((state) => state.deleteNote);
    const toggleNotePin = useAppStore((state) => state.toggleNotePin);
    const notes = useAppStore((state) => state.notes);

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
                    onClick: onCreateNote,
                },
                { id: 'div1', label: '', divider: true },
                {
                    id: 'pin',
                    label: isPinned ? '取消置顶' : '置顶',
                    icon: 'pin',
                    onClick: () => toggleNotePin(node.noteId!),
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
                if (node.type === 'year') {
                    return notes.filter(n => {
                        const year = new Date(n.updatedAt).getFullYear();
                        return year.toString() === node.date;
                    }).map(n => n.id);
                } else {
                    return notes.filter(n => {
                        const date = new Date(n.updatedAt);
                        const yearMonth = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0');
                        return yearMonth === node.date;
                    }).map(n => n.id);
                }
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
                    onClick: onCreateNote,
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



            <ConfirmModal
                open={!!deleteNode}
                title="删除笔记"
                message="确定要删除这条笔记吗？删除后将无法恢复。"
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
        </>
    );
}

interface TreeNodeProps {
    node: NoteTreeNode;
    level: number;
    selectedNoteId: string | null;
    onNodeClick: (node: NoteTreeNode) => void;
    onContextMenu: (e: React.MouseEvent, node: NoteTreeNode) => void;
}

function TreeNode({ node, level, selectedNoteId, onNodeClick, onContextMenu }: TreeNodeProps) {
    const isSelected = node.type === 'note' && node.noteId === selectedNoteId;
    const hasChildren = !!node.children && node.children.length > 0;
    const indent = level * 16;

    return (
        <>
            <div
                className={'tree-node level-' + level + (isSelected ? ' selected' : '')}
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
                <span className="tree-label">{node.label}</span>

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
                        />
                    ))}
                </div>
            )}
        </>
    );
}

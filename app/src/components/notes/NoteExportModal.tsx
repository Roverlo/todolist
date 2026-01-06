import { useState, useEffect } from 'react';
import dayjs from 'dayjs';
import type { Note } from '../../types';

interface Props {
    open: boolean;
    onClose: () => void;
    notes: Note[];
    defaultFileName: string;
}

export const NoteExportModal = ({ open, onClose, notes, defaultFileName }: Props) => {
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    // 初始化时全选
    useEffect(() => {
        if (open) {
            setSelectedIds(new Set(notes.map(n => n.id)));
        }
    }, [open, notes]);

    const toggleNote = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const selectAll = () => {
        setSelectedIds(new Set(notes.map(n => n.id)));
    };

    const deselectAll = () => {
        setSelectedIds(new Set());
    };

    const allSelected = selectedIds.size === notes.length;

    const handleExport = async () => {
        const notesToExport = notes.filter(n => selectedIds.has(n.id));

        if (notesToExport.length === 0) {
            alert('请至少选择一条笔记导出！');
            return;
        }

        // 生成 Markdown 内容
        let markdown = `# ${defaultFileName}\n\n`;
        markdown += `导出时间: ${new Date().toLocaleString('zh-CN')}\n`;
        markdown += `笔记数量: ${notesToExport.length}\n\n`;
        markdown += '---\n\n';

        notesToExport.forEach(note => {
            markdown += `## ${note.title || '未命名随记'}\n\n`;
            markdown += `创建时间: ${new Date(note.createdAt).toLocaleString('zh-CN')}\n\n`;
            if (note.tags && note.tags.length > 0) {
                markdown += `标签: ${note.tags.map(t => `#${t}`).join(' ')}\n\n`;
            }
            markdown += note.content + '\n\n';
            markdown += '---\n\n';
        });

        const filename = `${defaultFileName}_${dayjs().format('YYYYMMDD_HHmmss')}.md`;

        try {
            // 使用 Tauri 保存对话框
            const { save: tauriSave } = await import('@tauri-apps/plugin-dialog');
            const { writeTextFile } = await import('@tauri-apps/plugin-fs');

            const path = await tauriSave({
                defaultPath: filename,
                filters: [{ name: 'Markdown', extensions: ['md'] }],
            });

            if (!path) {
                // 用户取消
                return;
            }

            await writeTextFile(path, markdown);
            alert(`已成功导出 ${notesToExport.length} 条笔记到：\n${path}`);
            onClose();
        } catch (error) {
            console.error('导出笔记失败', error);
            // Tauri 失败时使用浏览器下载
            try {
                const blob = new Blob([markdown], { type: 'text/markdown' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                a.click();
                URL.revokeObjectURL(url);
                alert(`已导出 ${notesToExport.length} 条笔记`);
                onClose();
            } catch (downloadError) {
                console.error('下载失败', downloadError);
                alert('导出失败，请重试');
            }
        }
    };

    // Handle Esc key
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (open && e.key === 'Escape') {
                onClose();
            }
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [open, onClose]);

    if (!open) return null;

    return (
        <div className='create-overlay' style={{ zIndex: 100 }} onClick={(e) => e.stopPropagation()}>
            <div className='create-dialog' style={{ width: 520 }} onClick={(e) => e.stopPropagation()}>
                <header className='create-dialog-header'>
                    <div className='create-dialog-title-block'>
                        <div className='create-dialog-title'>📝 导出笔记</div>
                        <div className='create-dialog-subtitle'>
                            选择要导出的笔记，共 {notes.length} 条
                        </div>
                    </div>
                    <button className='create-btn-icon' aria-label='关闭导出弹窗' type='button' onClick={onClose}>
                        ✕
                    </button>
                </header>

                <div className='create-dialog-body' style={{ background: 'var(--surface)', padding: '16px 24px' }}>
                    {/* 全选/取消全选 */}
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 12,
                        paddingBottom: 12,
                        borderBottom: '1px solid var(--border)',
                    }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-main)' }}>
                            已选择 <span style={{ color: 'var(--primary)', fontWeight: 600 }}>{selectedIds.size}</span> 条笔记
                        </div>
                        <button
                            className='btn btn-light'
                            type='button'
                            onClick={allSelected ? deselectAll : selectAll}
                            style={{ padding: '4px 12px', fontSize: 12 }}
                        >
                            {allSelected ? '取消全选' : '全选'}
                        </button>
                    </div>

                    {/* 笔记列表 */}
                    <div style={{
                        maxHeight: 320,
                        overflowY: 'auto',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                    }}>
                        {notes.map(note => {
                            const isSelected = selectedIds.has(note.id);
                            return (
                                <div
                                    key={note.id}
                                    onClick={() => toggleNote(note.id)}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'flex-start',
                                        gap: 12,
                                        padding: '12px 14px',
                                        borderRadius: 10,
                                        border: isSelected ? '2px solid var(--primary)' : '1px solid var(--border)',
                                        background: isSelected ? 'var(--primary-bg)' : 'var(--bg)',
                                        cursor: 'pointer',
                                        transition: 'all 0.15s ease',
                                    }}
                                >
                                    <div style={{
                                        width: 20,
                                        height: 20,
                                        borderRadius: 4,
                                        border: isSelected ? 'none' : '2px solid var(--border)',
                                        background: isSelected ? 'var(--primary)' : 'var(--surface)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        color: 'white',
                                        fontSize: 12,
                                        flexShrink: 0,
                                        marginTop: 2,
                                    }}>
                                        {isSelected && '✓'}
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{
                                            fontWeight: 500,
                                            color: 'var(--text-main)',
                                            fontSize: 13,
                                            marginBottom: 4,
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                        }}>
                                            {note.title || '未命名随记'}
                                        </div>
                                        <div style={{
                                            fontSize: 11,
                                            color: 'var(--text-subtle)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 8,
                                        }}>
                                            <span>{dayjs(note.createdAt).format('YYYY-MM-DD HH:mm')}</span>
                                            {note.tags && note.tags.length > 0 && (
                                                <span style={{ color: 'var(--primary)' }}>
                                                    {note.tags.slice(0, 2).map(t => `#${t}`).join(' ')}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <footer className='create-dialog-footer'>
                    <div className='create-footer-actions export-footer-actions'>
                        <button className='btn btn-light' type='button' onClick={onClose}>
                            取消
                        </button>
                        <button
                            className='btn btn-primary'
                            type='button'
                            onClick={handleExport}
                            disabled={selectedIds.size === 0}
                            style={{ opacity: selectedIds.size === 0 ? 0.5 : 1 }}
                        >
                            导出 {selectedIds.size > 0 && `(${selectedIds.size})`}
                        </button>
                    </div>
                </footer>
            </div>
        </div>
    );
};

import { useState } from 'react';
import { useAppStoreShallow } from '../../state/appStore';
import { RecurringTaskModal } from './RecurringTaskModal';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import type { RecurringTemplate } from '../../types';

interface RecurringTaskManagerModalProps {
    open: boolean;
    onClose: () => void;
}

const scheduleLabel = (tpl: RecurringTemplate): string => {
    const { schedule } = tpl;
    if (schedule.type === 'daily') return '每天';
    if (schedule.type === 'weekly') {
        const dayNames = ['日', '一', '二', '三', '四', '五', '六'];
        const days = (schedule.daysOfWeek ?? []).map((d) => dayNames[d]).join('、');
        const interval = schedule.interval && schedule.interval > 1 ? `每${schedule.interval}周` : '每周';
        return schedule.flexible ? `${interval} 灵活` : `${interval}${days}`;
    }
    if (schedule.type === 'monthly') {
        const interval = schedule.interval && schedule.interval > 1 ? `每${schedule.interval}月` : '每月';
        return schedule.flexible ? `${interval} 灵活` : `${interval}${schedule.dayOfMonth}日`;
    }
    return '未知';
};

export const RecurringTaskManagerModal = ({ open, onClose }: RecurringTaskManagerModalProps) => {
    const { recurringTemplates, projects, updateRecurringTemplate, deleteRecurringTemplate, tasks, deleteTask } = useAppStoreShallow((state) => ({
        recurringTemplates: state.recurringTemplates,
        projects: state.projects,
        updateRecurringTemplate: state.updateRecurringTemplate,
        deleteRecurringTemplate: state.deleteRecurringTemplate,
        tasks: state.tasks,
        deleteTask: state.deleteTask,
    }));

    const [editingTemplate, setEditingTemplate] = useState<RecurringTemplate | null>(null);
    const [showEditModal, setShowEditModal] = useState(false);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [templateToDelete, setTemplateToDelete] = useState<RecurringTemplate | null>(null);
    const [deleteInstances, setDeleteInstances] = useState(false);

    const projectMap = Object.fromEntries(projects.map((p) => [p.id, p]));

    const handleToggleActive = (tpl: RecurringTemplate) => {
        updateRecurringTemplate(tpl.id, { active: !tpl.active });
    };

    const handleEdit = (tpl: RecurringTemplate) => {
        setEditingTemplate(tpl);
        setShowEditModal(true);
    };

    const handleDeleteClick = (tpl: RecurringTemplate) => {
        setTemplateToDelete(tpl);
        setDeleteInstances(false);
        setDeleteConfirmOpen(true);
    };

    const handleConfirmDelete = () => {
        if (!templateToDelete) return;

        // 如果选择删除实例，先删除所有关联的任务
        if (deleteInstances) {
            const instancesToDelete = tasks.filter((t) => t.extras?.recurrenceId === templateToDelete.id);
            instancesToDelete.forEach((t) => deleteTask(t.id));
        }

        deleteRecurringTemplate(templateToDelete.id);
        setDeleteConfirmOpen(false);
        setTemplateToDelete(null);
    };

    // 获取某模板的已物化实例数
    const getInstanceCount = (tplId: string) => {
        return tasks.filter((t) => t.extras?.recurrenceId === tplId).length;
    };

    if (!open) return null;

    return (
        <>
            <div className='create-overlay' style={{ zIndex: 100 }} onClick={(e) => e.stopPropagation()}>
                <div className='create-dialog' style={{ width: 520, maxHeight: '85vh', overflow: 'hidden' }} onClick={(e) => e.stopPropagation()}>
                    <header className='create-dialog-header'>
                        <div className='create-dialog-title-block'>
                            <div className='create-dialog-title'>📅 周期任务管理</div>
                            <div className='create-dialog-subtitle'>管理重复执行的任务模板</div>
                        </div>
                        <button className='create-btn-icon' onClick={onClose} title='关闭'>✕</button>
                    </header>

                    <div className='create-dialog-body' style={{ overflow: 'auto', maxHeight: 'calc(85vh - 80px)', padding: '12px' }}>
                        {recurringTemplates.length === 0 ? (
                            <div style={{
                                textAlign: 'center',
                                padding: '40px 20px',
                                color: 'var(--text-subtle)',
                            }}>
                                <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
                                <div>暂无周期任务</div>
                                <div style={{ fontSize: 12, marginTop: 8 }}>
                                    在新建任务时选择"周期任务"可以创建
                                </div>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                {recurringTemplates.map((tpl, index) => {
                                    const project = projectMap[tpl.projectId];
                                    const instanceCount = getInstanceCount(tpl.id);
                                    const priorityColors = {
                                        high: { bg: 'rgba(239, 68, 68, 0.1)', text: '#ef4444', label: '高' },
                                        medium: { bg: 'rgba(245, 158, 11, 0.1)', text: '#f59e0b', label: '中' },
                                        low: { bg: 'rgba(16, 185, 129, 0.1)', text: '#10b981', label: '低' },
                                    };
                                    const priority = tpl.priority ? priorityColors[tpl.priority] : null;

                                    return (
                                        <div
                                            key={tpl.id}
                                            style={{
                                                padding: '16px',
                                                borderRadius: 12,
                                                border: tpl.active ? '1px solid var(--border)' : '1px dashed var(--border)',
                                                background: tpl.active
                                                    ? 'linear-gradient(135deg, var(--surface) 0%, var(--bg) 100%)'
                                                    : 'var(--bg)',
                                                opacity: tpl.active ? 1 : 0.6,
                                                transition: 'all 0.2s ease',
                                            }}
                                        >
                                            {/* 头部：序号 + 标题 + 操作按钮 */}
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                                                {/* 序号 */}
                                                <div style={{
                                                    width: 28,
                                                    height: 28,
                                                    borderRadius: 8,
                                                    background: tpl.active ? 'var(--primary)' : 'var(--text-subtle)',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    fontSize: 12,
                                                    fontWeight: 600,
                                                    color: 'white',
                                                    flexShrink: 0,
                                                }}>
                                                    {index + 1}
                                                </div>
                                                <div style={{ flex: 1 }}>
                                                    <div style={{
                                                        fontWeight: 600,
                                                        fontSize: 14,
                                                        color: 'var(--text-main)',
                                                        lineHeight: 1.3,
                                                    }}>
                                                        {tpl.title}
                                                    </div>
                                                    {!tpl.active && (
                                                        <div style={{ fontSize: 11, color: 'var(--text-subtle)', marginTop: 2 }}>
                                                            已暂停
                                                        </div>
                                                    )}
                                                </div>

                                                {/* 操作按钮组 */}
                                                <div style={{ display: 'flex', gap: 6 }}>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleEdit(tpl)}
                                                        title="编辑"
                                                        style={{
                                                            width: 32,
                                                            height: 32,
                                                            borderRadius: 8,
                                                            border: '1px solid var(--border)',
                                                            background: 'var(--surface)',
                                                            cursor: 'pointer',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            fontSize: 14,
                                                            transition: 'all 0.2s ease',
                                                        }}
                                                    >
                                                        ✏️
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleToggleActive(tpl)}
                                                        title={tpl.active ? '暂停' : '启用'}
                                                        style={{
                                                            width: 32,
                                                            height: 32,
                                                            borderRadius: 8,
                                                            border: '1px solid var(--border)',
                                                            background: tpl.active ? 'rgba(249, 115, 22, 0.1)' : 'rgba(34, 197, 94, 0.1)',
                                                            cursor: 'pointer',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            fontSize: 14,
                                                            transition: 'all 0.2s ease',
                                                        }}
                                                    >
                                                        {tpl.active ? '⏸️' : '▶️'}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDeleteClick(tpl)}
                                                        title="删除"
                                                        style={{
                                                            width: 32,
                                                            height: 32,
                                                            borderRadius: 8,
                                                            border: '1px solid rgba(239, 68, 68, 0.2)',
                                                            background: 'rgba(239, 68, 68, 0.05)',
                                                            cursor: 'pointer',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            fontSize: 14,
                                                            transition: 'all 0.2s ease',
                                                        }}
                                                    >
                                                        🗑️
                                                    </button>
                                                </div>
                                            </div>

                                            {/* 元信息标签 */}
                                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                                <span style={{
                                                    padding: '4px 10px',
                                                    borderRadius: 20,
                                                    background: 'var(--primary-bg)',
                                                    color: 'var(--primary)',
                                                    fontSize: 11,
                                                    fontWeight: 500,
                                                }}>
                                                    🔄 {scheduleLabel(tpl)}
                                                </span>
                                                <span style={{
                                                    padding: '4px 10px',
                                                    borderRadius: 20,
                                                    background: 'var(--bg)',
                                                    border: '1px solid var(--border)',
                                                    color: 'var(--text-main)',
                                                    fontSize: 11,
                                                    fontWeight: 500,
                                                }}>
                                                    📁 {project?.name || '未知'}
                                                </span>
                                                {priority && (
                                                    <span style={{
                                                        padding: '4px 10px',
                                                        borderRadius: 20,
                                                        background: priority.bg,
                                                        color: priority.text,
                                                        fontSize: 11,
                                                        fontWeight: 500,
                                                    }}>
                                                        ● {priority.label}优
                                                    </span>
                                                )}
                                                {instanceCount > 0 && (
                                                    <span style={{
                                                        padding: '4px 10px',
                                                        borderRadius: 20,
                                                        background: 'var(--primary-bg)',
                                                        color: 'var(--primary)',
                                                        fontSize: 11,
                                                        fontWeight: 500,
                                                    }}>
                                                        📋 {instanceCount} 实例
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* 编辑模态框 */}
            {showEditModal && editingTemplate && (
                <RecurringTaskModal
                    open={showEditModal}
                    onClose={() => {
                        setShowEditModal(false);
                        setEditingTemplate(null);
                    }}
                    editingTemplate={editingTemplate}
                />
            )}

            {/* 删除确认对话框 */}
            <ConfirmDialog
                open={deleteConfirmOpen}
                title="删除周期任务"
                message={
                    templateToDelete
                        ? `确定要删除周期任务"${templateToDelete.title}"吗？\n\n${getInstanceCount(templateToDelete.id) > 0 ? `该任务已有 ${getInstanceCount(templateToDelete.id)} 个实例。` : ''}`
                        : ''
                }
                confirmLabel={deleteInstances ? "删除模板和实例" : "仅删除模板"}
                cancelLabel="取消"
                variant="danger"
                onConfirm={handleConfirmDelete}
                onCancel={() => {
                    setDeleteConfirmOpen(false);
                    setTemplateToDelete(null);
                }}
                extraContent={
                    templateToDelete && getInstanceCount(templateToDelete.id) > 0 ? (
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 13 }}>
                            <input
                                type="checkbox"
                                checked={deleteInstances}
                                onChange={(e) => setDeleteInstances(e.target.checked)}
                            />
                            同时删除所有已创建的任务实例
                        </label>
                    ) : undefined
                }
            />
        </>
    );
};

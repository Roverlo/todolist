import { useEffect } from 'react';

interface NewTaskChoiceDialogProps {
    open: boolean;
    onSingleTask: () => void;
    onRecurringTask: () => void;
    onCancel: () => void;
}

export const NewTaskChoiceDialog = ({
    open,
    onSingleTask,
    onRecurringTask,
    onCancel,
}: NewTaskChoiceDialogProps) => {
    // Handle Esc key
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (open && e.key === 'Escape') {
                onCancel();
            }
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [open, onCancel]);

    if (!open) return null;

    return (
        <div className='create-overlay' onClick={onCancel}>
            <div
                className='create-dialog'
                style={{ width: 380, maxWidth: '90vw' }}
                onClick={(e) => e.stopPropagation()}
            >
                <header className='create-dialog-header'>
                    <div className='create-dialog-title-block'>
                        <div className='create-dialog-title'>新建任务</div>
                        <div className='create-dialog-subtitle'>选择任务类型</div>
                    </div>
                    <button className='create-btn-icon' onClick={onCancel} title='关闭'>
                        ✕
                    </button>
                </header>

                <div className='create-dialog-body' style={{ padding: '20px 24px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <button
                            className='task-type-btn'
                            onClick={onSingleTask}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 12,
                                padding: '14px 16px',
                                borderRadius: 12,
                                border: '1px solid var(--border-subtle)',
                                background: 'var(--surface)',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                                textAlign: 'left',
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.borderColor = 'var(--primary)';
                                e.currentTarget.style.background = 'var(--primary-soft)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.borderColor = 'var(--border-subtle)';
                                e.currentTarget.style.background = 'var(--surface)';
                            }}
                        >
                            <span style={{ fontSize: 28 }}>📋</span>
                            <div>
                                <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-main)' }}>
                                    单次任务
                                </div>
                                <div style={{ fontSize: 12, color: 'var(--text-subtle)', marginTop: 2 }}>
                                    一次性任务，完成后不再重复
                                </div>
                            </div>
                        </button>

                        <button
                            className='task-type-btn'
                            onClick={onRecurringTask}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 12,
                                padding: '14px 16px',
                                borderRadius: 12,
                                border: '1px solid var(--border-subtle)',
                                background: 'var(--surface)',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                                textAlign: 'left',
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.borderColor = 'var(--primary)';
                                e.currentTarget.style.background = 'var(--primary-soft)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.borderColor = 'var(--border-subtle)';
                                e.currentTarget.style.background = 'var(--surface)';
                            }}
                        >
                            <span style={{ fontSize: 28 }}>🔄</span>
                            <div>
                                <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-main)' }}>
                                    周期任务
                                </div>
                                <div style={{ fontSize: 12, color: 'var(--text-subtle)', marginTop: 2 }}>
                                    每周或每月定期重复的任务
                                </div>
                            </div>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};



interface DeleteChoiceDialogProps {
    open: boolean;
    title: string;
    message: string;
    onMoveToTrash: () => void;
    onMoveToUncategorized: () => void;
    onCancel: () => void;
}

export const DeleteChoiceDialog = ({
    open,
    title,
    message,
    onMoveToTrash,
    onMoveToUncategorized,
    onCancel,
}: DeleteChoiceDialogProps) => {
    if (!open) return null;

    return (
        <div className='create-overlay' onClick={onCancel}>
            <div
                className='create-dialog'
                style={{ width: 420, maxHeight: '80vh' }}
                onClick={(e) => e.stopPropagation()}
            >
                <header className='create-dialog-header'>
                    <div className='create-dialog-title-block'>
                        <div className='create-dialog-title' style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 20 }}>⚠️</span>
                            {title}
                        </div>
                    </div>
                    <button className='create-btn-icon' onClick={onCancel} title='关闭'>
                        ✕
                    </button>
                </header>

                <div className='create-dialog-body' style={{ padding: '20px 24px' }}>
                    <div style={{ fontSize: 14, color: 'var(--text-main)', lineHeight: 1.6, whiteSpace: 'pre-line' }}>
                        {message}
                    </div>
                </div>

                <footer className='create-dialog-footer'>
                    <div style={{ flex: 1 }}></div>
                    <div className='create-footer-actions'>
                        <button className='btn btn-light' onClick={onCancel}>
                            取消
                        </button>
                        <button
                            className='btn btn-primary'
                            onClick={onMoveToUncategorized}
                        >
                            移入未分类
                        </button>
                        <button
                            className='btn'
                            style={{
                                backgroundColor: '#dc2626',
                                color: '#ffffff',
                                border: 'none',
                                fontWeight: 600,
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = '#b91c1c';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = '#dc2626';
                            }}
                            onClick={onMoveToTrash}
                        >
                            放入回收站
                        </button>
                    </div>
                </footer>
            </div>
        </div>
    );
};

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: 'danger' | 'warning' | 'info';
}

export const ConfirmDialog = ({
  open,
  title,
  message,
  confirmLabel = '确定',
  cancelLabel = '取消',
  onConfirm,
  onCancel,
  variant = 'warning',
}: ConfirmDialogProps) => {
  if (!open) return null;

  const iconMap = {
    danger: '⚠️',
    warning: '⚠️',
    info: 'ℹ️',
  };

  const confirmColorMap = {
    danger: { bg: '#dc2626', hover: '#b91c1c' },
    warning: { bg: '#f59e0b', hover: '#d97706' },
    info: { bg: '#2563eb', hover: '#1d4ed8' },
  };

  const colors = confirmColorMap[variant];

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
              <span style={{ fontSize: 20 }}>{iconMap[variant]}</span>
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
              {cancelLabel}
            </button>
            <button
              className='btn'
              style={{
                backgroundColor: colors.bg,
                color: '#ffffff',
                border: 'none',
                fontWeight: 600,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = colors.hover;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = colors.bg;
              }}
              onClick={onConfirm}
            >
              {confirmLabel}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};

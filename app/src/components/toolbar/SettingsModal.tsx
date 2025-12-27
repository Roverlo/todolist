import { useState, useEffect } from 'react';

interface CloseSettingsModalProps {
  open: boolean;
  onClose: () => void;
}

export const SettingsModal = ({ open, onClose }: CloseSettingsModalProps) => {
  // 关闭行为状态
  const [closeAction, setCloseAction] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setCloseAction(localStorage.getItem('closeAction'));
    }
  }, [open]);

  const handleCloseActionChange = (action: string | null) => {
    setCloseAction(action);
    if (action) {
      localStorage.setItem('closeAction', action);
    } else {
      localStorage.removeItem('closeAction');
    }
  };

  if (!open) return null;

  const closeOptions = [
    { value: null, label: '每次询问', desc: '点击 X 时弹窗询问' },
    { value: 'minimize', label: '最小化到托盘', desc: '隐藏到系统托盘' },
    { value: 'exit', label: '直接退出', desc: '关闭程序' },
  ];

  const cardStyle = (isSelected: boolean) => ({
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    padding: '12px 8px',
    borderRadius: 10,
    cursor: 'pointer',
    border: isSelected ? '2px solid var(--primary)' : '2px solid var(--border)',
    background: isSelected ? 'var(--primary-light)' : 'var(--surface)',
    transition: 'all 0.2s ease',
    position: 'relative' as const,
    textAlign: 'center' as const,
  });

  return (
    <div className='create-overlay'>
      <div className='create-dialog' style={{ width: 400 }} onClick={(e) => e.stopPropagation()}>
        <header className='create-dialog-header'>
          <div className='create-dialog-title-block'>
            <div className='create-dialog-title'>关闭行为</div>
            <div className='create-dialog-subtitle'>设置点击关闭按钮的行为</div>
          </div>
          <button className='create-btn-icon' onClick={onClose} title='关闭'>
            ✕
          </button>
        </header>

        <div className='create-dialog-body'>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 10,
          }}>
            {closeOptions.map((option) => {
              const isSelected = closeAction === option.value;
              return (
                <div
                  key={option.value ?? 'ask'}
                  onClick={() => handleCloseActionChange(option.value)}
                  style={cardStyle(isSelected)}
                >
                  {isSelected && (
                    <div style={{
                      position: 'absolute',
                      top: 4,
                      right: 4,
                      color: 'var(--primary)',
                      fontSize: 10,
                      fontWeight: 'bold'
                    }}>✓</div>
                  )}
                  <div style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: 13, marginBottom: 2 }}>
                    {option.label}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-subtle)' }}>
                    {option.desc}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

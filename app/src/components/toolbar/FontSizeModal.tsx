import { useEffect } from 'react';
import { useAppStoreShallow } from '../../state/appStore';

interface FontSizeModalProps {
  open: boolean;
  onClose: () => void;
}

export const FontSizeModal = ({ open, onClose }: FontSizeModalProps) => {
  const { settings, setSettings } = useAppStoreShallow((state) => ({
    settings: state.settings,
    setSettings: state.setSettings,
  }));

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

  const currentSize = settings.listFontSize ?? 13;

  const sizes = [
    { value: 12, label: '小 (12px)', desc: '显示更多内容' },
    { value: 13, label: '默认 (13px)', desc: '标准大小' },
    { value: 14, label: '中 (14px)', desc: '清晰易读' },
    { value: 15, label: '中大 (15px)', desc: '略大一点' },
    { value: 16, label: '大 (16px)', desc: '突出显示' },
    { value: 18, label: '特大 (18px)', desc: '适合演示' },
    { value: 20, label: '超大 (20px)', desc: '最大号' },
  ];

  return (
    <div className='create-overlay'>
      <div className='create-dialog' style={{ width: 420 }} onClick={(e) => e.stopPropagation()}>
        <header className='create-dialog-header'>
          <div className='create-dialog-title-block'>
            <div className='create-dialog-title'>字体大小</div>
            <div className='create-dialog-subtitle'>调整任务列表中详情、进展等内容的字号</div>
          </div>
          <button className='create-btn-icon' onClick={onClose} title='关闭'>
            ✕
          </button>
        </header>

        <div className='create-dialog-body'>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {sizes.map((size) => (
              <div
                key={size.value}
                onClick={() => setSettings({ listFontSize: size.value })}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '12px 16px',
                  borderRadius: 8,
                  cursor: 'pointer',
                  background: currentSize === size.value 
                    ? 'rgba(0,0,0,0.04)' 
                    : 'transparent',
                  border: currentSize === size.value
                    ? '1px solid var(--primary-color, #2563eb)'
                    : '1px solid transparent',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  if (currentSize !== size.value) {
                    e.currentTarget.style.background = 'rgba(0,0,0,0.02)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (currentSize !== size.value) {
                    e.currentTarget.style.background = 'transparent';
                  }
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ 
                    fontSize: 15, 
                    fontWeight: currentSize === size.value ? 600 : 400,
                    color: '#1f2937'
                  }}>
                    {size.label}
                  </div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                    {size.desc}
                  </div>
                </div>
                
                {/* Preview text */}
                <div style={{ 
                  fontSize: size.value, 
                  color: '#374151', 
                  marginRight: 16,
                  opacity: 0.8 
                }}>
                  预览文本
                </div>

                {currentSize === size.value && (
                  <div style={{ color: 'var(--primary-color, #2563eb)', fontWeight: 'bold' }}>✓</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

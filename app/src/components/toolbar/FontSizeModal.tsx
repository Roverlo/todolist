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
          <div className='create-dialog-title-block' style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: 'var(--primary-soft)',
              color: 'var(--primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 16,
              fontWeight: 'bold'
            }}>
              Aa
            </div>
            <div>
              <div className='create-dialog-title' style={{ fontSize: 16 }}>字体大小</div>
              <div className='create-dialog-subtitle'>调整任务列表中详情、进展等内容的字号</div>
            </div>
          </div>
          <button className='create-btn-icon' onClick={onClose} title='关闭'>
            ✕
          </button>
        </header>

        <div className='create-dialog-body'>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {sizes.map((size) => (
              <div
                key={size.value}
                onClick={() => setSettings({ listFontSize: size.value })}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '12px 16px',
                  borderRadius: 12,
                  cursor: 'pointer',
                  background: currentSize === size.value
                    ? 'var(--primary-soft)'
                    : 'transparent',
                  border: currentSize === size.value
                    ? '1px solid var(--primary)'
                    : '1px solid transparent',
                  transition: 'all 0.2s ease',
                  position: 'relative'
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
                    fontSize: 14,
                    fontWeight: currentSize === size.value ? 600 : 500,
                    color: currentSize === size.value ? 'var(--primary)' : 'var(--text-main)'
                  }}>
                    {size.label}
                  </div>
                  <div style={{ fontSize: 11, color: currentSize === size.value ? 'var(--primary)' : 'var(--text-subtle)', marginTop: 2, opacity: 0.8 }}>
                    {size.desc}
                  </div>
                </div>

                {/* Preview text */}
                <div style={{
                  fontSize: size.value,
                  color: currentSize === size.value ? 'var(--primary)' : 'var(--text-main)',
                  marginRight: 12,
                  opacity: 0.9,
                  fontFamily: 'inherit',
                  whiteSpace: 'nowrap'
                }}>
                  预览 Text
                </div>

                <div style={{
                  width: 20,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--primary)',
                  opacity: currentSize === size.value ? 1 : 0
                }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

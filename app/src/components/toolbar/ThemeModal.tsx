import { useEffect } from 'react';
import { useAppStoreShallow } from '../../state/appStore';

interface ThemeModalProps {
  open: boolean;
  onClose: () => void;
}

export const ThemeModal = ({ open, onClose }: ThemeModalProps) => {
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

  const themes = [
    { key: 'blue', name: '经典蓝', color: '#2563eb', desc: '专业、冷静 (默认)' },
    { key: 'green', name: '清新绿', color: '#059669', desc: '自然、护眼' },
    { key: 'purple', name: '优雅紫', color: '#7c3aed', desc: '创意、灵动' },
    { key: 'orange', name: '活力橙', color: '#ea580c', desc: '温暖、积极' },
    { key: 'mono', name: '极简黑', color: '#171717', desc: '专注、极致' },
    { key: 'sky', name: '天空蓝', color: '#0284c7', desc: '通透、明快' },
    { key: 'rose', name: '樱花粉', color: '#e11d48', desc: '治愈、温暖' },
    { key: 'indigo', name: '深邃靛', color: '#4f46e5', desc: '沉稳、商务' },
  ];

  return (
    <div className='create-overlay'>
      <div className='create-dialog' style={{ width: 480 }} onClick={(e) => e.stopPropagation()}>
        <header className='create-dialog-header'>
          <div className='create-dialog-title-block'>
            <div className='create-dialog-title'>外观主题</div>
            <div className='create-dialog-subtitle'>选择你喜欢的界面风格</div>
          </div>
          <button className='create-btn-icon' onClick={onClose} title='关闭'>
            ✕
          </button>
        </header>

        <div className='create-dialog-body'>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 12,
          }}>
            {themes.map((theme) => {
              const isSelected = settings.colorScheme === theme.key;
              return (
                <div
                  key={theme.key}
                  onClick={() => setSettings({ colorScheme: theme.key as any })}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    padding: '16px 8px',
                    borderRadius: 12,
                    cursor: 'pointer',
                    border: isSelected
                      ? `2px solid ${theme.color}`
                      : '2px solid var(--border)',
                    background: isSelected
                      ? `${theme.color}10`
                      : 'var(--surface)',
                    transition: 'all 0.2s ease',
                    position: 'relative',
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.borderColor = theme.color;
                      e.currentTarget.style.transform = 'translateY(-2px)';
                      e.currentTarget.style.boxShadow = `0 4px 12px -2px ${theme.color}33`;
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.borderColor = 'var(--border)';
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = 'none';
                    }
                  }}
                >
                  {/* 选中标记 */}
                  {isSelected && (
                    <div style={{
                      position: 'absolute',
                      top: 6,
                      right: 6,
                      color: theme.color,
                      fontSize: 12,
                      fontWeight: 'bold'
                    }}>
                      ✓
                    </div>
                  )}

                  {/* 颜色圆球 */}
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: '50%',
                      backgroundColor: theme.color,
                      marginBottom: 10,
                      boxShadow: `0 4px 10px -2px ${theme.color}66`,
                    }}
                  />

                  {/* 主题名称 */}
                  <div style={{
                    fontWeight: 600,
                    color: 'var(--text-main)',
                    fontSize: 13,
                    textAlign: 'center',
                    marginBottom: 2,
                  }}>
                    {theme.name}
                  </div>

                  {/* 描述 */}
                  <div style={{
                    fontSize: 11,
                    color: 'var(--text-subtle)',
                    textAlign: 'center',
                    lineHeight: 1.3,
                  }}>
                    {theme.desc}
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

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
      <div className='create-dialog' style={{ width: 420 }} onClick={(e) => e.stopPropagation()}>
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {themes.map((theme) => (
              <div
                key={theme.key}
                onClick={() => setSettings({ colorScheme: theme.key as any })}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '12px 16px',
                  borderRadius: 12,
                  cursor: 'pointer',
                  border: settings.colorScheme === theme.key 
                    ? `2px solid ${theme.color}` 
                    : '2px solid transparent',
                  background: settings.colorScheme === theme.key 
                    ? 'rgba(0,0,0,0.02)' 
                    : 'transparent',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  if (settings.colorScheme !== theme.key) {
                    e.currentTarget.style.background = 'rgba(0,0,0,0.02)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (settings.colorScheme !== theme.key) {
                    e.currentTarget.style.background = 'transparent';
                  }
                }}
              >
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: '50%',
                    backgroundColor: theme.color,
                    marginRight: 16,
                    boxShadow: `0 4px 10px -2px ${theme.color}66`,
                  }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, color: '#1f2937', fontSize: 15 }}>
                    {theme.name}
                  </div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                    {theme.desc}
                  </div>
                </div>
                {settings.colorScheme === theme.key && (
                  <div style={{ color: theme.color, fontWeight: 'bold' }}>✓</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

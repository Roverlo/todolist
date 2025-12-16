import { useAppStoreShallow } from '../../state/appStore';


interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

export const SettingsModal = ({ open, onClose }: SettingsModalProps) => {
  const { settings, setSettings } = useAppStoreShallow((state) => ({
    settings: state.settings,
    setSettings: state.setSettings,
  }));

  if (!open) return null;

  const retentionOptions = [
    { value: 7, label: '短期保留', desc: '保留 7 天，适合临时存放' },
    { value: 30, label: '标准保留', desc: '保留 30 天，推荐设置 (默认)' },
    { value: 60, label: '中期保留', desc: '保留 60 天，更长的回溯期' },
    { value: 90, label: '长期保留', desc: '保留 90 天，季度清理' },
    { value: 365, label: '年度保留', desc: '保留 1 年，保留整年记录' },
    { value: 99999, label: '永久保留', desc: '从不自动删除' },
  ];

  return (
    <div className='create-overlay'>
      <div className='create-dialog' style={{ width: 520 }} onClick={(e) => e.stopPropagation()}>
        <header className='create-dialog-header'>
          <div className='create-dialog-title-block'>
            <div className='create-dialog-title'>回收站设置</div>
            <div className='create-dialog-subtitle'>配置回收站任务保留策略</div>
          </div>
          <button className='create-btn-icon' onClick={onClose} title='关闭'>
            ✕
          </button>
        </header>

        <div className='create-dialog-body'>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 12,
          }}>
            {retentionOptions.map((option) => {
              const isSelected = (settings.trashRetentionDays ?? 30) === option.value;
              return (
                <div
                  key={option.value}
                  onClick={() => setSettings({ trashRetentionDays: option.value })}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    padding: '16px 12px',
                    borderRadius: 12,
                    cursor: 'pointer',
                    border: isSelected
                      ? '2px solid var(--primary)'
                      : '2px solid var(--border)',
                    background: isSelected
                      ? 'var(--primary-light)'
                      : 'var(--surface)',
                    transition: 'all 0.2s ease',
                    position: 'relative',
                    textAlign: 'center',
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.borderColor = 'var(--primary)';
                      e.currentTarget.style.transform = 'translateY(-2px)';
                      e.currentTarget.style.boxShadow = '0 4px 12px -2px rgba(0, 0, 0, 0.1)';
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
                      color: 'var(--primary)',
                      fontSize: 12,
                      fontWeight: 'bold'
                    }}>
                      ✓
                    </div>
                  )}

                  {/* 标题 */}
                  <div style={{
                    fontWeight: 600,
                    color: 'var(--text-main)',
                    fontSize: 14,
                    marginBottom: 4,
                  }}>
                    {option.label}
                  </div>

                  {/* 描述 */}
                  <div style={{
                    fontSize: 12,
                    color: 'var(--text-subtle)',
                    lineHeight: 1.4,
                  }}>
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

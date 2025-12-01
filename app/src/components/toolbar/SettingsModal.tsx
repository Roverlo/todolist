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

  return (
    <div className='create-overlay' onClick={onClose}>
      <div className='create-dialog' style={{ width: 420 }} onClick={(e) => e.stopPropagation()}>
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
          <section className='create-section'>
            <div className='create-form-grid' style={{ gridTemplateColumns: '1fr' }}>
              <div className='create-field'>
                <label className='create-field-label'>保留时长</label>
                <select
                  className='create-field-select'
                  value={settings.trashRetentionDays ?? 30}
                  onChange={(e) => setSettings({ trashRetentionDays: Number(e.target.value) })}
                >
                  <option value={7}>保留 7 天</option>
                  <option value={30}>保留 30 天（推荐）</option>
                  <option value={60}>保留 60 天</option>
                  <option value={90}>保留 90 天</option>
                  <option value={365}>保留 1 年</option>
                  <option value={99999}>永久保留</option>
                </select>
                <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
                  超过该时间后，回收站中的任务将被自动彻底清除
                </div>
              </div>
            </div>
          </section>
        </div>

        <footer className='create-dialog-footer'>
          <div className='create-footer-meta'>设置将自动保存</div>
          <div className='create-footer-actions'>
            <button className='btn btn-primary' onClick={onClose}>
              完成
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};

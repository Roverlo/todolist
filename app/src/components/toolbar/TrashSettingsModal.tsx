import { useAppStoreShallow } from '../../state/appStore';

interface TrashSettingsModalProps {
    open: boolean;
    onClose: () => void;
}

export const TrashSettingsModal = ({ open, onClose }: TrashSettingsModalProps) => {
    const { settings, setSettings } = useAppStoreShallow((state) => ({
        settings: state.settings,
        setSettings: state.setSettings,
    }));

    if (!open) return null;

    const retentionOptions = [
        { value: 7, label: '短期保留', desc: '保留 7 天' },
        { value: 30, label: '标准保留', desc: '保留 30 天 (默认)' },
        { value: 60, label: '中期保留', desc: '保留 60 天' },
        { value: 90, label: '长期保留', desc: '保留 90 天' },
        { value: 365, label: '年度保留', desc: '保留 1 年' },
        { value: 99999, label: '永久保留', desc: '从不删除' },
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
            <div className='create-dialog' style={{ width: 480 }} onClick={(e) => e.stopPropagation()}>
                <header className='create-dialog-header'>
                    <div className='create-dialog-title-block'>
                        <div className='create-dialog-title'>回收站设置</div>
                        <div className='create-dialog-subtitle'>设置已删除任务的保留期限</div>
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
                        {retentionOptions.map((option) => {
                            const isSelected = (settings.trashRetentionDays ?? 30) === option.value;
                            return (
                                <div
                                    key={option.value}
                                    onClick={() => setSettings({ trashRetentionDays: option.value })}
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

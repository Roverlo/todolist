import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAppStoreShallow } from '../../state/appStore';
import { checkForUpdate, CURRENT_VERSION } from '../../utils/updateChecker';
import type { UpdateInfo } from '../../utils/updateChecker';
import { UpdateModal } from './UpdateModal';
import { VersionListModal } from './VersionListModal';

interface SettingsPanelProps {
    open: boolean;
    onClose: () => void;
    // 回调函数，用于打开各个子设置
    onImport: () => void;
    onExport: () => void;
    onBackup: () => void;
    onCloudSync: () => void;
    onRecurringTasks: () => void;
}

type SettingsTab = 'appearance' | 'data' | 'behavior' | 'about';

export const SettingsPanel = ({
    open,
    onClose,
    onImport,
    onExport,
    onBackup,
    onCloudSync,
    onRecurringTasks,
}: SettingsPanelProps) => {
    const { settings, setSettings } = useAppStoreShallow((state) => ({
        settings: state.settings,
        setSettings: state.setSettings,
    }));

    const [activeTab, setActiveTab] = useState<SettingsTab>('appearance');

    // 版本更新检测状态
    const [updateStatus, setUpdateStatus] = useState<'idle' | 'checking' | 'latest' | 'available' | 'error'>('idle');
    const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
    const [updateError, setUpdateError] = useState<string | null>(null);
    const [showUpdateModal, setShowUpdateModal] = useState(false);
    const [showVersionList, setShowVersionList] = useState(false);

    // 检查更新
    const handleCheckUpdate = async () => {
        setUpdateStatus('checking');
        setUpdateError(null);

        const result = await checkForUpdate(CURRENT_VERSION);

        if (result.error) {
            setUpdateStatus('error');
            setUpdateError(result.error);
        } else if (result.hasUpdate && result.updateInfo) {
            setUpdateStatus('available');
            setUpdateInfo(result.updateInfo);
            setShowUpdateModal(true);
        } else {
            setUpdateStatus('latest');
            // 3秒后恢复idle状态
            setTimeout(() => setUpdateStatus('idle'), 3000);
        }
    };

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
        { key: 'blue', name: '经典蓝', color: '#2563eb', desc: '专业、冷静' },
        { key: 'green', name: '清新绿', color: '#059669', desc: '自然、护眼' },
        { key: 'purple', name: '优雅紫', color: '#7c3aed', desc: '创意、灵动' },
        { key: 'orange', name: '活力橙', color: '#ea580c', desc: '温暖、积极' },
        { key: 'mono', name: '极简黑', color: '#171717', desc: '专注、极致' },
        { key: 'sky', name: '天空蓝', color: '#0284c7', desc: '通透、明快' },
        { key: 'rose', name: '樱花粉', color: '#e11d48', desc: '治愈、温暖' },
        { key: 'indigo', name: '深邃靛', color: '#4f46e5', desc: '沉稳、商务' },
    ];

    const fontSizes = [
        { value: 12, name: '小' },
        { value: 13, name: '中' },
        { value: 14, name: '大' },
    ];

    const tabs: { key: SettingsTab; label: string; icon: string }[] = [
        { key: 'appearance', label: '外观', icon: '🎨' },
        { key: 'data', label: '数据', icon: '💾' },
        { key: 'behavior', label: '行为', icon: '⚙️' },
        { key: 'about', label: '关于', icon: 'ℹ️' },
    ];

    const handleAction = (action: () => void) => {
        // 不关闭设置面板，让子模态框叠加在上面
        // 用户关闭子模态框后会回到设置面板
        action();
    };

    const handleOpenDataDirectory = () => {
        invoke('open_data_directory').catch((error) => {
            window.alert(`无法打开数据存储位置：${String(error)}`);
        });
    };

    // Toggle Switch 组件
    const ToggleSwitch = ({ enabled, onChange }: { enabled: boolean; onChange: () => void }) => (
        <div
            onClick={onChange}
            style={{
                width: 44,
                height: 24,
                borderRadius: 999,
                background: enabled ? 'var(--primary)' : 'var(--border)',
                position: 'relative',
                transition: 'background 0.2s ease',
                cursor: 'pointer',
                flexShrink: 0,
            }}
        >
            <div
                style={{
                    width: 20,
                    height: 20,
                    borderRadius: '50%',
                    background: 'white',
                    position: 'absolute',
                    top: 2,
                    left: enabled ? 22 : 2,
                    transition: 'left 0.2s ease',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                }}
            />
        </div>
    );

    // 设置项卡片
    const SettingCard = ({
        icon,
        title,
        description,
        onClick,
        rightContent,
    }: {
        icon: string;
        title: string;
        description?: string;
        onClick?: () => void;
        rightContent?: React.ReactNode;
    }) => (
        <div
            onClick={onClick}
            style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 16px',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                cursor: onClick ? 'pointer' : 'default',
                transition: 'all 0.2s ease',
                gap: 12,
            }}
            onMouseEnter={(e) => {
                if (onClick) {
                    e.currentTarget.style.borderColor = 'var(--primary)';
                    e.currentTarget.style.backgroundColor = 'var(--hover-bg)';
                }
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border)';
                e.currentTarget.style.backgroundColor = 'var(--surface)';
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
                <span style={{ fontSize: 20 }}>{icon}</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-main)' }}>{title}</div>
                    {description && (
                        <div style={{ fontSize: 12, color: 'var(--text-subtle)' }}>{description}</div>
                    )}
                </div>
            </div>
            {rightContent || (onClick && <span style={{ color: 'var(--text-subtle)' }}>→</span>)}
        </div>
    );

    return (
        <div className="create-overlay">
            <div
                className="create-dialog"
                style={{ width: 560, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}
                onClick={(e) => e.stopPropagation()}
            >
                <header className="create-dialog-header">
                    <div className="create-dialog-title-block">
                        <div className="create-dialog-title">设置</div>
                        <div className="create-dialog-subtitle">自定义应用的外观和行为</div>
                    </div>
                    <button className="create-btn-icon" onClick={onClose} title="关闭">
                        ✕
                    </button>
                </header>

                {/* Tab 导航 - 胶囊化设计 */}
                <div
                    style={{
                        display: 'flex',
                        gap: 8,
                        padding: '8px 24px 16px',
                        borderBottom: '1px solid var(--border)',
                    }}
                >
                    <div
                        style={{
                            display: 'flex',
                            gap: 4,
                            padding: 4,
                            background: 'var(--bg)',
                            borderRadius: 999,
                            border: '1px solid var(--border)',
                        }}
                    >
                        {tabs.map((tab) => {
                            const isActive = activeTab === tab.key;
                            return (
                                <button
                                    key={tab.key}
                                    onClick={() => setActiveTab(tab.key)}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 6,
                                        padding: '6px 14px',
                                        border: 'none',
                                        borderRadius: 999,
                                        background: isActive ? 'var(--primary)' : 'transparent',
                                        color: isActive ? 'white' : 'var(--text-subtle)',
                                        fontSize: 13,
                                        fontWeight: 500,
                                        cursor: 'pointer',
                                        transition: 'all 0.2s ease',
                                        boxShadow: isActive ? '0 2px 8px rgba(0,0,0,0.15)' : 'none',
                                    }}
                                    onMouseEnter={(e) => {
                                        if (!isActive) {
                                            e.currentTarget.style.background = 'var(--surface)';
                                            e.currentTarget.style.color = 'var(--text-main)';
                                        }
                                    }}
                                    onMouseLeave={(e) => {
                                        if (!isActive) {
                                            e.currentTarget.style.background = 'transparent';
                                            e.currentTarget.style.color = 'var(--text-subtle)';
                                        }
                                    }}
                                >
                                    <span style={{ fontSize: 14 }}>{tab.icon}</span>
                                    <span>{tab.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* 内容区域 */}
                <div
                    className="create-dialog-body"
                    style={{ overflowY: 'auto', flex: 1, padding: '20px 24px' }}
                >
                    {/* 外观设置 */}
                    {activeTab === 'appearance' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                            {/* 主题选择 */}
                            <div>
                                <div
                                    style={{
                                        fontSize: 13,
                                        fontWeight: 600,
                                        color: 'var(--text-main)',
                                        marginBottom: 12,
                                    }}
                                >
                                    主题配色
                                </div>
                                <div
                                    style={{
                                        display: 'grid',
                                        gridTemplateColumns: 'repeat(4, 1fr)',
                                        gap: 10,
                                    }}
                                >
                                    {themes.map((theme) => {
                                        const isSelected = settings.colorScheme === theme.key;
                                        return (
                                            <div
                                                key={theme.key}
                                                onClick={() => setSettings({ colorScheme: theme.key as any })}
                                                style={{
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    borderRadius: 10,
                                                    cursor: 'pointer',
                                                    border: isSelected
                                                        ? `2px solid ${theme.color}`
                                                        : '2px solid var(--border)',
                                                    overflow: 'hidden',
                                                    transition: 'all 0.2s ease',
                                                    position: 'relative',
                                                }}
                                                onMouseEnter={(e) => {
                                                    if (!isSelected) {
                                                        e.currentTarget.style.borderColor = theme.color;
                                                        e.currentTarget.style.transform = 'translateY(-2px)';
                                                        e.currentTarget.style.boxShadow = `0 4px 12px -2px ${theme.color}40`;
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
                                                {/* 上半部分：纯色块 */}
                                                <div
                                                    style={{
                                                        height: 32,
                                                        backgroundColor: theme.color,
                                                        position: 'relative',
                                                    }}
                                                >
                                                    {isSelected && (
                                                        <div
                                                            style={{
                                                                position: 'absolute',
                                                                top: 6,
                                                                right: 6,
                                                                color: 'white',
                                                                fontSize: 12,
                                                                fontWeight: 'bold',
                                                                textShadow: '0 1px 2px rgba(0,0,0,0.3)',
                                                            }}
                                                        >
                                                            ✓
                                                        </div>
                                                    )}
                                                </div>
                                                {/* 下半部分：文字描述 */}
                                                <div
                                                    style={{
                                                        padding: '6px 8px',
                                                        background: isSelected ? `${theme.color}10` : 'var(--surface)',
                                                    }}
                                                >
                                                    <div
                                                        style={{
                                                            fontWeight: 600,
                                                            color: 'var(--text-main)',
                                                            fontSize: 12,
                                                        }}
                                                    >
                                                        {theme.name}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* 字体大小 */}
                            <div>
                                <div
                                    style={{
                                        fontSize: 13,
                                        fontWeight: 600,
                                        color: 'var(--text-main)',
                                        marginBottom: 12,
                                    }}
                                >
                                    字体大小
                                </div>
                                <div style={{ display: 'flex', gap: 10 }}>
                                    {fontSizes.map((fs) => {
                                        const isSelected = (settings.listFontSize ?? 13) === fs.value;
                                        return (
                                            <div
                                                key={fs.value}
                                                onClick={() => setSettings({ listFontSize: fs.value })}
                                                style={{
                                                    flex: 1,
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    alignItems: 'center',
                                                    padding: '14px 12px',
                                                    borderRadius: 10,
                                                    cursor: 'pointer',
                                                    border: isSelected
                                                        ? '2px solid var(--primary)'
                                                        : '2px solid var(--border)',
                                                    background: isSelected ? 'var(--primary-bg)' : 'var(--surface)',
                                                    transition: 'all 0.2s ease',
                                                }}
                                                onMouseEnter={(e) => {
                                                    if (!isSelected) {
                                                        e.currentTarget.style.borderColor = 'var(--primary)';
                                                    }
                                                }}
                                                onMouseLeave={(e) => {
                                                    if (!isSelected) {
                                                        e.currentTarget.style.borderColor = 'var(--border)';
                                                    }
                                                }}
                                            >
                                                <span style={{ fontSize: fs.value, fontWeight: 600, marginBottom: 4 }}>
                                                    Aa
                                                </span>
                                                <span style={{ fontSize: 12, color: 'var(--text-subtle)' }}>{fs.name}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* 高亮显示开关 */}
                            <SettingCard
                                icon="🎯"
                                title="任务高亮显示"
                                description="过期任务显示红色背景，近期任务显示橙色背景"
                                onClick={() => setSettings({ highlightRows: !settings.highlightRows })}
                                rightContent={
                                    <ToggleSwitch
                                        enabled={settings.highlightRows ?? false}
                                        onChange={() => setSettings({ highlightRows: !settings.highlightRows })}
                                    />
                                }
                            />
                        </div>
                    )}

                    {/* 数据管理 */}
                    {activeTab === 'data' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <div
                                style={{
                                    fontSize: 13,
                                    fontWeight: 600,
                                    color: 'var(--text-main)',
                                    marginBottom: 4,
                                }}
                            >
                                本地数据
                            </div>
                            <SettingCard
                                icon="📂"
                                title="数据存储位置"
                                description="打开默认数据文件夹（系统文档\ProjectTodo）"
                                onClick={handleOpenDataDirectory}
                            />

                            <div
                                style={{
                                    fontSize: 13,
                                    fontWeight: 600,
                                    color: 'var(--text-main)',
                                    marginTop: 12,
                                    marginBottom: 4,
                                }}
                            >
                                导入导出
                            </div>
                            <SettingCard
                                icon="📥"
                                title="导入任务"
                                description="从 CSV 文件导入任务数据"
                                onClick={() => handleAction(onImport)}
                            />
                            <SettingCard
                                icon="📤"
                                title="导出任务"
                                description="将任务导出为 CSV 或 Markdown 文件"
                                onClick={() => handleAction(onExport)}
                            />

                            <div
                                style={{
                                    fontSize: 13,
                                    fontWeight: 600,
                                    color: 'var(--text-main)',
                                    marginTop: 12,
                                    marginBottom: 4,
                                }}
                            >
                                备份同步
                            </div>
                            <SettingCard
                                icon="💾"
                                title="本地备份"
                                description="备份或恢复应用数据"
                                onClick={() => handleAction(onBackup)}
                            />
                            <SettingCard
                                icon="☁️"
                                title="远程同步"
                                description="同步数据到 SMB/SSH 服务器"
                                onClick={() => handleAction(onCloudSync)}
                            />

                            <div
                                style={{
                                    fontSize: 13,
                                    fontWeight: 600,
                                    color: 'var(--text-main)',
                                    marginTop: 12,
                                    marginBottom: 4,
                                }}
                            >
                                任务管理
                            </div>
                            <SettingCard
                                icon="📅"
                                title="周期任务"
                                description="管理重复执行的任务模板"
                                onClick={() => handleAction(onRecurringTasks)}
                            />
                        </div>
                    )}

                    {/* 行为设置 */}
                    {activeTab === 'behavior' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <div
                                style={{
                                    fontSize: 13,
                                    fontWeight: 600,
                                    color: 'var(--text-main)',
                                    marginBottom: 4,
                                }}
                            >
                                窗口行为
                            </div>

                            {/* 关闭行为 */}
                            <div
                                style={{
                                    padding: '16px',
                                    background: 'var(--surface)',
                                    border: '1px solid var(--border)',
                                    borderRadius: 12,
                                }}
                            >
                                <div
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 12,
                                        marginBottom: 12,
                                    }}
                                >
                                    <span style={{ fontSize: 20 }}>🚪</span>
                                    <div>
                                        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-main)' }}>
                                            关闭窗口时
                                        </div>
                                        <div style={{ fontSize: 12, color: 'var(--text-subtle)' }}>
                                            选择点击关闭按钮后的行为
                                        </div>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    {[
                                        { key: 'ask', label: '询问我', icon: '❓' },
                                        { key: 'minimize', label: '最小化', icon: '➖' },
                                        { key: 'exit', label: '退出', icon: '✕' },
                                    ].map((opt) => {
                                        const savedChoice = localStorage.getItem('closeAction') ?? 'ask';
                                        const isSelected = savedChoice === opt.key;
                                        return (
                                            <button
                                                key={opt.key}
                                                onClick={() => {
                                                    if (opt.key === 'ask') {
                                                        localStorage.removeItem('closeAction');
                                                    } else {
                                                        localStorage.setItem('closeAction', opt.key);
                                                    }
                                                    // 触发重新渲染
                                                    setActiveTab('behavior');
                                                }}
                                                style={{
                                                    flex: 1,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    gap: 6,
                                                    padding: '10px 12px',
                                                    border: isSelected
                                                        ? '2px solid var(--primary)'
                                                        : '2px solid var(--border)',
                                                    borderRadius: 8,
                                                    background: isSelected ? 'var(--primary-bg)' : 'var(--surface)',
                                                    color: 'var(--text-main)',
                                                    fontSize: 13,
                                                    fontWeight: 500,
                                                    cursor: 'pointer',
                                                    transition: 'all 0.2s ease',
                                                }}
                                            >
                                                <span>{opt.icon}</span>
                                                <span>{opt.label}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            <div
                                style={{
                                    fontSize: 13,
                                    fontWeight: 600,
                                    color: 'var(--text-main)',
                                    marginTop: 12,
                                    marginBottom: 4,
                                }}
                            >
                                回收站
                            </div>

                            {/* 回收站保留期限 */}
                            <div
                                style={{
                                    padding: '16px',
                                    background: 'var(--surface)',
                                    border: '1px solid var(--border)',
                                    borderRadius: 12,
                                }}
                            >
                                <div
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 12,
                                        marginBottom: 12,
                                    }}
                                >
                                    <span style={{ fontSize: 20 }}>🗑️</span>
                                    <div>
                                        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-main)' }}>
                                            自动清理
                                        </div>
                                        <div style={{ fontSize: 12, color: 'var(--text-subtle)' }}>
                                            设置回收站任务的保留天数
                                        </div>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                    {[
                                        { value: 7, label: '7 天' },
                                        { value: 30, label: '30 天' },
                                        { value: 60, label: '60 天' },
                                        { value: 90, label: '90 天' },
                                        { value: 365, label: '1 年' },
                                        { value: 99999, label: '永久' },
                                    ].map((opt) => {
                                        const isSelected = (settings.trashRetentionDays ?? 30) === opt.value;
                                        return (
                                            <button
                                                key={opt.value}
                                                onClick={() => setSettings({ trashRetentionDays: opt.value })}
                                                style={{
                                                    padding: '8px 12px',
                                                    border: isSelected
                                                        ? '2px solid var(--primary)'
                                                        : '2px solid var(--border)',
                                                    borderRadius: 8,
                                                    background: isSelected ? 'var(--primary-bg)' : 'var(--surface)',
                                                    color: 'var(--text-main)',
                                                    fontSize: 12,
                                                    fontWeight: 500,
                                                    cursor: 'pointer',
                                                    transition: 'all 0.2s ease',
                                                }}
                                            >
                                                {opt.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* 到期提醒 */}
                            <div
                                style={{
                                    fontSize: 13,
                                    fontWeight: 600,
                                    color: 'var(--text-main)',
                                    marginTop: 12,
                                    marginBottom: 4,
                                }}
                            >
                                到期提醒
                            </div>

                            <div
                                style={{
                                    padding: '16px',
                                    background: 'var(--surface)',
                                    border: '1px solid var(--border)',
                                    borderRadius: 12,
                                }}
                            >
                                {/* 启用/禁用提醒 */}
                                <div
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        marginBottom: 16,
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                        <span style={{ fontSize: 20 }}>⏰</span>
                                        <div>
                                            <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-main)' }}>
                                                启动时提醒到期任务
                                            </div>
                                            <div style={{ fontSize: 12, color: 'var(--text-subtle)' }}>
                                                应用启动时自动弹出到期任务提醒
                                            </div>
                                        </div>
                                    </div>
                                    <ToggleSwitch
                                        enabled={settings.dueReminderEnabled !== false}
                                        onChange={() => setSettings({ dueReminderEnabled: settings.dueReminderEnabled === false ? true : false })}
                                    />
                                </div>

                                {/* 暂停状态显示与重置 */}
                                {settings.dueReminderSnoozeUntil && new Date(settings.dueReminderSnoozeUntil) > new Date() && (
                                    <div
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            padding: '12px',
                                            background: 'var(--primary-bg)',
                                            borderRadius: 8,
                                            border: '1px solid var(--primary)',
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <span style={{ fontSize: 16 }}>😴</span>
                                            <span style={{ fontSize: 13, color: 'var(--text-main)' }}>
                                                提醒已暂停至 {new Date(settings.dueReminderSnoozeUntil).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', weekday: 'short' })}
                                            </span>
                                        </div>
                                        <button
                                            onClick={() => setSettings({ dueReminderSnoozeUntil: undefined })}
                                            style={{
                                                padding: '4px 10px',
                                                fontSize: 12,
                                                borderRadius: 6,
                                                border: '1px solid var(--primary)',
                                                background: 'var(--surface)',
                                                color: 'var(--primary)',
                                                cursor: 'pointer',
                                            }}
                                        >
                                            恢复提醒
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* 关于 */}
                    {activeTab === 'about' && (
                        <div style={{ display: 'flex', gap: 12 }}>
                            {/* 左栏：版本信息 */}
                            <div
                                style={{
                                    flex: 1,
                                    padding: '20px',
                                    background: 'var(--surface)',
                                    border: '1px solid var(--border)',
                                    borderRadius: 12,
                                    display: 'flex',
                                    flexDirection: 'column',
                                }}
                            >
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    marginBottom: 16,
                                    paddingBottom: 12,
                                    borderBottom: '1px solid var(--border)',
                                }}>
                                    <span style={{ fontSize: 18 }}>📦</span>
                                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-main)' }}>版本信息</span>
                                </div>
                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                                    <div style={{
                                        fontSize: 22,
                                        fontWeight: 700,
                                        color: 'var(--primary)',
                                        fontFamily: 'monospace',
                                        marginBottom: 8,
                                    }}>
                                        {CURRENT_VERSION}
                                    </div>
                                    <div style={{ fontSize: 12, color: 'var(--text-subtle)', marginBottom: 12 }}>
                                        更新于 2025.12.28 18:16
                                    </div>
                                    {/* 检查更新按钮 */}
                                    <button
                                        onClick={handleCheckUpdate}
                                        disabled={updateStatus === 'checking'}
                                        style={{
                                            padding: '8px 16px',
                                            border: 'none',
                                            borderRadius: 8,
                                            background: updateStatus === 'checking' ? 'var(--border)' : 'var(--primary)',
                                            color: 'white',
                                            fontSize: 13,
                                            fontWeight: 500,
                                            cursor: updateStatus === 'checking' ? 'not-allowed' : 'pointer',
                                            transition: 'all 0.2s ease',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 6,
                                        }}
                                    >
                                        {updateStatus === 'checking' ? (
                                            <>
                                                <span style={{ animation: 'spin 1s linear infinite' }}>⏳</span>
                                                <span>检查中...</span>
                                            </>
                                        ) : updateStatus === 'latest' ? (
                                            <>
                                                <span>✅</span>
                                                <span>已是最新</span>
                                            </>
                                        ) : updateStatus === 'error' ? (
                                            <>
                                                <span>❌</span>
                                                <span>检查失败</span>
                                            </>
                                        ) : (
                                            <>
                                                <span>🔄</span>
                                                <span>检查更新</span>
                                            </>
                                        )}
                                    </button>
                                    {updateStatus === 'error' && updateError && (
                                        <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 6 }}>
                                            {updateError}
                                        </div>
                                    )}
                                    {/* 查看所有版本按钮 */}
                                    <button
                                        onClick={() => setShowVersionList(true)}
                                        style={{
                                            marginTop: 8,
                                            padding: '6px 12px',
                                            border: '1px solid var(--border)',
                                            borderRadius: 6,
                                            background: 'transparent',
                                            color: 'var(--text-subtle)',
                                            fontSize: 12,
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 4,
                                        }}
                                    >
                                        <span>📃</span>
                                        <span>查看所有版本</span>
                                    </button>
                                    {/* 便携版说明 */}
                                    <div
                                        style={{
                                            marginTop: 12,
                                            padding: '8px 10px',
                                            background: 'rgba(59, 130, 246, 0.06)',
                                            borderRadius: 6,
                                            border: '1px dashed rgba(59, 130, 246, 0.2)',
                                        }}
                                    >
                                        <div style={{ fontSize: 10, color: 'var(--text-subtle)', lineHeight: 1.5 }}>
                                            💡 本软件为<b>便携版</b>，无需安装，下载新版本后替换当前 exe 即可更新，数据自动保留。
                                        </div>
                                    </div>

                                    {/* 更新设置 */}
                                    <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-main)', marginBottom: 10 }}>
                                            ⚙️ 更新设置
                                        </div>
                                        {/* 启动时检查 */}
                                        <label style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 8,
                                            marginBottom: 8,
                                            cursor: 'pointer',
                                            fontSize: 12,
                                            color: 'var(--text-main)',
                                        }}>
                                            <input
                                                type="checkbox"
                                                checked={settings.updateCheck?.checkOnStartup ?? true}
                                                onChange={(e) => setSettings({
                                                    updateCheck: {
                                                        ...settings.updateCheck,
                                                        checkOnStartup: e.target.checked,
                                                        autoCheck: settings.updateCheck?.autoCheck ?? true,
                                                        checkInterval: settings.updateCheck?.checkInterval ?? 60,
                                                    },
                                                })}
                                                style={{ accentColor: 'var(--primary)' }}
                                            />
                                            启动时自动检查更新
                                        </label>
                                        {/* 定时检查 */}
                                        <label style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 8,
                                            marginBottom: 8,
                                            cursor: 'pointer',
                                            fontSize: 12,
                                            color: 'var(--text-main)',
                                        }}>
                                            <input
                                                type="checkbox"
                                                checked={settings.updateCheck?.autoCheck ?? true}
                                                onChange={(e) => setSettings({
                                                    updateCheck: {
                                                        ...settings.updateCheck,
                                                        checkOnStartup: settings.updateCheck?.checkOnStartup ?? true,
                                                        autoCheck: e.target.checked,
                                                        checkInterval: settings.updateCheck?.checkInterval ?? 60,
                                                    },
                                                })}
                                                style={{ accentColor: 'var(--primary)' }}
                                            />
                                            定时检查更新
                                        </label>
                                        {/* 检查间隔 */}
                                        {(settings.updateCheck?.autoCheck ?? true) && (
                                            <div style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 8,
                                                marginLeft: 20,
                                                marginBottom: 8,
                                                fontSize: 12,
                                                color: 'var(--text-subtle)',
                                            }}>
                                                <span>检查间隔:</span>
                                                <select
                                                    value={settings.updateCheck?.checkInterval ?? 60}
                                                    onChange={(e) => setSettings({
                                                        updateCheck: {
                                                            ...settings.updateCheck,
                                                            checkOnStartup: settings.updateCheck?.checkOnStartup ?? true,
                                                            autoCheck: settings.updateCheck?.autoCheck ?? true,
                                                            checkInterval: parseInt(e.target.value),
                                                        },
                                                    })}
                                                    style={{
                                                        padding: '4px 8px',
                                                        borderRadius: 4,
                                                        border: '1px solid var(--border)',
                                                        background: 'var(--surface)',
                                                        color: 'var(--text-main)',
                                                        fontSize: 12,
                                                    }}
                                                >
                                                    <option value={10}>10 分钟</option>
                                                    <option value={30}>30 分钟</option>
                                                    <option value={60}>1 小时</option>
                                                    <option value={120}>2 小时</option>
                                                    <option value={240}>4 小时</option>
                                                    <option value={1440}>每天一次</option>
                                                </select>
                                            </div>
                                        )}
                                        {/* 上次检查时间 */}
                                        {settings.updateCheck?.lastCheckAt && (
                                            <div style={{ fontSize: 11, color: 'var(--text-subtle)', marginTop: 4 }}>
                                                上次检查: {new Date(settings.updateCheck.lastCheckAt).toLocaleString()}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* 右栏：排序逻辑 */}
                            <div
                                style={{
                                    flex: 1,
                                    padding: '20px',
                                    background: 'var(--surface)',
                                    border: '1px solid var(--border)',
                                    borderRadius: 12,
                                }}
                            >
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    marginBottom: 16,
                                    paddingBottom: 12,
                                    borderBottom: '1px solid var(--border)',
                                }}>
                                    <span style={{ fontSize: 18 }}>📊</span>
                                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-main)' }}>排序逻辑</span>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span style={{ fontSize: 14 }}>🔴</span>
                                        <div>
                                            <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-main)' }}>紧急区</span>
                                            <span style={{ fontSize: 12, color: 'var(--text-subtle)', marginLeft: 6 }}>逾期/今日到期</span>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span style={{ fontSize: 14 }}>📅</span>
                                        <div>
                                            <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-main)' }}>规划区</span>
                                            <span style={{ fontSize: 12, color: 'var(--text-subtle)', marginLeft: 6 }}>未来到期任务</span>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span style={{ fontSize: 14 }}>⚪</span>
                                        <div>
                                            <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-main)' }}>待定区</span>
                                            <span style={{ fontSize: 12, color: 'var(--text-subtle)', marginLeft: 6 }}>无截止日期</span>
                                        </div>
                                    </div>
                                </div>
                                <div style={{
                                    marginTop: 12,
                                    paddingTop: 10,
                                    borderTop: '1px dashed var(--border)',
                                    fontSize: 11,
                                    color: 'var(--text-subtle)',
                                }}>
                                    💡 已完成任务自动沉底
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {showUpdateModal && updateInfo && (
                    <UpdateModal
                        open={showUpdateModal}
                        onClose={() => setShowUpdateModal(false)}
                        updateInfo={updateInfo}
                    />
                )}

                {/* 版本列表弹窗 */}
                <VersionListModal
                    open={showVersionList}
                    onClose={() => setShowVersionList(false)}
                />
            </div>
        </div>
    );
};

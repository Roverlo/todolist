import { transferNotes } from '../../utils/noteAttachments';
import { createAutoBackup } from '../../utils/backupUtils';
import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAppStoreShallow, useAppStore } from '../../state/appStore';

interface CloudSyncModalProps {
    open: boolean;
    onClose: () => void;
}

type SyncMethod = 'smb' | 'ssh';

interface SyncConfig {
    method: SyncMethod;
    enabled: boolean;
    lastSyncTime: number | null;
    // SMB 配置
    smbPath: string;
    smbUsername: string;
    smbPassword: string;
    // SSH 配置
    sshHost: string;
    sshPort: string;
    sshUsername: string;
    sshPassword: string;
    sshPath: string;
}

const defaultConfig: SyncConfig = {
    method: 'smb',
    enabled: false,
    lastSyncTime: null,
    smbPath: '',
    smbUsername: '',
    smbPassword: '',
    sshHost: '',
    sshPort: '22',
    sshUsername: '',
    sshPassword: '',
    sshPath: '/home/user/ProjectTodo/',
};

const methodLabels: Record<SyncMethod, string> = {
    smb: '网络共享 (SMB/Windows共享)',
    ssh: 'SSH/SFTP (Linux服务器)',
};

export const CloudSyncModal = ({ open, onClose }: CloudSyncModalProps) => {
    const [config, setConfig] = useState<SyncConfig>(defaultConfig);
    const [status, setStatus] = useState<'idle' | 'testing' | 'syncing' | 'success' | 'error'>('idle');
    const [message, setMessage] = useState('');
    const [showHelp, setShowHelp] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    const { tasks, projects, settings, notes, tags } = useAppStoreShallow((state) => ({
        tasks: state.tasks,
        projects: state.projects,
        settings: state.settings,
        notes: state.notes,
        tags: state.tags,
    }));

    useEffect(() => {
        if (open) {
            const saved = localStorage.getItem('cloudSyncConfig');
            if (saved) {
                try {
                    const parsed = JSON.parse(saved);
                    setConfig({ ...defaultConfig, ...parsed });
                } catch {
                    setConfig(defaultConfig);
                }
            }
            setStatus('idle');
            setMessage('');
        }
    }, [open]);

    const saveConfig = (newConfig: SyncConfig) => {
        setConfig(newConfig);
        localStorage.setItem('cloudSyncConfig', JSON.stringify(newConfig));
    };

    // 测试连接
    const testConnection = async () => {
        setStatus('testing');
        setMessage('正在测试连接...');

        try {
            if (config.method === 'smb') {
                if (!config.smbPath) throw new Error('请输入共享路径');

                const result = await invoke<{ success: boolean; message: string }>('smb_test_connection', {
                    path: config.smbPath,
                    username: config.smbUsername,
                    password: config.smbPassword,
                });

                if (result.success) {
                    setStatus('success');
                    setMessage('✅ SMB 连接成功！');
                    saveConfig({ ...config, enabled: true });
                } else {
                    throw new Error(result.message);
                }

            } else if (config.method === 'ssh') {
                if (!config.sshHost) throw new Error('请输入服务器地址');

                const result = await invoke<{ success: boolean; message: string }>('ssh_test_connection', {
                    host: config.sshHost,
                    port: parseInt(config.sshPort) || 22,
                    username: config.sshUsername,
                    password: config.sshPassword,
                });

                if (result.success) {
                    setStatus('success');
                    setMessage('✅ SSH 连接成功！');
                    saveConfig({ ...config, enabled: true });
                } else {
                    throw new Error(result.message);
                }
            }
        } catch (err) {
            setStatus('error');
            setMessage(`❌ ${err instanceof Error ? err.message : String(err)}`);
        }
    };

    // 上传同步
    const uploadSync = async () => {
        if (!config.enabled) {
            setMessage('请先测试连接');
            setStatus('error');
            return;
        }

        setStatus('syncing');
        setMessage('正在上传数据...');

        try {
            const data = JSON.stringify({ tasks, projects, settings, notes: await transferNotes(notes, 'export'), tags, timestamp: Date.now() }, null, 2);

            if (config.method === 'smb') {
                const result = await invoke<{ success: boolean; message: string }>('smb_upload', {
                    path: config.smbPath,
                    username: config.smbUsername,
                    password: config.smbPassword,
                    data,
                });

                if (!result.success) throw new Error(result.message);

            } else if (config.method === 'ssh') {
                const result = await invoke<{ success: boolean; message: string }>('ssh_upload', {
                    host: config.sshHost,
                    port: parseInt(config.sshPort) || 22,
                    username: config.sshUsername,
                    password: config.sshPassword,
                    remotePath: config.sshPath,
                    data,
                });

                if (!result.success) throw new Error(result.message);
            }

            saveConfig({ ...config, lastSyncTime: Date.now() });
            setStatus('success');
            setMessage('✅ 数据已上传');

        } catch (err) {
            setStatus('error');
            setMessage(`❌ ${err instanceof Error ? err.message : String(err)}`);
        }
    };

    // 从远程恢复
    const downloadSync = async () => {
        if (!config.enabled) {
            setMessage('请先测试连接');
            setStatus('error');
            return;
        }

        setStatus('syncing');
        setMessage('正在下载数据...');

        try {
            let cloudData: string | null = null;

            if (config.method === 'smb') {
                const result = await invoke<{ success: boolean; message: string; data?: string }>('smb_download', {
                    path: config.smbPath,
                    username: config.smbUsername,
                    password: config.smbPassword,
                });

                if (!result.success) throw new Error(result.message);
                cloudData = result.data || null;

            } else if (config.method === 'ssh') {
                const result = await invoke<{ success: boolean; message: string; data?: string }>('ssh_download', {
                    host: config.sshHost,
                    port: parseInt(config.sshPort) || 22,
                    username: config.sshUsername,
                    password: config.sshPassword,
                    remotePath: config.sshPath,
                });

                if (!result.success) throw new Error(result.message);
                cloudData = result.data || null;
            }

            if (cloudData) {
                const parsed = JSON.parse(cloudData);

                // 备份本地
                const backup = await createAutoBackup(useAppStore.getState());
                if (!backup) throw new Error('无法备份当前数据，已停止恢复');
                if (parsed.notes) parsed.notes = await transferNotes(parsed.notes, 'import');

                // 应用
                useAppStore.setState((state) => ({
                    ...state,
                    tasks: parsed.tasks || state.tasks,
                    projects: parsed.projects || state.projects,
                    notes: parsed.notes || state.notes,
                    tags: parsed.tags || state.tags,
                }));

                saveConfig({ ...config, lastSyncTime: Date.now() });
                setStatus('success');
                setMessage('✅ 已从远程恢复（本地已备份）');
            } else {
                throw new Error('远程没有数据');
            }

        } catch (err) {
            setStatus('error');
            setMessage(`❌ ${err instanceof Error ? err.message : String(err)}`);
        }
    };

    if (!open) return null;

    const inputStyle = {
        width: '100%',
        padding: '8px 12px',
        borderRadius: 6,
        border: '1px solid var(--border)',
        background: 'var(--surface)',
        color: 'var(--text)',
        fontSize: 13,
    };

    const labelStyle = {
        fontSize: 12,
        color: 'var(--text-subtle)',
        marginBottom: 4,
        display: 'block',
    };

    const btnStyle = (variant: 'primary' | 'secondary' | 'danger') => ({
        padding: '8px 16px',
        borderRadius: 6,
        border: variant === 'secondary' ? '1px solid var(--border)' : 'none',
        background: variant === 'primary' ? 'var(--primary)' : variant === 'danger' ? '#e74c3c' : 'var(--surface)',
        color: variant === 'secondary' ? 'var(--text)' : 'white',
        fontSize: 13,
        fontWeight: 500,
        cursor: status === 'testing' || status === 'syncing' ? 'wait' : 'pointer',
        opacity: status === 'testing' || status === 'syncing' ? 0.7 : 1,
    });

    const isLoading = status === 'testing' || status === 'syncing';

    return (
        <div className='create-overlay' style={{ zIndex: 100 }} onClick={(e) => e.stopPropagation()}>
            <div className='create-dialog' style={{ width: 440, maxHeight: '90vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
                <header className='create-dialog-header'>
                    <div className='create-dialog-title-block'>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div className='create-dialog-title'>☁️ 云端同步</div>
                            <div style={{ position: 'relative' }}>
                                <button
                                    type="button"
                                    onMouseEnter={() => setShowHelp(true)}
                                    onMouseLeave={() => setShowHelp(false)}
                                    style={{
                                        width: 18,
                                        height: 18,
                                        borderRadius: '50%',
                                        border: '1px solid var(--border)',
                                        background: 'var(--surface)',
                                        color: 'var(--text-subtle)',
                                        fontSize: 11,
                                        cursor: 'help',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                    }}
                                >
                                    ?
                                </button>
                                {showHelp && (
                                    <div style={{
                                        position: 'absolute',
                                        top: '100%',
                                        left: 0,
                                        marginTop: 8,
                                        width: 280,
                                        padding: 12,
                                        borderRadius: 8,
                                        background: 'var(--surface)',
                                        border: '1px solid var(--border)',
                                        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                                        zIndex: 100,
                                        fontSize: 12,
                                        lineHeight: 1.5,
                                        color: 'var(--text)',
                                    }}>
                                        <div style={{ fontWeight: 600, marginBottom: 8 }}>同步说明</div>
                                        <div style={{ marginBottom: 6 }}>
                                            <strong>触发方式</strong>：手动点击按钮，无自动同步
                                        </div>
                                        <div style={{ marginBottom: 6 }}>
                                            <strong>上传同步</strong>：本地数据 → 远程 <code>data.json</code>
                                        </div>
                                        <div style={{ marginBottom: 6 }}>
                                            <strong>下载恢复</strong>：远程数据 → 本地（自动备份原数据）
                                        </div>
                                        <div style={{ color: 'var(--text-subtle)', fontSize: 11 }}>
                                            ⚠️ 完全覆盖模式，不合并冲突，以最后操作为准
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className='create-dialog-subtitle'>多设备数据同步</div>
                    </div>
                    <button className='create-btn-icon' onClick={onClose} title='关闭'>✕</button>
                </header>

                <div className='create-dialog-body' style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {/* 状态 */}
                    <div style={{
                        padding: '8px 12px',
                        borderRadius: 6,
                        background: config.enabled ? 'rgba(46, 204, 113, 0.1)' : 'rgba(149, 165, 166, 0.1)',
                        color: config.enabled ? '#27ae60' : 'var(--text-subtle)',
                        fontSize: 13,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                    }}>
                        <span>{config.enabled ? '🟢' : '🔴'}</span>
                        <span>{config.enabled ? '已连接' : '未连接'}</span>
                        {config.lastSyncTime && (
                            <span style={{ marginLeft: 'auto', fontSize: 11 }}>
                                上次: {new Date(config.lastSyncTime).toLocaleString()}
                            </span>
                        )}
                    </div>

                    {/* 同步方式 */}
                    <div>
                        <label style={labelStyle}>同步方式</label>
                        <select
                            value={config.method}
                            onChange={(e) => setConfig({ ...config, method: e.target.value as SyncMethod, enabled: false })}
                            style={{ ...inputStyle, cursor: 'pointer' }}
                        >
                            {Object.entries(methodLabels).map(([key, label]) => (
                                <option key={key} value={key}>{label}</option>
                            ))}
                        </select>
                    </div>

                    {/* SMB 配置 */}
                    {config.method === 'smb' && (
                        <>
                            <div>
                                <label style={labelStyle}>共享路径</label>
                                <input
                                    type="text"
                                    placeholder="\\192.168.1.100\share\backup"
                                    value={config.smbPath}
                                    onChange={(e) => setConfig({ ...config, smbPath: e.target.value })}
                                    style={inputStyle}
                                />
                                <div style={{ fontSize: 11, color: 'var(--text-subtle)', marginTop: 4 }}>
                                    格式：\\服务器IP\共享名\文件夹
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: 10 }}>
                                <div style={{ flex: 1 }}>
                                    <label style={labelStyle}>用户名</label>
                                    <input
                                        type="text"
                                        placeholder="DOMAIN\user 或 user"
                                        value={config.smbUsername}
                                        onChange={(e) => setConfig({ ...config, smbUsername: e.target.value })}
                                        style={inputStyle}
                                    />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <label style={labelStyle}>密码</label>
                                    <div style={{ position: 'relative' }}>
                                        <input
                                            type={showPassword ? 'text' : 'password'}
                                            placeholder="••••••"
                                            value={config.smbPassword}
                                            onChange={(e) => setConfig({ ...config, smbPassword: e.target.value })}
                                            style={{ ...inputStyle, paddingRight: 36 }}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                            style={{
                                                position: 'absolute',
                                                right: 8,
                                                top: '50%',
                                                transform: 'translateY(-50%)',
                                                background: 'none',
                                                border: 'none',
                                                cursor: 'pointer',
                                                fontSize: 14,
                                            }}
                                        >
                                            {showPassword ? '🙈' : '👁️'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}

                    {/* SSH 配置 */}
                    {config.method === 'ssh' && (
                        <>
                            <div style={{ display: 'flex', gap: 10 }}>
                                <div style={{ flex: 2 }}>
                                    <label style={labelStyle}>服务器地址</label>
                                    <input
                                        type="text"
                                        placeholder="192.168.1.100"
                                        value={config.sshHost}
                                        onChange={(e) => setConfig({ ...config, sshHost: e.target.value })}
                                        style={inputStyle}
                                    />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <label style={labelStyle}>端口</label>
                                    <input
                                        type="text"
                                        placeholder="22"
                                        value={config.sshPort}
                                        onChange={(e) => setConfig({ ...config, sshPort: e.target.value })}
                                        style={inputStyle}
                                    />
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: 10 }}>
                                <div style={{ flex: 1 }}>
                                    <label style={labelStyle}>用户名</label>
                                    <input
                                        type="text"
                                        placeholder="root"
                                        value={config.sshUsername}
                                        onChange={(e) => setConfig({ ...config, sshUsername: e.target.value })}
                                        style={inputStyle}
                                    />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <label style={labelStyle}>密码</label>
                                    <div style={{ position: 'relative' }}>
                                        <input
                                            type={showPassword ? 'text' : 'password'}
                                            placeholder="••••••"
                                            value={config.sshPassword}
                                            onChange={(e) => setConfig({ ...config, sshPassword: e.target.value })}
                                            style={{ ...inputStyle, paddingRight: 36 }}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                            style={{
                                                position: 'absolute',
                                                right: 8,
                                                top: '50%',
                                                transform: 'translateY(-50%)',
                                                background: 'none',
                                                border: 'none',
                                                cursor: 'pointer',
                                                fontSize: 14,
                                            }}
                                        >
                                            {showPassword ? '🙈' : '👁️'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                            <div>
                                <label style={labelStyle}>远程路径</label>
                                <input
                                    type="text"
                                    placeholder="/home/user/ProjectTodo/"
                                    value={config.sshPath}
                                    onChange={(e) => setConfig({ ...config, sshPath: e.target.value })}
                                    style={inputStyle}
                                />
                            </div>
                        </>
                    )}

                    {/* 消息 */}
                    {message && (
                        <div style={{
                            padding: '8px 12px',
                            borderRadius: 6,
                            background: status === 'error' ? 'rgba(231, 76, 60, 0.1)' :
                                status === 'success' ? 'rgba(46, 204, 113, 0.1)' : 'rgba(52, 152, 219, 0.1)',
                            color: status === 'error' ? '#e74c3c' : status === 'success' ? '#27ae60' : '#3498db',
                            fontSize: 13,
                        }}>
                            {message}
                        </div>
                    )}

                    {/* 按钮 */}
                    <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                        <button type="button" onClick={testConnection} disabled={isLoading} style={btnStyle('secondary')}>
                            测试连接
                        </button>
                        <button type="button" onClick={uploadSync} disabled={isLoading || !config.enabled} style={btnStyle('primary')}>
                            上传同步
                        </button>
                        <button type="button" onClick={downloadSync} disabled={isLoading || !config.enabled} style={btnStyle('danger')}>
                            下载恢复
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

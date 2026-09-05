import { useState, useEffect } from 'react';
import { useAppStoreShallow, useAppStore } from '../../state/appStore';
import { save, open as openDialog } from '@tauri-apps/plugin-dialog';
import { writeTextFile, readTextFile } from '@tauri-apps/plugin-fs';
import { ConfirmRestoreModal } from './ConfirmRestoreModal';
import {
    BACKUP_VERSION,
    createBackupData,
    validateBackupFile,
    createAutoBackup,
    getErrorMessage,
    type ValidationResult,
    type BackupFile,
} from '../../utils/backupUtils';

interface BackupModalProps {
    open: boolean;
    onClose: () => void;
}

export const BackupModal = ({ open, onClose }: BackupModalProps) => {
    const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [message, setMessage] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);

    // 确认恢复对话框状态
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [pendingRestore, setPendingRestore] = useState<{
        data: BackupFile;
        preview: ValidationResult['preview'];
    } | null>(null);
    const [autoBackupPath, setAutoBackupPath] = useState<string | null>(null);

    const {
        projects,
        tasks,
        settings,
        recurringTemplates,
        sortSchemes,
        dictionary,
        filters,
        groupBy,
        sortRules,
        savedFilters,
        columnConfig,
    } = useAppStoreShallow((state) => ({
        projects: state.projects,
        tasks: state.tasks,
        settings: state.settings,
        recurringTemplates: state.recurringTemplates,
        sortSchemes: state.sortSchemes,
        dictionary: state.dictionary,
        filters: state.filters,
        groupBy: state.groupBy,
        sortRules: state.sortRules,
        savedFilters: state.savedFilters,
        columnConfig: state.columnConfig,
    }));

    // 动态获取备份路径
    const [backupFullPath, setBackupFullPath] = useState<string>('');

    useEffect(() => {
        const getBackupPath = async () => {
            try {
                const { appDataDir, join } = await import('@tauri-apps/api/path');
                const dataDir = await appDataDir();
                const customPath = settings.autoBackup?.customPath;
                const backupDir = customPath || await join(dataDir, 'auto_backups');
                setBackupFullPath(backupDir);
            } catch {
                setBackupFullPath('(无法获取路径)');
            }
        };
        getBackupPath();
    }, [settings.autoBackup?.customPath]);

    const handleExport = async () => {
        setIsProcessing(true);
        try {
            const filePath = await save({
                defaultPath: `任务备份_${new Date().toISOString().slice(0, 10)}.json`,
                filters: [{ name: 'JSON', extensions: ['json'] }],
            });

            if (!filePath) {
                setIsProcessing(false);
                return;
            }

            // 使用新的工具函数创建带校验和的备份数据
            const backupData = createBackupData({
                projects,
                tasks,
                settings,
                recurringTemplates,
                sortSchemes,
                dictionary,
                filters,
                groupBy,
                sortRules,
                savedFilters,
                columnConfig,
            });

            await writeTextFile(filePath, JSON.stringify(backupData, null, 2));
            setStatus('success');
            setMessage(`✅ 备份成功！\n\n📁 文件已保存到：\n${filePath}\n\n🔒 版本: ${BACKUP_VERSION}\n🔐 已添加完整性校验`);
        } catch (err) {
            setStatus('error');
            setMessage(`❌ 备份失败：${err instanceof Error ? err.message : String(err)}`);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleImport = async () => {
        setIsProcessing(true);
        setStatus('idle');
        setMessage('');

        try {
            const filePath = await openDialog({
                filters: [{ name: 'JSON', extensions: ['json'] }],
                multiple: false,
            });

            if (!filePath) {
                setIsProcessing(false);
                return;
            }

            const content = await readTextFile(filePath as string);

            // 使用新的验证函数
            const validation = validateBackupFile(content);

            if (!validation.valid) {
                setStatus('error');
                setMessage(`❌ ${validation.error}\n\n💡 ${getErrorMessage(validation.errorType)}`);
                setIsProcessing(false);
                return;
            }

            // 验证通过，准备自动备份当前数据
            setMessage('正在备份当前数据...');

            const autoBackup = await createAutoBackup({
                projects,
                tasks,
                settings,
                recurringTemplates,
                sortSchemes,
                dictionary,
                filters,
                groupBy,
                sortRules,
                savedFilters,
                columnConfig,
            });

            setAutoBackupPath(autoBackup);

            // 显示确认对话框
            setPendingRestore({
                data: validation.data!,
                preview: validation.preview!,
            });
            setConfirmOpen(true);
            setIsProcessing(false);
        } catch (err) {
            setStatus('error');
            setMessage(`❌ 读取文件失败：${err instanceof Error ? err.message : String(err)}`);
            setIsProcessing(false);
        }
    };

    const handleConfirmRestore = () => {
        if (!pendingRestore) return;

        setIsProcessing(true);
        setConfirmOpen(false);

        try {
            const backupData = pendingRestore.data;

            // 使用 setState 直接覆盖数据
            useAppStore.setState({
                projects: backupData.data.projects,
                tasks: backupData.data.tasks,
                settings: backupData.data.settings,
                recurringTemplates: backupData.data.recurringTemplates || [],
                sortSchemes: backupData.data.sortSchemes || [],
                dictionary: backupData.data.dictionary || {
                    onsiteOwners: [],
                    lineOwners: [],
                    tags: [],
                    autoAppend: true,
                },
                // 恢复筛选和视图配置（如果备份中包含）
                ...(backupData.data.filters && { filters: backupData.data.filters }),
                ...(backupData.data.groupBy !== undefined && { groupBy: backupData.data.groupBy }),
                ...(backupData.data.sortRules && { sortRules: backupData.data.sortRules }),
                ...(backupData.data.savedFilters && { savedFilters: backupData.data.savedFilters }),
                ...(backupData.data.columnConfig && { columnConfig: backupData.data.columnConfig }),
                notes: backupData.data.notes || [],
            });

            setStatus('success');
            let successMessage = `✅ 恢复成功！\n\n📊 已恢复：\n• ${pendingRestore.preview?.projectCount ?? 0} 个项目\n• ${pendingRestore.preview?.taskCount ?? 0} 条任务\n• ${pendingRestore.preview?.noteCount ?? 0} 条笔记`;

            if (autoBackupPath) {
                successMessage += `\n\n💾 原数据已自动备份到：\n${autoBackupPath}`;
            }

            setMessage(successMessage);
        } catch (err) {
            setStatus('error');
            setMessage(`❌ 恢复失败：${err instanceof Error ? err.message : String(err)}`);
        } finally {
            setIsProcessing(false);
            setPendingRestore(null);
        }
    };

    const handleCancelRestore = () => {
        setConfirmOpen(false);
        setPendingRestore(null);
        setAutoBackupPath(null);
        setStatus('idle');
        setMessage('');
    };

    const handleClose = () => {
        // 重置所有状态
        setStatus('idle');
        setMessage('');
        setConfirmOpen(false);
        setPendingRestore(null);
        setAutoBackupPath(null);
        onClose();
    };

    if (!open) return null;

    return (
        <>
            <div className='create-overlay' style={{ zIndex: 100 }} onClick={(e) => e.stopPropagation()}>
                <div
                    className='create-dialog'
                    style={{ width: 480 }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <header className='create-dialog-header'>
                        <div className='create-dialog-title-block'>
                            <div className='create-dialog-title'>数据备份与恢复</div>
                            <div className='create-dialog-subtitle'>
                                导出或导入您的数据（任务、笔记）v{BACKUP_VERSION}
                            </div>
                        </div>
                        <button
                            className='create-btn-icon'
                            onClick={handleClose}
                            title='关闭'
                            disabled={isProcessing}
                        >
                            ✕
                        </button>
                    </header>

                    <div className='create-dialog-body'>
                        <section className='create-section'>
                            <div className='backup-actions'>
                                <div className='backup-action-card'>
                                    <div className='backup-action-icon'>💾</div>
                                    <div className='backup-action-info'>
                                        <div className='backup-action-title'>导出备份</div>
                                        <div className='backup-action-desc'>
                                            将所有数据导出为 JSON 文件（含完整性校验）
                                        </div>
                                    </div>
                                    <button
                                        className='btn btn-primary'
                                        onClick={handleExport}
                                        disabled={isProcessing}
                                    >
                                        {isProcessing ? '导出中...' : '导出'}
                                    </button>
                                </div>

                                <div className='backup-action-card'>
                                    <div className='backup-action-icon'>📂</div>
                                    <div className='backup-action-info'>
                                        <div className='backup-action-title'>导入恢复</div>
                                        <div className='backup-action-desc'>
                                            从备份文件恢复数据（会自动备份当前数据）
                                        </div>
                                    </div>
                                    <button
                                        className='btn btn-secondary'
                                        onClick={handleImport}
                                        disabled={isProcessing}
                                    >
                                        {isProcessing ? '处理中...' : '导入'}
                                    </button>
                                </div>
                            </div>

                            <div className="backup-section-divider" style={{ margin: '24px 0', height: 1, background: 'var(--border-subtle)' }}></div>

                            <h3 className="backup-section-title" style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>定时自动备份</h3>
                            <div className="backup-settings" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                <div className="setting-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <span style={{ fontSize: 13 }}>启用自动备份</span>
                                    <label className="switch" style={{ position: 'relative', display: 'inline-block', width: 36, height: 20 }}>
                                        <input
                                            type="checkbox"
                                            checked={settings.autoBackup?.enabled ?? false}
                                            onChange={(e) => {
                                                useAppStore.setState(state => ({
                                                    settings: {
                                                        ...state.settings,
                                                        autoBackup: {
                                                            enabled: e.target.checked,
                                                            interval: state.settings.autoBackup?.interval || 30,
                                                            retentionCount: state.settings.autoBackup?.retentionCount || 20,
                                                            lastBackupAt: state.settings.autoBackup?.lastBackupAt
                                                        }
                                                    }
                                                }));
                                            }}
                                            style={{ opacity: 0, width: 0, height: 0 }}
                                        />
                                        <span className="slider round" style={{
                                            position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0,
                                            backgroundColor: settings.autoBackup?.enabled ? 'var(--primary)' : '#ccc',
                                            transition: '.4s', borderRadius: 34
                                        }}>
                                            <span style={{
                                                position: 'absolute', content: '""', height: 16, width: 16, left: settings.autoBackup?.enabled ? 18 : 2, bottom: 2,
                                                backgroundColor: 'white', transition: '.4s', borderRadius: '50%'
                                            }}></span>
                                        </span>
                                    </label>
                                </div>

                                {settings.autoBackup?.enabled && (
                                    <>
                                        <div className="setting-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <span style={{ fontSize: 13 }}>备份间隔 (分钟，最少5)</span>
                                            <input
                                                type="text"
                                                inputMode="numeric"
                                                defaultValue={settings.autoBackup?.interval || 60}
                                                onBlur={(e) => {
                                                    let val = parseInt(e.target.value) || 60;
                                                    if (val < 5) val = 5; // Min 5 min
                                                    if (val > 10080) val = 10080; // Max 1 week
                                                    e.target.value = String(val);
                                                    useAppStore.setState(state => ({
                                                        settings: {
                                                            ...state.settings,
                                                            autoBackup: {
                                                                ...state.settings.autoBackup!,
                                                                interval: val
                                                            }
                                                        }
                                                    }));
                                                }}
                                                className="filter-control"
                                                style={{ width: 80, textAlign: 'center' }}
                                            />
                                        </div>
                                        <div className="setting-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <span style={{ fontSize: 13 }}>保留最近份数</span>
                                            <input
                                                type="text"
                                                inputMode="numeric"
                                                defaultValue={settings.autoBackup?.retentionCount || 24}
                                                onBlur={(e) => {
                                                    let val = parseInt(e.target.value) || 24;
                                                    if (val < 1) val = 1;
                                                    if (val > 1000) val = 1000;
                                                    e.target.value = String(val);
                                                    useAppStore.setState(state => ({
                                                        settings: {
                                                            ...state.settings,
                                                            autoBackup: {
                                                                ...state.settings.autoBackup!,
                                                                retentionCount: val
                                                            }
                                                        }
                                                    }));
                                                }}
                                                className="filter-control"
                                                style={{ width: 80, textAlign: 'center' }}
                                            />
                                        </div>

                                        <div className="setting-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                <span style={{ fontSize: 13 }}>每日智能归档</span>
                                                <span style={{ fontSize: 11, color: 'var(--text-subtle)' }}>每天保留一份备份（30天）</span>
                                            </div>
                                            <label className="switch" style={{ position: 'relative', display: 'inline-block', width: 36, height: 20 }}>
                                                <input
                                                    type="checkbox"
                                                    checked={settings.autoBackup?.dailyBackup ?? true}
                                                    onChange={(e) => {
                                                        useAppStore.setState(state => ({
                                                            settings: {
                                                                ...state.settings,
                                                                autoBackup: {
                                                                    ...state.settings.autoBackup!,
                                                                    dailyBackup: e.target.checked
                                                                }
                                                            }
                                                        }));
                                                    }}
                                                    style={{ opacity: 0, width: 0, height: 0 }}
                                                />
                                                <span className="slider round" style={{
                                                    position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0,
                                                    backgroundColor: (settings.autoBackup?.dailyBackup ?? true) ? 'var(--primary)' : '#ccc',
                                                    transition: '.4s', borderRadius: 34
                                                }}>
                                                    <span style={{
                                                        position: 'absolute', content: '""', height: 16, width: 16,
                                                        left: (settings.autoBackup?.dailyBackup ?? true) ? 18 : 2, bottom: 2,
                                                        backgroundColor: 'white', transition: '.4s', borderRadius: '50%'
                                                    }}></span>
                                                </span>
                                            </label>
                                        </div>

                                        <div className="setting-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 }}>
                                            <span style={{ fontSize: 13 }}>备份目录</span>
                                            <button
                                                className="btn btn-secondary"
                                                style={{ padding: '4px 12px', fontSize: 12 }}
                                                onClick={async () => {
                                                    try {
                                                        const selected = await openDialog({
                                                            directory: true,
                                                            title: '选择备份目录'
                                                        });
                                                        if (selected && typeof selected === 'string') {
                                                            useAppStore.setState(state => ({
                                                                settings: {
                                                                    ...state.settings,
                                                                    autoBackup: {
                                                                        ...state.settings.autoBackup!,
                                                                        customPath: selected
                                                                    }
                                                                }
                                                            }));
                                                        }
                                                    } catch (err) {
                                                        console.error('选择目录失败:', err);
                                                    }
                                                }}
                                            >
                                                更改目录
                                            </button>
                                        </div>

                                        <div style={{ fontSize: 12, color: 'var(--text-subtle)', marginTop: 8, wordBreak: 'break-all' }}>
                                            * 备份保存位置：<br />
                                            <code style={{ background: 'var(--surface-alt)', padding: '2px 6px', borderRadius: 4, fontSize: 11 }}>
                                                {backupFullPath || '加载中...'}
                                            </code>
                                        </div>
                                    </>
                                )}
                            </div>

                            {status !== 'idle' && (
                                <div className={`backup-message ${status}`}>
                                    <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>
                                        {message}
                                    </pre>
                                </div>
                            )}
                        </section>
                    </div>

                    <footer className='create-dialog-footer'>
                        <div className='create-footer-meta'>
                            🔒 备份文件包含完整性校验，可检测文件损坏
                        </div>
                        <div className='create-footer-actions'>
                            <button
                                className='btn btn-primary'
                                onClick={handleClose}
                                disabled={isProcessing}
                            >
                                完成
                            </button>
                        </div>
                    </footer>
                </div>
            </div>

            {/* 确认恢复对话框 */}
            <ConfirmRestoreModal
                open={confirmOpen}
                onClose={handleCancelRestore}
                onConfirm={handleConfirmRestore}
                preview={pendingRestore?.preview ?? undefined}
                autoBackupPath={autoBackupPath}
                isProcessing={isProcessing}
            />
        </>
    );
};

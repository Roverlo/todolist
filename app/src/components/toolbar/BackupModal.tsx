import { useState } from 'react';
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
            });

            setStatus('success');
            let successMessage = `✅ 恢复成功！\n\n📊 已恢复：\n• ${pendingRestore.preview?.projectCount ?? 0} 个项目\n• ${pendingRestore.preview?.taskCount ?? 0} 条任务`;

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
            <div className='create-overlay'>
                <div
                    className='create-dialog'
                    style={{ width: 480 }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <header className='create-dialog-header'>
                        <div className='create-dialog-title-block'>
                            <div className='create-dialog-title'>数据备份与恢复</div>
                            <div className='create-dialog-subtitle'>
                                导出或导入您的任务数据（v{BACKUP_VERSION}）
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

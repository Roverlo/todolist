import { useState } from 'react';
import { useAppStoreShallow, useAppStore } from '../../state/appStore';
import { save, open as openDialog } from '@tauri-apps/plugin-dialog';
import { writeTextFile, readTextFile } from '@tauri-apps/plugin-fs';

interface BackupModalProps {
    open: boolean;
    onClose: () => void;
}

export const BackupModal = ({ open, onClose }: BackupModalProps) => {
    const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [message, setMessage] = useState('');

    const { projects, tasks, settings, recurringTemplates, sortSchemes, dictionary, filters, groupBy, sortRules, savedFilters, columnConfig } = useAppStoreShallow((state) => ({
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
        try {
            const filePath = await save({
                defaultPath: `任务备份_${new Date().toISOString().slice(0, 10)}.json`,
                filters: [{ name: 'JSON', extensions: ['json'] }],
            });

            if (!filePath) return;

            const backupData = {
                version: '1.1',
                exportedAt: new Date().toISOString(),
                data: {
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
                }
            };

            await writeTextFile(filePath, JSON.stringify(backupData, null, 2));
            setStatus('success');
            setMessage(`备份成功！文件已保存到：${filePath}`);
        } catch (err) {
            setStatus('error');
            setMessage(`备份失败：${err}`);
        }
    };

    const handleImport = async () => {
        try {
            const filePath = await openDialog({
                filters: [{ name: 'JSON', extensions: ['json'] }],
                multiple: false,
            });

            if (!filePath) return;

            const content = await readTextFile(filePath as string);
            const backupData = JSON.parse(content);

            if (!backupData.data || !backupData.data.projects || !backupData.data.tasks) {
                throw new Error('无效的备份文件格式');
            }

            // 使用 setState 直接覆盖数据
            useAppStore.setState({
                projects: backupData.data.projects,
                tasks: backupData.data.tasks,
                settings: backupData.data.settings || {},
                recurringTemplates: backupData.data.recurringTemplates || [],
                sortSchemes: backupData.data.sortSchemes || [],
                dictionary: backupData.data.dictionary || { onsiteOwners: [], lineOwners: [], tags: [], autoAppend: true },
                // 恢复筛选和视图配置（如果备份中包含）
                ...(backupData.data.filters && { filters: backupData.data.filters }),
                ...(backupData.data.groupBy !== undefined && { groupBy: backupData.data.groupBy }),
                ...(backupData.data.sortRules && { sortRules: backupData.data.sortRules }),
                ...(backupData.data.savedFilters && { savedFilters: backupData.data.savedFilters }),
                ...(backupData.data.columnConfig && { columnConfig: backupData.data.columnConfig }),
            });

            setStatus('success');
            setMessage('恢复成功！数据已导入。');
        } catch (err) {
            setStatus('error');
            setMessage(`恢复失败：${err}`);
        }
    };

    if (!open) return null;

    return (
        <div className='create-overlay'>
            <div className='create-dialog' style={{ width: 480 }} onClick={(e) => e.stopPropagation()}>
                <header className='create-dialog-header'>
                    <div className='create-dialog-title-block'>
                        <div className='create-dialog-title'>数据备份与恢复</div>
                        <div className='create-dialog-subtitle'>导出或导入您的任务数据</div>
                    </div>
                    <button className='create-btn-icon' onClick={onClose} title='关闭'>
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
                                    <div className='backup-action-desc'>将所有项目、任务、设置导出为 JSON 文件</div>
                                </div>
                                <button className='btn btn-primary' onClick={handleExport}>
                                    导出
                                </button>
                            </div>

                            <div className='backup-action-card'>
                                <div className='backup-action-icon'>📂</div>
                                <div className='backup-action-info'>
                                    <div className='backup-action-title'>导入恢复</div>
                                    <div className='backup-action-desc'>从备份文件恢复数据（将覆盖当前数据）</div>
                                </div>
                                <button className='btn btn-secondary' onClick={handleImport}>
                                    导入
                                </button>
                            </div>
                        </div>

                        {status !== 'idle' && (
                            <div className={`backup-message ${status}`}>
                                {message}
                            </div>
                        )}
                    </section>
                </div>

                <footer className='create-dialog-footer'>
                    <div className='create-footer-meta'>备份文件包含所有项目、任务和设置</div>
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

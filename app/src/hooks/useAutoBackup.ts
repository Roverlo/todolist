import { useEffect, useRef } from 'react';
import { useAppStoreShallow } from '../state/appStore';
import { createAutoBackup } from '../utils/backupUtils';

/**
 * 定时自动备份 Hook (重构版)
 * 根据设置的间隔时间（分钟）自动执行备份
 */
export const useAutoBackup = () => {
    const { settings, projects, tasks, recurringTemplates, sortSchemes, dictionary, filters, groupBy, sortRules, savedFilters, columnConfig, setSettings } = useAppStoreShallow((state) => ({
        settings: state.settings,
        projects: state.projects,
        tasks: state.tasks,
        recurringTemplates: state.recurringTemplates,
        sortSchemes: state.sortSchemes,
        dictionary: state.dictionary,
        filters: state.filters,
        groupBy: state.groupBy,
        sortRules: state.sortRules,
        savedFilters: state.savedFilters,
        columnConfig: state.columnConfig,
        setSettings: state.setSettings,
    }));

    const isBackingUp = useRef(false);

    useEffect(() => {
        const checkAndBackup = async () => {
            const autoBackup = settings.autoBackup;

            // 1. 检查开关
            if (!autoBackup?.enabled || isBackingUp.current) {
                return;
            }

            const now = new Date();
            const lastBackupTime = autoBackup.lastBackupAt ? new Date(autoBackup.lastBackupAt).getTime() : 0;
            const intervalMs = (autoBackup.interval || 30) * 60 * 1000; // 默认30分钟

            // 2. 检查时间间隔
            if (now.getTime() - lastBackupTime < intervalMs) {
                return;
            }

            // 3. 执行备份
            isBackingUp.current = true;
            try {
                // 执行备份 (createAutoBackup 内部负责写入文件)
                // 注意：createAutoBackup 返回的是备份文件路径，但我们这里不需要
                await createAutoBackup({
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
                }, autoBackup.retentionCount || 20); // 默认保留20份

                console.log(`[AutoBackup] Backup scheduled successfully at ${now.toISOString()}`);

                // 4. 更新最后备份时间
                setSettings({
                    autoBackup: {
                        ...autoBackup,
                        lastBackupAt: now.toISOString(),
                    },
                });

            } catch (err) {
                console.error('[AutoBackup] Scheduled backup failed:', err);
            } finally {
                isBackingUp.current = false;
            }
        };

        // 每60秒检查一次
        const timer = setInterval(checkAndBackup, 60 * 1000);

        // 挂载后延迟5秒执行一次首次检查
        const initialTimer = setTimeout(checkAndBackup, 5000);

        return () => {
            clearInterval(timer);
            clearTimeout(initialTimer);
        };
    }, [
        // 依赖项: 仅在配置变更或数据变更时更新 effect (其实主要靠定时器)
        // 注意：将所有数据放入依赖会导致每次数据变化都重置定时器，但这通常是可以接受的
        // 为避免过于频繁的重置，我们可以减少依赖，但为了闭包中能获取最新数据，必须包含数据依赖
        settings, projects, tasks, recurringTemplates, sortSchemes, dictionary, filters, groupBy, sortRules, savedFilters, columnConfig, setSettings
    ]);
};

export default useAutoBackup;

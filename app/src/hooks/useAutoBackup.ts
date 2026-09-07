import { useEffect, useRef } from 'react';
import { useAppStoreShallow, useAppStore } from '../state/appStore';
import { createAutoBackup } from '../utils/backupUtils';

/**
 * 定时自动备份 Hook (重构版)
 * 根据设置的间隔时间（分钟）自动执行备份
 */
export const useAutoBackup = () => {
    const { settings, setSettings } = useAppStoreShallow((state) => ({
        settings: state.settings,
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
                // 备份执行时读取完整的最新数据，包含随记和标签。
                const path = await createAutoBackup(useAppStore.getState(), autoBackup.retentionCount || 20);
                if (!path) return;

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
        settings, setSettings
    ]);
};

export default useAutoBackup;

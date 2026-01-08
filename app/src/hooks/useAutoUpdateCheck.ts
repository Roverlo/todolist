import { useEffect, useRef, useState, useCallback } from 'react';
import { useAppStoreShallow } from '../state/appStore';
import { checkForUpdate, type UpdateInfo } from '../utils/updateChecker';

/**
 * 自动更新检查 Hook
 * 支持启动时检查和定时检查
 */
export const useAutoUpdateCheck = () => {
    const { settings, setSettings } = useAppStoreShallow((state) => ({
        settings: state.settings,
        setSettings: state.setSettings,
    }));

    const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
    const [showUpdateModal, setShowUpdateModal] = useState(false);
    const isChecking = useRef(false);
    const hasCheckedOnStartup = useRef(false);

    // 执行检查的核心函数
    const performCheck = useCallback(async (isStartupCheck = false) => {
        if (isChecking.current) return;

        isChecking.current = true;
        try {
            const result = await checkForUpdate();

            if (result.hasUpdate && result.updateInfo) {
                const skipVersion = settings.updateCheck?.skipVersion;
                // 如果用户选择跳过此版本，则不提示
                if (result.updateInfo.version !== skipVersion) {
                    setUpdateInfo(result.updateInfo);
                    setShowUpdateModal(true);
                }
            }

            // 更新最后检查时间
            setSettings({
                updateCheck: {
                    ...settings.updateCheck,
                    checkOnStartup: settings.updateCheck?.checkOnStartup ?? true,
                    autoCheck: settings.updateCheck?.autoCheck ?? true,
                    checkInterval: settings.updateCheck?.checkInterval ?? 60,
                    lastCheckAt: new Date().toISOString(),
                },
            });

            if (!isStartupCheck) {
                console.log(`[UpdateCheck] 定时检查完成: ${new Date().toLocaleString()}`);
            }
        } catch (err) {
            console.error('[UpdateCheck] 检查失败:', err);
        } finally {
            isChecking.current = false;
        }
    }, [settings, setSettings]);

    // 跳过当前版本
    const skipCurrentVersion = useCallback((version: string) => {
        setSettings({
            updateCheck: {
                ...settings.updateCheck,
                checkOnStartup: settings.updateCheck?.checkOnStartup ?? true,
                autoCheck: settings.updateCheck?.autoCheck ?? true,
                checkInterval: settings.updateCheck?.checkInterval ?? 60,
                skipVersion: version,
            },
        });
        setShowUpdateModal(false);
    }, [settings, setSettings]);

    // 启动时检查（仅执行一次）
    useEffect(() => {
        if (hasCheckedOnStartup.current) return;
        if (!settings.updateCheck?.checkOnStartup) return;

        hasCheckedOnStartup.current = true;

        // 延迟 3 秒后执行启动检查，避免影响启动速度
        const timer = setTimeout(() => {
            console.log('[UpdateCheck] 执行启动时检查...');
            performCheck(true);
        }, 3000);

        return () => clearTimeout(timer);
    }, [settings.updateCheck?.checkOnStartup, performCheck]);

    // 定时检查
    useEffect(() => {
        if (!settings.updateCheck?.autoCheck) return;

        const intervalMs = (settings.updateCheck.checkInterval || 60) * 60 * 1000;

        console.log(`[UpdateCheck] 定时检查已启用，间隔: ${settings.updateCheck.checkInterval || 60} 分钟`);

        const timer = setInterval(() => {
            performCheck(false);
        }, intervalMs);

        return () => clearInterval(timer);
    }, [settings.updateCheck?.autoCheck, settings.updateCheck?.checkInterval, performCheck]);

    return {
        updateInfo,
        showUpdateModal,
        setShowUpdateModal,
        skipCurrentVersion,
        performCheck,
    };
};

export default useAutoUpdateCheck;

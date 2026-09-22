import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppStore, useAppStoreShallow } from '../state/appStore';
import { checkForUpdate, CURRENT_VERSION, DEFAULT_UPDATE_SERVER, type UpdateInfo } from '../utils/updateChecker';
import { setUpdatePreferences } from '../utils/updatePreferences';

export const useAutoUpdateCheck = () => {
    const { config, hydrated } = useAppStoreShallow(state => ({ config: state.settings.updateCheck, hydrated: state._hasHydrated }));
    const serverUrl = config?.serverUrl ?? DEFAULT_UPDATE_SERVER;
    const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
    const [showUpdateModal, setShowUpdateModal] = useState(false);
    const request = useRef<AbortController | null>(null);
    const hasCheckedOnStartup = useRef(false);
    const performCheck = useCallback(async () => {
        if (request.current && !request.current.signal.aborted) return;
        const controller = new AbortController();
        request.current = controller;
        try {
            const result = await checkForUpdate(CURRENT_VERSION, serverUrl, controller.signal);
            if (controller.signal.aborted || result.error) return;
            const current = useAppStore.getState().settings.updateCheck;
            if ((current?.serverUrl ?? DEFAULT_UPDATE_SERVER) !== serverUrl) return;
            if (result.updateInfo && result.updateInfo.version !== current?.skipVersion) {
                setUpdateInfo(result.updateInfo);
                setShowUpdateModal(true);
            }
            setUpdatePreferences({ lastCheckAt: new Date().toISOString() });
        } finally {
            if (request.current === controller) request.current = null;
        }
    }, [serverUrl]);

    useEffect(() => {
        setUpdateInfo(null);
        setShowUpdateModal(false);
        return () => request.current?.abort();
    }, [serverUrl]);

    useEffect(() => {
        if (!hydrated || hasCheckedOnStartup.current || !(config?.checkOnStartup ?? true)) return;
        const timer = setTimeout(() => {
            hasCheckedOnStartup.current = true;
            void performCheck();
        }, 3000);
        return () => clearTimeout(timer);
    }, [hydrated, config?.checkOnStartup, performCheck]);

    useEffect(() => {
        if (!hydrated || !(config?.autoCheck ?? true)) return;
        const minutes = config?.checkInterval ?? 60;
        const timer = setInterval(() => void performCheck(), Math.max(10, Number.isFinite(minutes) ? minutes : 60) * 60000);
        return () => clearInterval(timer);
    }, [hydrated, config?.autoCheck, config?.checkInterval, performCheck]);

    const skipCurrentVersion = useCallback((version: string) => {
        setUpdatePreferences({ skipVersion: version });
        setShowUpdateModal(false);
    }, []);

    return { updateInfo, showUpdateModal, setShowUpdateModal, skipCurrentVersion, performCheck };
};

export default useAutoUpdateCheck;

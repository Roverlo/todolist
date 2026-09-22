import { useAppStore } from '../state/appStore';
import type { UpdateCheckConfig } from '../types';

// Read at commit time so a completed network request cannot restore stale settings.
export function setUpdatePreferences(patch: Partial<UpdateCheckConfig>) {
    const state = useAppStore.getState();
    state.setSettings({ updateCheck: {
        checkOnStartup: true, autoCheck: true, checkInterval: 60,
        ...state.settings.updateCheck, ...patch,
    } });
}

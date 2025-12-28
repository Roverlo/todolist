/**
 * 版本更新检测工具
 * 支持多版本列表
 */
import { fetch } from '@tauri-apps/plugin-http';

export interface UpdateInfo {
    version: string;
    releaseDate: string;
    downloadUrl: string;
    releaseNotes: string;
    mandatory: boolean;
}

export interface VersionsInfo {
    latest: string;
    versions: UpdateInfo[];
}

const UPDATE_URL = 'https://update.xiaohulp.sbs/versions.json';

/**
 * 当前应用版本号
 * 格式: YYYYMMDD_HHmm
 */
export const CURRENT_VERSION = '20251228_1816';

/**
 * 检查更新（只检查最新版本）
 * @param currentVersion 当前版本号
 * @returns 如果有更新返回 UpdateInfo，否则返回 null
 */
export async function checkForUpdate(currentVersion: string = CURRENT_VERSION): Promise<{
    hasUpdate: boolean;
    updateInfo: UpdateInfo | null;
    error: string | null;
}> {
    try {
        const result = await getAllVersions();

        if (result.error) {
            return {
                hasUpdate: false,
                updateInfo: null,
                error: result.error,
            };
        }

        if (!result.versionsInfo) {
            return {
                hasUpdate: false,
                updateInfo: null,
                error: '无法获取版本信息',
            };
        }

        const { latest, versions } = result.versionsInfo;

        // 版本号格式为 YYYYMMDD_HHmm，可直接字符串比较
        if (latest > currentVersion) {
            const latestInfo = versions.find(v => v.version === latest);
            return {
                hasUpdate: true,
                updateInfo: latestInfo || null,
                error: null,
            };
        }

        return {
            hasUpdate: false,
            updateInfo: null,
            error: null,
        };
    } catch (error) {
        console.error('检查更新失败:', error);
        return {
            hasUpdate: false,
            updateInfo: null,
            error: error instanceof Error ? error.message : '网络错误',
        };
    }
}

/**
 * 获取所有可用版本列表
 */
export async function getAllVersions(): Promise<{
    versionsInfo: VersionsInfo | null;
    error: string | null;
}> {
    try {
        const response = await fetch(UPDATE_URL, {
            cache: 'no-store',
            headers: {
                'Cache-Control': 'no-cache',
            },
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data: VersionsInfo = await response.json();

        return {
            versionsInfo: data,
            error: null,
        };
    } catch (error) {
        console.error('获取版本列表失败:', error);
        return {
            versionsInfo: null,
            error: error instanceof Error ? error.message : '网络错误',
        };
    }
}

/**
 * 打开下载链接
 */
export async function openDownloadUrl(url: string): Promise<void> {
    try {
        const { open } = await import('@tauri-apps/plugin-shell');
        await open(url);
    } catch (error) {
        console.error('打开链接失败:', error);
        // 降级到 window.open
        window.open(url, '_blank');
    }
}

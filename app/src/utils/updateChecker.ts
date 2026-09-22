import { isTauri } from '@tauri-apps/api/core';
import { fetch as nativeFetch } from '@tauri-apps/plugin-http';

export interface UpdateInfo {
    version: string;
    releaseDate: string;
    downloadUrl: string;
    releaseNotes: string;
    mandatory: boolean;
    sha256?: string;
    size?: number;
    sourceCommit?: string;
}

export interface VersionsInfo {
    latest: string;
    versions: UpdateInfo[];
}

export const DEFAULT_UPDATE_SERVER = 'https://projecttodo.188-255-156-112.sslip.io';
export const CURRENT_VERSION = import.meta.env.VITE_BUILD_VERSION;
export const BUILD_TIME = import.meta.env.VITE_BUILD_TIME;
const VERSION_PATTERN = /^\d{8}_\d{4}$/;

export function normalizeUpdateServer(value: string): string {
    let url: URL;
    try { url = new URL(value.trim()); } catch { throw new Error('请输入完整的 HTTP 或 HTTPS 服务器地址'); }
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
        throw new Error('地址须使用 HTTP 或 HTTPS，且不能包含账号、密码、查询参数或片段');
    }
    url.pathname = url.pathname.replace(/\/versions\.json\/?$/, '').replace(/\/+$/, '');
    return url.toString().replace(/\/+$/, '');
}

function downloadAddress(value: string, base?: string): string {
    const url = new URL(value, base);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) {
        throw new Error('版本清单包含无效的下载地址');
    }
    return url.toString();
}

export function parseVersions(data: unknown, serverUrl: string): VersionsInfo {
    const invalid = () => new Error('版本清单格式不正确，请确认服务器提供有效的 versions.json');
    if (!data || typeof data !== 'object') throw invalid();
    const source = data as Record<string, unknown>;
    if (typeof source.latest !== 'string' || !Array.isArray(source.versions)) throw invalid();
    const versions = source.versions.map((item: unknown): UpdateInfo => {
        if (!item || typeof item !== 'object') throw invalid();
        const value = item as Record<string, unknown>;
        if (typeof value.version !== 'string' || !VERSION_PATTERN.test(value.version)
            || typeof value.releaseDate !== 'string' || typeof value.downloadUrl !== 'string'
            || !value.downloadUrl.trim() || typeof value.releaseNotes !== 'string'
            || typeof value.mandatory !== 'boolean') throw invalid();
        if (value.sha256 !== undefined && (typeof value.sha256 !== 'string' || !/^[a-f\d]{64}$/i.test(value.sha256))) throw invalid();
        if (value.size !== undefined && (typeof value.size !== 'number' || !Number.isSafeInteger(value.size) || value.size <= 0)) throw invalid();
        return { version: value.version, releaseDate: value.releaseDate,
            downloadUrl: downloadAddress(value.downloadUrl, serverUrl + '/'),
            releaseNotes: value.releaseNotes, mandatory: value.mandatory,
            sha256: value.sha256 as string | undefined, size: value.size as number | undefined,
            sourceCommit: typeof value.sourceCommit === 'string' ? value.sourceCommit : undefined };
    }).sort((a, b) => b.version.localeCompare(a.version));
    if (new Set(versions.map(v => v.version)).size !== versions.length
        || (versions.length ? source.latest !== versions[0].version : source.latest !== '')) throw invalid();
    return { latest: source.latest, versions };
}

export async function getAllVersions(serverUrl = DEFAULT_UPDATE_SERVER, signal?: AbortSignal): Promise<{
    versionsInfo: VersionsInfo | null; error: string | null;
}> {
    const controller = new AbortController();
    let timedOut = false;
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 10000);
    try {
        const server = normalizeUpdateServer(serverUrl);
        const response = await (isTauri() ? nativeFetch : globalThis.fetch)(server + '/versions.json', {
            cache: 'no-store', signal: controller.signal,
        });
        if (!response.ok) throw new Error(`服务器返回 HTTP ${response.status}`);
        let data: unknown;
        try { data = await response.json(); } catch { throw new Error('服务器未返回有效的 JSON 版本清单'); }
        return { versionsInfo: parseVersions(data, server), error: null };
    } catch (error) {
        return { versionsInfo: null, error: timedOut ? '连接超时，请检查地址或网络后重试'
            : signal?.aborted ? '检查已取消'
            : error instanceof Error && /^(请输入|地址须|版本清单|服务器)/.test(error.message)
                ? error.message : '无法连接更新服务器，请检查地址或网络后重试' };
    } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
    }
}

export async function checkForUpdate(currentVersion = CURRENT_VERSION, serverUrl = DEFAULT_UPDATE_SERVER, signal?: AbortSignal) {
    const { versionsInfo, error } = await getAllVersions(serverUrl, signal);
    const updateInfo = versionsInfo && versionsInfo.latest > currentVersion ? versionsInfo.versions[0] ?? null : null;
    return { hasUpdate: !!updateInfo, updateInfo, error };
}

export async function openDownloadUrl(url: string): Promise<void> {
    const address = downloadAddress(url);
    if (isTauri()) {
        const { open } = await import('@tauri-apps/plugin-shell');
        await open(address);
    } else {
        window.open(address, '_blank', 'noopener,noreferrer');
    }
}

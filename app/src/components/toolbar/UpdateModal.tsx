import { useCallback, useEffect, useRef, useState } from 'react';
import { Channel, invoke, isTauri } from '@tauri-apps/api/core';
import { ArrowRight, Download, RefreshCw, X } from 'lucide-react';
import { useAppStore, waitForAppSave } from '../../state/appStore';
import { CURRENT_VERSION, DEFAULT_UPDATE_SERVER, openDownloadUrl, type UpdateInfo } from '../../utils/updateChecker';
import './UpdateModal.css';

interface UpdateModalProps {
    open: boolean;
    onClose: () => void;
    updateInfo: UpdateInfo;
    serverUrl?: string;
    onSkip?: () => void;
}
type Progress = { phase: 'downloading' | 'verifying'; received: number; total: number };

export const UpdateModal = ({ open, onClose, updateInfo, serverUrl, onSkip }: UpdateModalProps) => {
    const configuredServer = useAppStore(state => state.settings.updateCheck?.serverUrl);
    const [phase, setPhase] = useState<'idle' | 'downloading' | 'verifying' | 'ready' | 'installing'>('idle');
    const [progress, setProgress] = useState<Progress | null>(null);
    const [error, setError] = useState('');
    const [cancelling, setCancelling] = useState(false);
    const dialog = useRef<HTMLDivElement>(null);
    const mounted = useRef(true);
    const preparing = useRef(false);
    const cancelled = useRef(false);
    const installing = useRef(false);
    const close = useCallback(() => { if (!preparing.current && !installing.current) onClose(); }, [onClose]);
    useEffect(() => {
        mounted.current = true;
        const previous = document.activeElement as HTMLElement | null;
        dialog.current?.focus();
        return () => {
            mounted.current = false;
            if (isTauri() && !installing.current) void invoke('cancel_portable_update');
            previous?.focus();
        };
    }, []);
    useEffect(() => {
        const key = (event: KeyboardEvent) => {
            if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); close(); }
            if (event.key !== 'Tab') return;
            const buttons = dialog.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
            if (!buttons?.length) return;
            const first = buttons[0], last = buttons[buttons.length - 1];
            if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        };
        window.addEventListener('keydown', key, true);
        return () => window.removeEventListener('keydown', key, true);
    }, [close]);

    if (!open) return null;
    const native = isTauri();
    const hasChecksum = /^[0-9a-f]{64}$/i.test(updateInfo.sha256 ?? '') && (updateInfo.size ?? 0) >= 512;
    const downloading = phase === 'downloading' || phase === 'verifying';
    const download = async () => {
        if (preparing.current) return;
        preparing.current = true; cancelled.current = false;
        setPhase('downloading'); setError(''); setProgress(null);
        const channel = new Channel<Progress>();
        channel.onmessage = value => { if (mounted.current) { setProgress(value); setPhase(value.phase); } };
        try {
            await invoke('prepare_portable_update', { serverUrl: serverUrl ?? configuredServer ?? DEFAULT_UPDATE_SERVER, version: updateInfo.version, progress: channel });
            if (mounted.current) { setPhase(cancelled.current ? 'idle' : 'ready'); if (cancelled.current) setError('更新下载已取消'); }
        } catch (failure) {
            if (mounted.current) { setError(String(failure)); setPhase('idle'); }
        } finally { preparing.current = false; if (mounted.current) setCancelling(false); }
    };
    const install = async () => {
        if (installing.current) return;
        installing.current = true; setPhase('installing'); setError('');
        try {
            if (!useAppStore.getState()._hasHydrated) throw new Error('数据尚未加载完成，请稍后重试');
            if (!window.dispatchEvent(new Event('projecttodo-save-before-update', { cancelable: true }))) throw new Error('当前随记保存失败，更新未执行');
            useAppStore.setState({}); // Persist a fresh full snapshot, including the editor's last keystroke.
            await waitForAppSave();
            await invoke('install_portable_update');
        } catch (failure) {
            installing.current = false;
            if (mounted.current) { setError(`未重启更新：${String(failure)}`); setPhase('ready'); }
        }
    };
    return <div className="create-overlay" onClick={close}>
        <div ref={dialog} className="create-dialog portable-update-dialog" role="dialog" aria-modal="true" aria-label="软件更新" tabIndex={-1} onClick={event => event.stopPropagation()}>
            <header className="create-dialog-header"><div className="create-dialog-title">发现新版本！</div>
                <button className="create-btn-icon" title="关闭" aria-label="关闭" disabled={downloading || phase === 'installing'} onClick={close}><X size={18} /></button>
            </header>
            <div className="portable-update-body">
                <div className="portable-update-versions"><div><small>当前版本</small><strong>{CURRENT_VERSION}</strong></div><ArrowRight size={20} aria-hidden="true" /><div><small>最新版本</small><strong>{updateInfo.version}</strong></div></div>
                <div className="portable-update-date">发布于 {updateInfo.releaseDate}</div>
                <div className="portable-update-notes">{updateInfo.releaseNotes || '暂无更新说明'}</div>
                <p className="portable-update-hint">免安装版也可直接更新。保存数据并重启后，自动替换当前程序，保留原文件名和升级前备份。</p>
                {!native && <p className="portable-update-hint">当前为浏览器预览，应用内更新请在 Windows 桌面版操作。</p>}
                {!hasChecksum && <p className="portable-update-hint">此版本尚未提供完整校验信息，请手动下载，或联系发布者补全清单。</p>}
                {(downloading || phase === 'ready' || phase === 'installing') && <div className="portable-update-progress" role="status">
                    <span>{cancelling ? '正在取消…' : phase === 'verifying' ? '正在校验更新文件…' : phase === 'ready' ? '下载完成，校验通过' : phase === 'installing' ? '正在保存数据，准备重启…' : '正在下载更新…'}</span>
                    <progress aria-label="更新下载进度" max={progress?.total || 1} value={phase === 'ready' || phase === 'installing' ? progress?.total || 1 : progress?.received} />
                    {progress && <small>{(progress.received / 1048576).toFixed(1)} / {(progress.total / 1048576).toFixed(1)} MB</small>}
                </div>}
                {error && <p className="portable-update-error" role="alert">{error}</p>}
                <div className="portable-update-actions">
                    {downloading ? <button disabled={cancelling} onClick={() => { cancelled.current = true; setCancelling(true); void invoke('cancel_portable_update').catch(failure => { setError(String(failure)); setCancelling(false); }); }}>取消下载</button>
                        : <button disabled={phase === 'installing'} onClick={close}>{phase === 'ready' ? '暂不更新' : '稍后提醒'}</button>}
                    <button className="portable-update-primary" disabled={!native || !hasChecksum || downloading || phase === 'installing'} onClick={() => void (phase === 'ready' ? install() : download())}>
                        {phase === 'ready' || phase === 'installing' ? <RefreshCw size={16} /> : <Download size={16} />}{phase === 'ready' ? '重启更新' : phase === 'installing' ? '准备重启…' : '下载更新'}
                    </button>
                </div>
                {phase === 'idle' && <div className="portable-update-links">
                    {onSkip && <button onClick={onSkip}>跳过此版本</button>}
                    {(!native || !hasChecksum) && <button onClick={() => void openDownloadUrl(updateInfo.downloadUrl).catch(() => setError('无法打开下载链接，请检查默认浏览器'))}>手动下载</button>}
                </div>}
            </div>
        </div>
    </div>;
};

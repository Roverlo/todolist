import type { UpdateInfo } from '../../utils/updateChecker';
import { CURRENT_VERSION, openDownloadUrl } from '../../utils/updateChecker';

interface UpdateModalProps {
    open: boolean;
    onClose: () => void;
    updateInfo: UpdateInfo;
}

export const UpdateModal = ({ open, onClose, updateInfo }: UpdateModalProps) => {
    if (!open) return null;

    const handleDownload = () => {
        openDownloadUrl(updateInfo.downloadUrl);
        onClose();
    };

    return (
        <div className="create-overlay" onClick={onClose}>
            <div
                className="create-dialog"
                style={{ width: 420, maxWidth: '90vw' }}
                onClick={(e) => e.stopPropagation()}
            >
                <header className="create-dialog-header">
                    <div className="create-dialog-title-block">
                        <div className="create-dialog-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span>🎉</span>
                            <span>发现新版本！</span>
                        </div>
                    </div>
                    <button className="create-btn-icon" onClick={onClose} title="关闭">
                        ✕
                    </button>
                </header>

                <div className="create-dialog-body" style={{ padding: '20px 24px' }}>
                    {/* 版本对比 */}
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 16,
                            padding: '16px',
                            background: 'var(--bg)',
                            borderRadius: 12,
                            marginBottom: 20,
                        }}
                    >
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 12, color: 'var(--text-subtle)', marginBottom: 4 }}>当前版本</div>
                            <div style={{ fontSize: 16, fontWeight: 600, fontFamily: 'monospace', color: 'var(--text-main)' }}>
                                {CURRENT_VERSION}
                            </div>
                        </div>
                        <div style={{ fontSize: 24, color: 'var(--primary)' }}>→</div>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 12, color: 'var(--text-subtle)', marginBottom: 4 }}>最新版本</div>
                            <div style={{ fontSize: 16, fontWeight: 600, fontFamily: 'monospace', color: 'var(--primary)' }}>
                                {updateInfo.version}
                            </div>
                        </div>
                    </div>

                    {/* 更新日志 */}
                    <div style={{ marginBottom: 20 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-main)', marginBottom: 8 }}>
                            更新内容
                        </div>
                        <div
                            style={{
                                padding: '12px 16px',
                                background: 'var(--surface)',
                                border: '1px solid var(--border)',
                                borderRadius: 8,
                                fontSize: 13,
                                color: 'var(--text-main)',
                                lineHeight: 1.6,
                                whiteSpace: 'pre-wrap',
                                maxHeight: 150,
                                overflowY: 'auto',
                            }}
                        >
                            {updateInfo.releaseNotes || '暂无更新说明'}
                        </div>
                    </div>

                    {/* 发布日期 */}
                    <div style={{ fontSize: 12, color: 'var(--text-subtle)', marginBottom: 12 }}>
                        发布于 {updateInfo.releaseDate}
                    </div>

                    {/* 便携版更新说明 */}
                    <div
                        style={{
                            padding: '10px 12px',
                            background: 'rgba(59, 130, 246, 0.08)',
                            borderRadius: 8,
                            border: '1px dashed rgba(59, 130, 246, 0.3)',
                            marginBottom: 20,
                        }}
                    >
                        <div style={{ fontSize: 11, color: 'var(--text-subtle)', lineHeight: 1.6 }}>
                            <div style={{ fontWeight: 600, marginBottom: 4 }}>💡 便携版更新说明</div>
                            <div>本软件为便携版，无需安装。点击下载后，用新文件替换当前 exe 即可完成更新，您的数据会自动保留。</div>
                        </div>
                    </div>

                    {/* 按钮区 */}
                    <div style={{ display: 'flex', gap: 12 }}>
                        <button
                            onClick={onClose}
                            style={{
                                flex: 1,
                                padding: '12px 16px',
                                border: '1px solid var(--border)',
                                borderRadius: 8,
                                background: 'var(--surface)',
                                color: 'var(--text-main)',
                                fontSize: 14,
                                fontWeight: 500,
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.borderColor = 'var(--primary)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.borderColor = 'var(--border)';
                            }}
                        >
                            稍后提醒
                        </button>
                        <button
                            onClick={handleDownload}
                            style={{
                                flex: 1,
                                padding: '12px 16px',
                                border: 'none',
                                borderRadius: 8,
                                background: 'var(--primary)',
                                color: 'white',
                                fontSize: 14,
                                fontWeight: 500,
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 6,
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.opacity = '0.9';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.opacity = '1';
                            }}
                        >
                            <span>⬇️</span>
                            <span>立即下载</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

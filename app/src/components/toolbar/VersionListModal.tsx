import { useState, useEffect } from 'react';
import type { UpdateInfo, VersionsInfo } from '../../utils/updateChecker';
import { CURRENT_VERSION, getAllVersions, openDownloadUrl } from '../../utils/updateChecker';

interface VersionListModalProps {
    open: boolean;
    onClose: () => void;
}

export const VersionListModal = ({ open, onClose }: VersionListModalProps) => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [versionsInfo, setVersionsInfo] = useState<VersionsInfo | null>(null);

    useEffect(() => {
        if (open) {
            loadVersions();
        }
    }, [open]);

    const loadVersions = async () => {
        setLoading(true);
        setError(null);

        const result = await getAllVersions();

        if (result.error) {
            setError(result.error);
        } else {
            setVersionsInfo(result.versionsInfo);
        }

        setLoading(false);
    };

    if (!open) return null;

    const handleDownload = (version: UpdateInfo) => {
        openDownloadUrl(version.downloadUrl);
    };

    return (
        <div className="create-overlay" onClick={onClose}>
            <div
                className="create-dialog"
                style={{ width: 520, maxWidth: '90vw', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}
                onClick={(e) => e.stopPropagation()}
            >
                <header className="create-dialog-header">
                    <div className="create-dialog-title-block">
                        <div className="create-dialog-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span>📦</span>
                            <span>所有版本</span>
                        </div>
                        <div className="create-dialog-subtitle">选择要下载的版本</div>
                    </div>
                    <button className="create-btn-icon" onClick={onClose} title="关闭">
                        ✕
                    </button>
                </header>

                <div className="create-dialog-body" style={{ padding: '16px 24px', flex: 1, overflowY: 'auto' }}>
                    {loading && (
                        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-subtle)' }}>
                            <div style={{ fontSize: 24, marginBottom: 8 }}>⏳</div>
                            <div>加载中...</div>
                        </div>
                    )}

                    {error && (
                        <div style={{
                            textAlign: 'center',
                            padding: 40,
                            color: 'var(--danger)',
                            background: 'rgba(239, 68, 68, 0.1)',
                            borderRadius: 12,
                        }}>
                            <div style={{ fontSize: 24, marginBottom: 8 }}>❌</div>
                            <div>获取版本列表失败</div>
                            <div style={{ fontSize: 12, marginTop: 4 }}>{error}</div>
                            <button
                                onClick={loadVersions}
                                style={{
                                    marginTop: 12,
                                    padding: '8px 16px',
                                    border: '1px solid var(--danger)',
                                    borderRadius: 6,
                                    background: 'transparent',
                                    color: 'var(--danger)',
                                    cursor: 'pointer',
                                }}
                            >
                                重试
                            </button>
                        </div>
                    )}

                    {versionsInfo && !loading && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {versionsInfo.versions.map((version) => {
                                const isCurrent = version.version === CURRENT_VERSION;
                                const isLatest = version.version === versionsInfo.latest;

                                return (
                                    <div
                                        key={version.version}
                                        style={{
                                            padding: 16,
                                            background: isCurrent ? 'var(--primary-bg)' : 'var(--surface)',
                                            border: `1px solid ${isCurrent ? 'var(--primary)' : 'var(--border)'}`,
                                            borderRadius: 12,
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <span style={{
                                                    fontSize: 16,
                                                    fontWeight: 600,
                                                    fontFamily: 'monospace',
                                                    color: isCurrent ? 'var(--primary)' : 'var(--text-main)',
                                                }}>
                                                    {version.version}
                                                </span>
                                                {isCurrent && (
                                                    <span style={{
                                                        fontSize: 10,
                                                        padding: '2px 6px',
                                                        background: 'var(--primary)',
                                                        color: 'white',
                                                        borderRadius: 4,
                                                        fontWeight: 600,
                                                    }}>
                                                        当前
                                                    </span>
                                                )}
                                                {isLatest && !isCurrent && (
                                                    <span style={{
                                                        fontSize: 10,
                                                        padding: '2px 6px',
                                                        background: 'var(--success)',
                                                        color: 'white',
                                                        borderRadius: 4,
                                                        fontWeight: 600,
                                                    }}>
                                                        最新
                                                    </span>
                                                )}
                                            </div>
                                            <span style={{ fontSize: 12, color: 'var(--text-subtle)' }}>
                                                {version.releaseDate}
                                            </span>
                                        </div>

                                        <div style={{
                                            fontSize: 13,
                                            color: 'var(--text-main)',
                                            lineHeight: 1.5,
                                            whiteSpace: 'pre-wrap',
                                            marginBottom: 12,
                                            padding: '8px 12px',
                                            background: 'var(--bg)',
                                            borderRadius: 6,
                                            maxHeight: 80,
                                            overflowY: 'auto',
                                        }}>
                                            {version.releaseNotes || '暂无更新说明'}
                                        </div>

                                        <button
                                            onClick={() => handleDownload(version)}
                                            disabled={isCurrent}
                                            style={{
                                                width: '100%',
                                                padding: '10px 16px',
                                                border: 'none',
                                                borderRadius: 8,
                                                background: isCurrent ? 'var(--border)' : 'var(--primary)',
                                                color: isCurrent ? 'var(--text-subtle)' : 'white',
                                                fontSize: 13,
                                                fontWeight: 500,
                                                cursor: isCurrent ? 'not-allowed' : 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: 6,
                                                transition: 'all 0.2s ease',
                                                opacity: isCurrent ? 0.6 : 1,
                                            }}
                                        >
                                            {isCurrent ? (
                                                <>
                                                    <span>✓</span>
                                                    <span>当前版本</span>
                                                </>
                                            ) : version.version > CURRENT_VERSION ? (
                                                <>
                                                    <span>⬆️</span>
                                                    <span>升级到此版本</span>
                                                </>
                                            ) : (
                                                <>
                                                    <span>⬇️</span>
                                                    <span>回退到此版本</span>
                                                </>
                                            )}
                                        </button>
                                    </div>
                                );
                            })}

                            {versionsInfo.versions.length === 0 && (
                                <div style={{
                                    textAlign: 'center',
                                    padding: 40,
                                    color: 'var(--text-subtle)',
                                    background: 'var(--surface)',
                                    borderRadius: 12,
                                    border: '1px dashed var(--border)',
                                }}>
                                    <div style={{ fontSize: 32, marginBottom: 12 }}>📭</div>
                                    <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>暂无可用版本</div>
                                    <div style={{ fontSize: 12 }}>请稍后再来查看</div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

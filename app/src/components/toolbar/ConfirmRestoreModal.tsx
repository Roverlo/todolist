import { useState } from 'react';
import type { ValidationResult } from '../../utils/backupUtils';

interface ConfirmRestoreModalProps {
    open: boolean;
    onClose: () => void;
    onConfirm: () => void;
    preview: ValidationResult['preview'];
    autoBackupPath?: string | null;
    isProcessing?: boolean;
}

export const ConfirmRestoreModal = ({
    open,
    onClose,
    onConfirm,
    preview,
    autoBackupPath,
    isProcessing = false,
}: ConfirmRestoreModalProps) => {
    const [confirmed, setConfirmed] = useState(false);

    if (!open || !preview) return null;

    const formatDate = (isoString: string) => {
        try {
            return new Date(isoString).toLocaleString('zh-CN', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
            });
        } catch {
            return isoString;
        }
    };

    const handleConfirm = () => {
        if (confirmed) {
            onConfirm();
        }
    };

    return (
        <div className='create-overlay' style={{ zIndex: 1100 }}>
            <div
                className='create-dialog'
                style={{ width: 480 }}
                onClick={(e) => e.stopPropagation()}
            >
                <header className='create-dialog-header'>
                    <div className='create-dialog-title-block'>
                        <div className='create-dialog-title'>⚠️ 确认恢复数据</div>
                        <div className='create-dialog-subtitle'>
                            请仔细确认以下信息，恢复操作将覆盖当前所有数据
                        </div>
                    </div>
                    <button
                        className='create-btn-icon'
                        onClick={onClose}
                        title='关闭'
                        disabled={isProcessing}
                    >
                        ✕
                    </button>
                </header>

                <div className='create-dialog-body'>
                    <section className='create-section'>
                        {/* 备份信息预览 */}
                        <div className='restore-preview'>
                            <div className='restore-preview-title'>📋 备份文件信息</div>
                            <div className='restore-preview-grid'>
                                <div className='restore-preview-item'>
                                    <span className='restore-preview-label'>备份时间</span>
                                    <span className='restore-preview-value'>
                                        {formatDate(preview.exportedAt)}
                                    </span>
                                </div>
                                <div className='restore-preview-item'>
                                    <span className='restore-preview-label'>项目数量</span>
                                    <span className='restore-preview-value'>
                                        {preview.projectCount} 个
                                    </span>
                                </div>
                                <div className='restore-preview-item'>
                                    <span className='restore-preview-label'>任务数量</span>
                                    <span className='restore-preview-value'>
                                        {preview.taskCount} 条
                                    </span>
                                </div>
                                <div className='restore-preview-item'>
                                    <span className='restore-preview-label'>笔记数量</span>
                                    <span className='restore-preview-value'>
                                        {preview.noteCount ?? 0} 条
                                    </span>
                                </div>
                                {preview.hasRecurringTemplates && (
                                    <div className='restore-preview-item'>
                                        <span className='restore-preview-label'>周期任务</span>
                                        <span className='restore-preview-value'>
                                            {preview.recurringTemplateCount} 个
                                        </span>
                                    </div>
                                )}
                                <div className='restore-preview-item'>
                                    <span className='restore-preview-label'>包含设置</span>
                                    <span className='restore-preview-value'>
                                        {preview.hasSettings ? '✅ 是' : '❌ 否'}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* 警告信息 */}
                        <div className='restore-warning'>
                            <div className='restore-warning-icon'>⚠️</div>
                            <div className='restore-warning-content'>
                                <div className='restore-warning-title'>重要提醒</div>
                                <ul className='restore-warning-list'>
                                    <li>恢复操作将<strong>完全覆盖</strong>当前所有数据</li>
                                    <li>包括所有项目、任务、设置和配置</li>
                                    <li>此操作<strong>无法撤销</strong></li>
                                </ul>
                            </div>
                        </div>

                        {/* 自动备份状态 */}
                        {autoBackupPath && (
                            <div className='restore-auto-backup'>
                                <span className='restore-auto-backup-icon'>💾</span>
                                <span className='restore-auto-backup-text'>
                                    已自动备份当前数据
                                </span>
                            </div>
                        )}

                        {/* 确认勾选 */}
                        <label className='restore-confirm-checkbox'>
                            <input
                                type='checkbox'
                                checked={confirmed}
                                onChange={(e) => setConfirmed(e.target.checked)}
                                disabled={isProcessing}
                            />
                            <span>
                                我已了解恢复操作将覆盖当前数据，并确认要继续
                            </span>
                        </label>
                    </section>
                </div>

                <footer className='create-dialog-footer'>
                    <div className='create-footer-actions export-footer-actions'>
                        <button
                            className='btn btn-light'
                            onClick={onClose}
                            disabled={isProcessing}
                        >
                            取消
                        </button>
                        <button
                            className='btn btn-danger'
                            onClick={handleConfirm}
                            disabled={!confirmed || isProcessing}
                        >
                            {isProcessing ? '恢复中...' : '确认恢复'}
                        </button>
                    </div>
                </footer>
            </div>
        </div>
    );
};

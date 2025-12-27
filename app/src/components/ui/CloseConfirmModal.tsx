import { useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';

interface CloseConfirmModalProps {
    open: boolean;
    onClose: () => void;
}

export const CloseConfirmModal = ({ open, onClose }: CloseConfirmModalProps) => {
    const [rememberChoice, setRememberChoice] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);

    const handleAction = async (action: 'minimize' | 'exit') => {
        if (isProcessing) return;
        setIsProcessing(true);

        try {
            if (rememberChoice) {
                localStorage.setItem('closeAction', action);
            }

            const appWindow = getCurrentWindow();

            if (action === 'minimize') {
                await appWindow.hide();
            } else {
                await appWindow.destroy();
            }
        } catch (err) {
            console.error('关闭操作失败:', err);
        } finally {
            setIsProcessing(false);
            onClose();
        }
    };

    if (!open) return null;

    return (
        <div
            className="overlay"
            style={{ zIndex: 9999 }}
            onClick={onClose}
        >
            <div
                className="dialog-shell"
                style={{
                    maxWidth: 320,
                    padding: '20px 24px',
                    borderRadius: 12,
                    boxShadow: '0 10px 40px rgba(0, 0, 0, 0.2)',
                }}
                onClick={(e) => e.stopPropagation()}
            >
                <h3 style={{
                    fontSize: 16,
                    fontWeight: 600,
                    color: 'var(--text)',
                    margin: '0 0 16px',
                    textAlign: 'center',
                }}>
                    关闭应用
                </h3>

                <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                    <button
                        type="button"
                        disabled={isProcessing}
                        onClick={() => handleAction('minimize')}
                        style={{
                            flex: 1,
                            padding: '10px 16px',
                            borderRadius: 8,
                            border: '1px solid var(--primary)',
                            background: 'var(--primary)',
                            color: 'white',
                            fontWeight: 500,
                            fontSize: 13,
                            cursor: isProcessing ? 'wait' : 'pointer',
                        }}
                    >
                        最小化到托盘
                    </button>

                    <button
                        type="button"
                        disabled={isProcessing}
                        onClick={() => handleAction('exit')}
                        style={{
                            flex: 1,
                            padding: '10px 16px',
                            borderRadius: 8,
                            border: '1px solid var(--border)',
                            background: 'var(--surface)',
                            color: 'var(--text)',
                            fontWeight: 500,
                            fontSize: 13,
                            cursor: isProcessing ? 'wait' : 'pointer',
                        }}
                    >
                        退出程序
                    </button>
                </div>

                <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    fontSize: 12,
                    color: 'var(--text-subtle)',
                    cursor: 'pointer',
                }}>
                    <input
                        type="checkbox"
                        checked={rememberChoice}
                        onChange={(e) => setRememberChoice(e.target.checked)}
                        style={{ width: 14, height: 14, accentColor: 'var(--primary)' }}
                    />
                    记住我的选择
                </label>
            </div>
        </div>
    );
};

// 重置用户的关闭偏好（可在设置中调用）
export const resetClosePreference = () => {
    localStorage.removeItem('closeAction');
};

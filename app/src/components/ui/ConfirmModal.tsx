import { useEffect, useRef } from 'react';
import './ConfirmModal.css';

interface ConfirmModalProps {
    open: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    isDanger?: boolean;
    onConfirm: () => void;
    onClose: () => void;
}

export function ConfirmModal({
    open,
    title,
    message,
    confirmText = '确认',
    cancelText = '取消',
    isDanger = false,
    onConfirm,
    onClose,
}: ConfirmModalProps) {
    const dialogRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!open) return;
            if (e.key === 'Escape') {
                onClose();
            }
            if (e.key === 'Enter') {
                onConfirm();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [open, onClose, onConfirm]);

    if (!open) return null;

    return (
        <div className="confirm-modal-overlay" onClick={onClose}>
            <div
                className="confirm-modal-content"
                ref={dialogRef}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="confirm-modal-header">
                    <div className="confirm-modal-title">
                        {isDanger && <span className="confirm-modal-icon">⚠️</span>}
                        {title}
                    </div>
                </div>

                <div className="confirm-modal-body">
                    {message}
                </div>

                <div className="confirm-modal-footer">
                    <button
                        className="confirm-modal-btn cancel"
                        onClick={onClose}
                    >
                        {cancelText}
                    </button>
                    <button
                        className={`confirm-modal-btn confirm ${isDanger ? 'danger' : 'primary'}`}
                        onClick={() => {
                            onConfirm();
                            onClose();
                        }}
                    >
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
}

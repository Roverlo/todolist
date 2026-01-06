import { useEffect, useRef } from 'react';
import { Icon } from '../ui/Icon';
import type { IconName } from '../ui/Icon';

export interface ContextMenuItem {
    id: string;
    label: string;
    icon?: IconName;
    onClick?: () => void;
    danger?: boolean;
    divider?: boolean;
    disabled?: boolean;
}

interface ContextMenuProps {
    x: number;
    y: number;
    items: ContextMenuItem[];
    onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                onClose();
            }
        };

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleKeyDown);

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [onClose]);

    useEffect(() => {
        if (menuRef.current) {
            const rect = menuRef.current.getBoundingClientRect();
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;

            let adjustedX = x;
            let adjustedY = y;

            if (x + rect.width > viewportWidth) {
                adjustedX = viewportWidth - rect.width - 10;
            }
            if (y + rect.height > viewportHeight) {
                adjustedY = viewportHeight - rect.height - 10;
            }

            menuRef.current.style.left = adjustedX + 'px';
            menuRef.current.style.top = adjustedY + 'px';
        }
    }, [x, y]);

    return (
        <div
            ref={menuRef}
            className="context-menu"
            style={{ left: x, top: y }}
        >
            {items.map((item) => {
                if (item.divider) {
                    return <div key={item.id} className="context-menu-divider" />;
                }

                return (
                    <button
                        key={item.id}
                        className={'context-menu-item' + (item.danger ? ' danger' : '') + (item.disabled ? ' disabled' : '')}
                        onClick={() => {
                            if (!item.disabled && item.onClick) {
                                item.onClick();
                                onClose();
                            }
                        }}
                        disabled={item.disabled}
                    >
                        {item.icon && <Icon name={item.icon} size={14} />}
                        <span>{item.label}</span>
                    </button>
                );
            })}
        </div>
    );
}

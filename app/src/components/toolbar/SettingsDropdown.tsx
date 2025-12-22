import { useState, useRef, useEffect } from 'react';

interface SettingsDropdownProps {
    onImport: () => void;
    onExport: () => void;
    onTheme: () => void;
    onFontSize: () => void;
    onBackup: () => void;
}

export const SettingsDropdown = ({
    onImport,
    onExport,
    onTheme,
    onFontSize,
    onBackup,
}: SettingsDropdownProps) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // 点击外部关闭
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);

    const handleItemClick = (action: () => void) => {
        setIsOpen(false);
        action();
    };

    const toggleOpen = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsOpen(!isOpen);
    };

    return (
        <div className='settings-dropdown' ref={dropdownRef}>
            <button
                className='btn btn-light settings-dropdown-trigger'
                onClick={toggleOpen}
                aria-label='设置'
                title='设置'
            >
                ⚙️ 设置 {isOpen ? '▲' : '▼'}
            </button>

            {isOpen && (
                <div className='settings-dropdown-menu'>
                    <button
                        className='settings-dropdown-item'
                        onClick={() => handleItemClick(onImport)}
                    >
                        <span className='settings-dropdown-icon'>📥</span>
                        <span>导入任务</span>
                    </button>
                    <button
                        className='settings-dropdown-item'
                        onClick={() => handleItemClick(onExport)}
                    >
                        <span className='settings-dropdown-icon'>📤</span>
                        <span>导出任务</span>
                    </button>
                    <div className='settings-dropdown-divider' />
                    <button
                        className='settings-dropdown-item'
                        onClick={() => handleItemClick(onTheme)}
                    >
                        <span className='settings-dropdown-icon'>🎨</span>
                        <span>主题设置</span>
                    </button>
                    <button
                        className='settings-dropdown-item'
                        onClick={() => handleItemClick(onFontSize)}
                    >
                        <span className='settings-dropdown-icon'>🔤</span>
                        <span>字体大小</span>
                    </button>
                    <div className='settings-dropdown-divider' />
                    <button
                        className='settings-dropdown-item'
                        onClick={() => handleItemClick(onBackup)}
                    >
                        <span className='settings-dropdown-icon'>💾</span>
                        <span>备份恢复</span>
                    </button>
                </div>
            )}
        </div>
    );
};

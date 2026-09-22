import { getCurrentWindow } from '@tauri-apps/api/window';
import { Minus, X } from 'lucide-react';
import { useToastStore } from '../../state/toastStore';
import './DesktopTitleBar.css';

export function DesktopTitleBar() {
    const act = (action: 'minimize' | 'close') => {
        void getCurrentWindow()[action]().catch(() => useToastStore.getState().addToast('窗口操作失败，请重试或使用任务栏、托盘菜单。', 'error'));
    };
    return <header className="desktop-titlebar" aria-label="窗口标题栏">
        <span>ProjectTodo</span>
        <div>
            <button type="button" aria-label="最小化窗口" title="最小化" onClick={() => act('minimize')}><Minus size={16} /></button>
            <button type="button" aria-label="关闭窗口" title="关闭" onClick={() => act('close')}><X size={16} /></button>
        </div>
    </header>;
}

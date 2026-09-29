import { useAppStoreShallow } from '../../state/appStore';
import { TaskSidebarContent } from './TaskSidebarContent';
import { NotesSidebar } from '../notes/NotesSidebar';
import { Icon } from '../ui/Icon';
import clsx from 'clsx';
import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { DownloadSidebar } from '../downloads/DownloadCenter';
import { ListTodo, FileText, ArrowDownToLine } from 'lucide-react';

interface AppSidebarProps {
    collapsed: boolean;
    onToggleCollapse: () => void;
    onProjectSelected?: () => void; // Passed to TaskSidebarContent
}

export const AppSidebar = ({ collapsed, onToggleCollapse, onProjectSelected }: AppSidebarProps) => {
    const { activeView, setActiveView, selectedNoteId, setSelectedNoteId, addNote } = useAppStoreShallow((state) => ({
        activeView: state.activeView,
        setActiveView: state.setActiveView,
        selectedNoteId: state.selectedNoteId,
        setSelectedNoteId: state.setSelectedNoteId,
        addNote: state.addNote,
    }));



    const [isAboutHovered, setIsAboutHovered] = useState(false);
    const [tooltipPos, setTooltipPos] = useState<{ top: number, left: number } | null>(null);
    const aboutRef = useRef<HTMLDivElement>(null);

    const handleMouseEnter = () => {
        if (aboutRef.current) {
            const rect = aboutRef.current.getBoundingClientRect();
            // Calculate position: below the element, aligned left
            setTooltipPos({
                top: rect.bottom + 8,
                left: rect.left
            });
            setIsAboutHovered(true);
        }
    };

    const handleCreateNote = () => {
        const newNote = addNote({ content: '' });
        setSelectedNoteId(newNote.id);
    };

    return (
        <aside className={clsx('sidebar', { collapsed })}>
            {collapsed ? (
                /* 收起状态：只显示展开按钮 */
                <div className="sidebar-collapsed-toggle">
                    <button
                        className='sidebar-collapse-btn collapsed'
                        onClick={onToggleCollapse}
                        title='展开侧边栏'
                    >
                        »
                    </button>
                </div>
            ) : (
                <>
                    {/* View Switcher Header - Now at the Top */}
                    <nav className="sidebar-switcher" aria-label="功能中心">
                        {([
                            { id: 'tasks', label: '待办事项', icon: ListTodo },
                            { id: 'notes', label: '随记中心', icon: FileText },
                            { id: 'downloads', label: '下载中心', icon: ArrowDownToLine },
                        ] as const).map(({ id, label, icon: TabIcon }) => <button
                            key={id} type="button" className={clsx('view-switch-item', { active: activeView === id, inactive: activeView !== id })}
                            aria-current={activeView === id ? 'page' : undefined} onClick={() => setActiveView(id)} title={`切换到${label}`}>
                            <TabIcon size={14} aria-hidden="true" /><span className="view-switch-label">{label}</span>
                        </button>)}
                    </nav>



                    {/* Utility Row: About + Collapse Button */}
                    <div className="sidebar-utility-row" style={{ position: 'relative' }}>
                        <div
                            className="about-pill"
                            ref={aboutRef}
                            onMouseEnter={handleMouseEnter}
                            onMouseLeave={() => setIsAboutHovered(false)}
                        >
                            <Icon name="info" size={14} />
                            <span className="about-text-label">关于</span>
                        </div>

                        {/* Custom Tooltip Portal */}
                        {isAboutHovered && tooltipPos && createPortal(
                            <div
                                className="custom-about-tooltip"
                                style={{
                                    top: tooltipPos.top,
                                    left: tooltipPos.left,
                                    position: 'fixed', // Ensure fixed positioning
                                    zIndex: 9999 // Ensure topmost z-index
                                }}
                            >
                                <div className="tooltip-section">
                                    <span className="tooltip-label">作者：</span>
                                    <span>网络服务处 罗发文 (luo.fawen@zte.com.cn)</span>
                                </div>
                                <div className="tooltip-divider" />
                                <div className="tooltip-section">
                                    <span className="tooltip-label">特别鸣谢：</span>
                                    <div className="tooltip-desc">
                                        本软件在测试与完善过程中，得到了以下领导和同事的大力支持与专业指导，在此一并表示诚挚感谢：
                                    </div>
                                    <div className="tooltip-names">
                                        莫佳运、罗备、杨帅、李良泳、张夕淳、贾君、王阳、戈少贤、桂树奇
                                    </div>
                                </div>
                            </div>,
                            document.body
                        )}

                        <button
                            className='sidebar-collapse-btn expanded'
                            onClick={onToggleCollapse}
                            title='收起侧边栏'
                        >
                            «
                        </button>
                    </div>

                    <div className="sidebar-content" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
                        {activeView === 'tasks' ? (
                            <TaskSidebarContent onProjectSelected={onProjectSelected} />
                        ) : activeView === 'downloads' ? (
                            <DownloadSidebar />
                        ) : (
                            <NotesSidebar
                                selectedNoteId={selectedNoteId ?? null}
                                onSelectNote={(note) => setSelectedNoteId(note.id)}
                                onCreateNote={handleCreateNote}
                            />
                        )}
                    </div>
                </>
            )}
        </aside>
    );
};

import { useAppStoreShallow } from '../../state/appStore';
import { TaskSidebarContent } from './TaskSidebarContent';
import { NotesSidebar } from '../notes/NotesSidebar';
import clsx from 'clsx';
import { DownloadSidebar } from '../downloads/DownloadCenter';
import { ListTodo, FileText, ArrowDownToLine, Settings } from 'lucide-react';

interface AppSidebarProps {
    collapsed: boolean;
    onOpenSettings: () => void;
    onToggleCollapse: () => void;
    onProjectSelected?: () => void; // Passed to TaskSidebarContent
}

export const AppSidebar = ({ collapsed, onToggleCollapse, onProjectSelected, onOpenSettings }: AppSidebarProps) => {
    const { activeView, setActiveView, selectedNoteId, setSelectedNoteId, addNote } = useAppStoreShallow((state) => ({
        activeView: state.activeView,
        setActiveView: state.setActiveView,
        selectedNoteId: state.selectedNoteId,
        setSelectedNoteId: state.setSelectedNoteId,
        addNote: state.addNote,
    }));



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
                    <button className="sidebar-settings" onClick={onOpenSettings} aria-label="设置" title="设置" aria-haspopup="dialog"><Settings size={16} aria-hidden="true" /></button>
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



                    <div className="sidebar-utility-row">
                        <button className="sidebar-settings" onClick={onOpenSettings} aria-label="设置" title="设置" aria-haspopup="dialog"><Settings size={14} aria-hidden="true" /><span>设置</span></button>

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

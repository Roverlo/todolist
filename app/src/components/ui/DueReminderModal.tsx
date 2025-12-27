import dayjs from 'dayjs';
import type { Task, Project } from '../../types';
import { useAppStoreShallow } from '../../state/appStore';

interface DueReminderModalProps {
    open: boolean;
    onClose: () => void;
    tasks: Task[];
    projectMap: Record<string, Project>;
}

export const DueReminderModal = ({ open, onClose, tasks, projectMap }: DueReminderModalProps) => {
    const { setSettings } = useAppStoreShallow((state) => ({
        setSettings: state.setSettings,
    }));

    if (!open) return null;

    const today = dayjs().startOf('day');

    // 筛选出今日到期和已逾期的任务（排除已完成和回收站）
    const dueTasks = tasks.filter((task) => {
        if (!task.dueDate || task.status === 'done') return false;
        const project = projectMap[task.projectId];
        if (project?.name === '回收站') return false;

        const dueDate = dayjs(task.dueDate).startOf('day');
        const diff = dueDate.diff(today, 'day');
        return diff <= 0; // 今日到期或已逾期
    });

    const overdueTasks = dueTasks.filter((task) => {
        const dueDate = dayjs(task.dueDate).startOf('day');
        return dueDate.isBefore(today); // 已逾期
    });

    const todayTasks = dueTasks.filter((task) => {
        const dueDate = dayjs(task.dueDate).startOf('day');
        return dueDate.isSame(today); // 今日到期
    });

    if (dueTasks.length === 0) return null;

    // 暂停提醒：今天不再提醒
    const handleSnoozeToday = () => {
        const endOfToday = dayjs().endOf('day').toISOString();
        setSettings({ dueReminderSnoozeUntil: endOfToday });
        onClose();
    };

    // 暂停提醒：本周不再提醒
    const handleSnoozeWeek = () => {
        const endOfWeek = dayjs().endOf('week').toISOString();
        setSettings({ dueReminderSnoozeUntil: endOfWeek });
        onClose();
    };

    return (
        <div className='create-overlay' style={{ zIndex: 150 }}>
            <div className='create-dialog' style={{ width: 520 }} onClick={(e) => e.stopPropagation()}>
                <header className='create-dialog-header'>
                    <div className='create-dialog-title-block'>
                        <div className='create-dialog-title'>⏰ 任务到期提醒</div>
                        <div className='create-dialog-subtitle'>
                            共 {dueTasks.length} 项任务需要关注
                        </div>
                    </div>
                    <button className='create-btn-icon' onClick={onClose} title='关闭'>
                        ✕
                    </button>
                </header>

                <div className='create-dialog-body' style={{ maxHeight: '400px', overflowY: 'auto' }}>
                    {overdueTasks.length > 0 && (
                        <section className='reminder-section'>
                            <div className='reminder-section-title overdue'>
                                ⚠️ 已逾期 ({overdueTasks.length})
                            </div>
                            <div className='reminder-task-list'>
                                {overdueTasks.map((task) => {
                                    const project = projectMap[task.projectId];
                                    const dueDate = dayjs(task.dueDate);
                                    const diff = Math.abs(dueDate.diff(today, 'day'));
                                    return (
                                        <div key={task.id} className='reminder-task-item overdue'>
                                            <div className='reminder-task-info'>
                                                <div className='reminder-task-project'>{project?.name || '未分类'}</div>
                                                <div className='reminder-task-title'>{task.title}</div>
                                            </div>
                                            <div className='reminder-task-due'>
                                                逾期 {diff} 天
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </section>
                    )}

                    {todayTasks.length > 0 && (
                        <section className='reminder-section'>
                            <div className='reminder-section-title today'>
                                📅 今日到期 ({todayTasks.length})
                            </div>
                            <div className='reminder-task-list'>
                                {todayTasks.map((task) => {
                                    const project = projectMap[task.projectId];
                                    return (
                                        <div key={task.id} className='reminder-task-item today'>
                                            <div className='reminder-task-info'>
                                                <div className='reminder-task-project'>{project?.name || '未分类'}</div>
                                                <div className='reminder-task-title'>{task.title}</div>
                                            </div>
                                            <div className='reminder-task-due'>
                                                今日到期
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </section>
                    )}
                </div>

                <footer className='create-dialog-footer'>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button
                            className='btn btn-light'
                            onClick={handleSnoozeToday}
                            title='今天不会再弹出此提醒'
                            style={{ fontSize: 12 }}
                        >
                            今天不再提醒
                        </button>
                        <button
                            className='btn btn-light'
                            onClick={handleSnoozeWeek}
                            title='本周内不会再弹出此提醒'
                            style={{ fontSize: 12 }}
                        >
                            本周不再提醒
                        </button>
                    </div>
                    <div className='create-footer-actions'>
                        <button className='btn btn-primary' onClick={onClose}>
                            我知道了
                        </button>
                    </div>
                </footer>
            </div>
        </div>
    );
};

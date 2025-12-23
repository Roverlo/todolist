import { useMemo } from 'react';
import dayjs from 'dayjs';
import type { Task, Project, Status } from '../../types';

interface StatsCardProps {
    tasks: Task[];
    projectMap: Record<string, Project>;
    activeFilter?: Status | 'all' | 'overdue' | 'dueToday';
    onFilterByStatus?: (status: Status | 'all' | 'overdue' | 'dueToday') => void;
}

export const StatsCard = ({ tasks, projectMap, activeFilter, onFilterByStatus }: StatsCardProps) => {

    const stats = useMemo(() => {
        const today = dayjs().startOf('day');

        // 筛选非回收站任务
        const activeTasks = tasks.filter((t) => {
            const project = projectMap[t.projectId];
            return project?.name !== '回收站';
        });

        const total = activeTasks.length;
        const doing = activeTasks.filter((t) => t.status === 'doing').length;
        const paused = activeTasks.filter((t) => t.status === 'paused').length;
        const done = activeTasks.filter((t) => t.status === 'done').length;

        // 今日到期（未完成的）
        const dueToday = activeTasks.filter((t) => {
            if (t.status === 'done' || !t.dueDate) return false;
            return dayjs(t.dueDate).startOf('day').isSame(today);
        }).length;

        // 已逾期（未完成的）
        const overdue = activeTasks.filter((t) => {
            if (t.status === 'done' || !t.dueDate) return false;
            return dayjs(t.dueDate).startOf('day').isBefore(today);
        }).length;

        // 完成率
        const completionRate = total > 0 ? Math.round((done / total) * 100) : 0;

        return { total, doing, paused, done, dueToday, overdue, completionRate };
    }, [tasks, projectMap]);

    const handleClick = (type: 'all' | Status | 'overdue' | 'dueToday') => {
        onFilterByStatus?.(type);
    };

    // 判断是否激活某个筛选
    const isActive = (type: 'all' | Status | 'overdue' | 'dueToday') => {
        if (type === 'all') return !activeFilter || activeFilter === 'all';
        return activeFilter === type;
    };

    // Dashboard Bar variant
    return (
        <div className='dashboard-bar'>
            <div className='dashboard-stats-group'>
                <div
                    className={`dash-stat-item dash-pill ${isActive('all') ? 'active' : ''}`}
                    onClick={() => handleClick('all')}
                    title="全部任务"
                >
                    <span className='dash-label'>总任务</span>
                    <span className='dash-value'>{stats.total}</span>
                </div>

                {/* <div className='dash-divider' /> */}

                <div
                    className={`dash-stat-item dash-pill ${isActive('doing') ? 'active' : ''}`}
                    onClick={() => handleClick('doing')}
                    title="进行中"
                >
                    <span className='dash-dot doing'></span>
                    <span className='dash-label'>进行中</span>
                    <span className='dash-value'>{stats.doing}</span>
                </div>

                <div
                    className={`dash-stat-item dash-pill ${isActive('paused') ? 'active' : ''}`}
                    onClick={() => handleClick('paused')}
                    title="挂起"
                >
                    <span className='dash-dot paused'></span>
                    <span className='dash-label'>挂起</span>
                    <span className='dash-value'>{stats.paused}</span>
                </div>

                <div
                    className={`dash-stat-item dash-pill ${isActive('done') ? 'active' : ''}`}
                    onClick={() => handleClick('done')}
                    title="已完成"
                >
                    <span className='dash-dot done'></span>
                    <span className='dash-label'>已完成</span>
                    <span className='dash-value'>{stats.done}</span>
                </div>
            </div>

            <div className='dash-right-group'>
                {stats.overdue > 0 && (
                    <div
                        className={`dash-alert overdue ${isActive('overdue') ? 'active' : ''}`}
                        title="点击筛选逾期任务"
                        onClick={() => handleClick('overdue')}
                    >
                        <span className='alert-icon'>⚠️</span>
                        <span>{stats.overdue} 逾期</span>
                    </div>
                )}
                {stats.dueToday > 0 && (
                    <div
                        className={`dash-alert today ${isActive('dueToday') ? 'active' : ''}`}
                        title="点击筛选今日到期"
                        onClick={() => handleClick('dueToday')}
                    >
                        <span className='alert-icon'>📅</span>
                        <span>{stats.dueToday} 今日</span>
                    </div>
                )}

                <div className='dash-progress-wrapper' title={`完成率 ${stats.completionRate}%`}>
                    <span className='dash-label' style={{ marginRight: 6 }}>完成率</span>
                    <div className='dash-progress-track'>
                        <div
                            className='dash-progress-fill'
                            style={{ width: `${stats.completionRate}%` }}
                        />
                    </div>
                    <span className='dash-progress-text'>{stats.completionRate}%</span>
                </div>
            </div>
        </div>
    );
};

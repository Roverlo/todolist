import { useMemo } from 'react';
import dayjs from 'dayjs';
import type { Task, Project } from '../../types';

interface StatsCardProps {
    tasks: Task[];
    projectMap: Record<string, Project>;
}

export const StatsCard = ({ tasks, projectMap }: StatsCardProps) => {
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

    return (
        <div className='stats-card'>
            <div className='stats-title'>📊 任务概览</div>
            <div className='stats-grid'>
                <div className='stats-item'>
                    <div className='stats-value'>{stats.total}</div>
                    <div className='stats-label'>总任务</div>
                </div>
                <div className='stats-item doing'>
                    <div className='stats-value'>{stats.doing}</div>
                    <div className='stats-label'>进行中</div>
                </div>
                <div className='stats-item paused'>
                    <div className='stats-value'>{stats.paused}</div>
                    <div className='stats-label'>挂起</div>
                </div>
                <div className='stats-item done'>
                    <div className='stats-value'>{stats.done}</div>
                    <div className='stats-label'>已完成</div>
                </div>
            </div>
            <div className='stats-row'>
                <div className='stats-highlight'>
                    {stats.overdue > 0 && (
                        <span className='stats-badge overdue'>⚠️ {stats.overdue} 项已逾期</span>
                    )}
                    {stats.dueToday > 0 && (
                        <span className='stats-badge today'>📅 {stats.dueToday} 项今日到期</span>
                    )}
                    {stats.overdue === 0 && stats.dueToday === 0 && (
                        <span className='stats-badge ok'>✅ 暂无紧急任务</span>
                    )}
                </div>
                <div className='stats-progress'>
                    <div className='stats-progress-bar'>
                        <div
                            className='stats-progress-fill'
                            style={{ width: `${stats.completionRate}%` }}
                        />
                    </div>
                    <span className='stats-progress-text'>{stats.completionRate}% 完成</span>
                </div>
            </div>
        </div>
    );
};

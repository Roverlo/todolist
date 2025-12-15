import { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import type { Task, Project } from '../../types';

interface StatsCardProps {
    tasks: Task[];
    projectMap: Record<string, Project>;
}

export const StatsCard = ({ tasks, projectMap }: StatsCardProps) => {
    const [collapsed, setCollapsed] = useState(false);

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
        <div className={`stats-card ${collapsed ? 'collapsed' : ''}`}>
            <div className='stats-header'>
                <div className='stats-header-left'>
                    <span className='stats-icon'>📊</span>
                    <span className='stats-title-text'>任务概览</span>
                    {collapsed && (
                        <div className='stats-summary-row'>
                            <span className='stats-summary-item'>
                                <span className='label'>进行中</span>
                                <span className='value doing'>{stats.doing}</span>
                            </span>
                            <span className='stats-summary-divider'>/</span>
                            <span className='stats-summary-item'>
                                <span className='label'>逾期</span>
                                <span className={`value ${stats.overdue > 0 ? 'danger' : ''}`}>{stats.overdue}</span>
                            </span>
                            <span className='stats-summary-divider'>/</span>
                            <span className='stats-summary-item'>
                                <span className='label'>完成率</span>
                                <span className='value'>{stats.completionRate}%</span>
                            </span>
                        </div>
                    )}
                </div>
                <button
                    className='stats-toggle-btn'
                    onClick={() => setCollapsed(!collapsed)}
                    title={collapsed ? '展开详情' : '收起详情'}
                >
                    {collapsed ? '▼' : '▲'}
                </button>
            </div>

            {!collapsed && (
                <div className='stats-content'>
                    <div className='stats-grid'>
                        <div className='stats-item'>
                            <div className='stats-value'>{stats.total}</div>
                            <div className='stats-label'>总任务</div>
                        </div>
                        <div className='stats-item'>
                            <div className='stats-value doing'>{stats.doing}</div>
                            <div className='stats-label'>进行中</div>
                        </div>
                        <div className='stats-item'>
                            <div className='stats-value paused'>{stats.paused}</div>
                            <div className='stats-label'>挂起</div>
                        </div>
                        <div className='stats-item'>
                            <div className='stats-value done'>{stats.done}</div>
                            <div className='stats-label'>已完成</div>
                        </div>
                    </div>

                    <div className='stats-footer'>
                        <div className='stats-alerts'>
                            {stats.overdue > 0 && (
                                <div className='stats-alert overdue'>
                                    <span className='alert-icon'>⚠️</span>
                                    <span>{stats.overdue} 项已逾期</span>
                                </div>
                            )}
                            {stats.dueToday > 0 && (
                                <div className='stats-alert today'>
                                    <span className='alert-icon'>📅</span>
                                    <span>{stats.dueToday} 项今日到期</span>
                                </div>
                            )}
                            {stats.overdue === 0 && stats.dueToday === 0 && (
                                <div className='stats-alert ok'>
                                    <span className='alert-icon'>✅</span>
                                    <span>暂无紧急任务</span>
                                </div>
                            )}
                        </div>

                        <div className='stats-progress-wrapper'>
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
            )}
        </div>
    );
};

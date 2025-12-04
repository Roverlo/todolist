import React, { memo } from 'react';
import dayjs from 'dayjs';
import type { Task, Project } from '../../types';

interface TaskRowProps {
  task: Task;
  project?: Project;
  latestNote?: string;
  onTaskFocus: (taskId: string) => void;
  onDeleteTask: (taskId: string) => void;
  onRestoreTask?: (taskId: string) => void;
  onHardDeleteTask?: (taskId: string) => void;
  trashRetentionDays?: number;
  isActive?: boolean;
  fontSize?: number;
}

const statusLabel: Record<Task['status'], string> = {
  doing: '进行中',
  paused: '挂起',
  done: '已完成',
};

const priorityLabel: Record<NonNullable<Task['priority']>, string> = {
  high: '高优',
  medium: '中优',
  low: '低优',
};

const MetaBlock = memo(({ task, isTrash, retentionDays }: { task: Task; isTrash: boolean; retentionDays: number }) => {
  const dueLabel = () => {
    if (!task.dueDate) return '无截止日期';
    // 已完成的任务不再计算倒计时/逾期，直接显示日期
    if (task.status === 'done') {
      return dayjs(task.dueDate).format('YYYY-MM-DD');
    }
    const diff = dayjs(task.dueDate).startOf('day').diff(dayjs().startOf('day'), 'day');
    if (diff === 0) return '今日到期';
    if (diff > 0) return `剩余 ${diff} 天`;
    return `逾期 ${Math.abs(diff)} 天`;
  };

  const trashLabel = () => {
    if (!task.extras?.trashedAt) return '即将删除';
    const trashedAt = Number(task.extras.trashedAt);
    const deleteAt = dayjs(trashedAt).add(retentionDays, 'day');
    const diff = deleteAt.diff(dayjs(), 'day');
    if (diff <= 0) return '即将删除';
    return `${diff} 天后删除`;
  };

  // 检查是否在3天内到期（1-3天，不包括今天和逾期）
  const isSoonDue = () => {
    if (!task.dueDate || task.status === 'done') return false;
    const diff = dayjs(task.dueDate).startOf('day').diff(dayjs().startOf('day'), 'day');
    return diff > 0 && diff <= 3;
  };

  return (
    <div className='meta-block'>
      <div className='meta-line'>
        <span className='meta-label'>创建</span>
        <span className='meta-value'>{dayjs(task.createdAt).format('MM-DD HH:mm')}</span>
      </div>
      {isTrash ? (
        <div className='meta-line'>
          <span className='meta-label'>清理</span>
          <span className='meta-value text-danger'>{trashLabel()}</span>
        </div>
      ) : (
        <div className='meta-line'>
          <span className='meta-label'>截止</span>
          <span className={`meta-value ${task.status !== 'done' && task.dueDate && dayjs(task.dueDate).isBefore(dayjs(), 'day') ? 'text-danger' : ''}`}>
            {dueLabel()}
            {isSoonDue() && <span className='due-soon-badge'>⏰</span>}
          </span>
        </div>
      )}
      <div className='meta-line'>
        <span className='meta-label'>现场</span>
        <span className='meta-value'>{task.onsiteOwner || '--'}</span>
      </div>
      <div className='meta-line'>
        <span className='meta-label'>产线</span>
        <span className='meta-value'>{task.lineOwner || '--'}</span>
      </div>
    </div>
  );
});

MetaBlock.displayName = 'MetaBlock';

export const TaskRow = memo(({ 
  task, 
  project, 
  latestNote, 
  onTaskFocus, 
  onDeleteTask,
  onRestoreTask,
  onHardDeleteTask,
  trashRetentionDays = 30,
  isActive = false,
  fontSize = 13
}: TaskRowProps) => {
  const isTrash = project?.name === '回收站';

  const handleRowClick = (e: React.MouseEvent) => {
    // 如果点击的是按钮，不触发行点击
    if ((e.target as HTMLElement).closest('button')) {
      return;
    }
    // 回收站任务不可查看详情/编辑
    if (isTrash) return;
    onTaskFocus(task.id);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDeleteTask(task.id);
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    onTaskFocus(task.id);
  };

  const handleRestore = (e: React.MouseEvent) => {
    e.stopPropagation();
    onRestoreTask?.(task.id);
  };

  const handleHardDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onHardDeleteTask?.(task.id);
  };

  const priorityClass = {
    high: 'border-l-priority-high',
    medium: 'border-l-priority-medium',
    low: 'border-l-priority-low',
  }[task.priority ?? 'medium'];

  // Dynamic calculation of max lines to match the Meta column height (~110px)
  // Meta column has fixed 12px font size, about 6 lines worth of content including buttons.
  // We want the middle text to fill this height without overflowing too much.
  const lineClamp = Math.max(3, Math.min(8, Math.round(110 / (fontSize * 1.5))));
  
  const textStyle = {
    fontSize,
    WebkitLineClamp: lineClamp,
    lineClamp: lineClamp, // Standard property for future support
  };

  return (
    <tr 
      className={`task-row ${isTrash ? 'opacity-60 grayscale-[0.5]' : ''} ${isActive ? 'task-row-active' : ''}`} 
      onClick={handleRowClick}
      style={isTrash ? { cursor: 'default' } : undefined}
    >
      <td className={`col-main ${priorityClass}`}>
        <div className='project-name'>{project?.name ?? '未分类'}</div>
        <div className={`task-title-main ${isTrash ? 'line-through text-gray-500' : ''}`}>{task.title}</div>
        <div className='task-tags-row'>
          <span
            className={`tag-pill ${
              task.status === 'done'
                ? 'tag-status-done'
                : task.status === 'paused'
                ? 'tag-status-paused'
                : 'tag-status-doing'
            }`}
          >
            {statusLabel[task.status]}
          </span>
          <span
            className={`tag-pill ${
              task.priority === 'high'
                ? 'tag-priority-high'
                : task.priority === 'low'
                ? 'tag-priority-low'
                : 'tag-priority-medium'
            }`}
          >
            {priorityLabel[task.priority ?? 'medium']}
          </span>
        </div>
      </td>
      <td className='col-text'>
        <div className='field-label'>详情</div>
        <div className='field-text' style={textStyle}>{task.notes || '--'}</div>
      </td>
      <td className='col-text'>
        <div className='field-label'>最近进展</div>
        <div className='field-text' style={textStyle}>{latestNote || '--'}</div>
      </td>
      <td className='col-text'>
        <div className='field-label'>下一步计划</div>
        <div className='field-text' style={textStyle}>{task.nextStep || '--'}</div>
      </td>
      <td className='col-meta'>
        <MetaBlock task={task} isTrash={isTrash} retentionDays={trashRetentionDays} />
        <div className='meta-actions'>
          {isTrash ? (
            <>
              <button 
                className='btn-xs btn-xs-outline' 
                type='button' 
                onClick={handleRestore}
                title='恢复任务'
              >
                恢复
              </button>
              <button
                className='btn-xs btn-xs-danger'
                type='button'
                onClick={handleHardDelete}
                title='彻底删除'
              >
                彻底删除
              </button>
            </>
          ) : (
            <>
              <button 
                className='btn-xs btn-xs-outline' 
                type='button' 
                onClick={handleEdit}
                aria-label={`编辑任务: ${task.title}`}
              >
                编辑
              </button>
              <button
                className='btn-xs btn-xs-danger'
                type='button'
                onClick={handleDelete}
                aria-label={`删除任务: ${task.title}`}
              >
                删除
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
});

TaskRow.displayName = 'TaskRow';

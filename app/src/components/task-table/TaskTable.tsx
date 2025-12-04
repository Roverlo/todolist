import React, { useMemo, useCallback } from 'react';
import { useVisibleTasks } from '../../hooks/useVisibleTasks';
import { useAppStoreShallow } from '../../state/appStore';
import { TaskRow } from './TaskRow';
import { confirm } from '@tauri-apps/plugin-dialog';
import { getTaskZone, type TaskZone } from '../../utils/taskUtils';

export interface TaskTableProps {
  onTaskFocus: (taskId: string) => void;
  activeTaskId?: string | null;
}

export const TaskTable = React.memo(({ onTaskFocus, activeTaskId }: TaskTableProps) => {
  const { tasks, projectMap } = useVisibleTasks();
  const { deleteTask, restoreTask, hardDeleteTask, settings } = useAppStoreShallow((state) => ({
    deleteTask: state.deleteTask,
    restoreTask: state.restoreTask,
    hardDeleteTask: state.hardDeleteTask,
    settings: state.settings,
  }));

  const handleDeleteTask = useCallback((taskId: string) => {
    deleteTask(taskId);
  }, [deleteTask]);

  const handleRestoreTask = useCallback((taskId: string) => {
    restoreTask(taskId);
  }, [restoreTask]);

  const handleHardDeleteTask = useCallback(async (taskId: string) => {
    const confirmed = await confirm('确认彻底删除？此操作无法撤销。', {
      title: 'ProjectTodo',
      kind: 'warning'
    });
    if (confirmed) {
      hardDeleteTask(taskId);
    }
  }, [hardDeleteTask]);

  const rows = useMemo(
    () =>
      tasks.map((task) => {
        const project = projectMap[task.projectId];
        const latest = task.progress?.length ? task.progress[task.progress.length - 1] : undefined;
        const zone = getTaskZone(task);
        return { task, project, latestNote: latest?.note ?? '', zone };
      }),
    [tasks, projectMap],
  );

  const zoneLabels: Record<TaskZone, { emoji: string; label: string }> = {
    urgent: { emoji: '🔴', label: '紧急区 (逾期/今日)' },
    future: { emoji: '📅', label: '规划区 (未来)' },
    nodate: { emoji: '⚪', label: '待定区 (无截止日期)' },
    done: { emoji: '✅', label: '已完成' },
  };

  return (
    <div className='task-table-wrapper'>
      <table className='task-table'>
        <colgroup>
          <col style={{ width: '220px' }} />
          <col style={{ width: 'calc((100% - 440px) / 3)' }} />
          <col style={{ width: 'calc((100% - 440px) / 3)' }} />
          <col style={{ width: 'calc((100% - 440px) / 3)' }} />
          <col style={{ width: '220px' }} />
        </colgroup>
        <thead>
          <tr>
            <th>项目 / 标题</th>
            <th>详情</th>
            <th>最近进展</th>
            <th>下一步计划</th>
            <th style={{ width: 220 }}>状态 / 时间 / 操作</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ task, project, latestNote, zone }, index) => {
            const prevZone = index > 0 ? rows[index - 1].zone : null;
            const showZoneHeader = zone !== prevZone;

            return (
              <React.Fragment key={task.id}>
                {showZoneHeader && (
                  <tr className='zone-header'>
                    <td colSpan={5}>
                      <span className='zone-emoji'>{zoneLabels[zone].emoji}</span>
                      <span className='zone-label'>{zoneLabels[zone].label}</span>
                    </td>
                  </tr>
                )}
                <TaskRow
                  task={task}
                  project={project}
                  latestNote={latestNote}
                  onTaskFocus={onTaskFocus}
                  onDeleteTask={handleDeleteTask}
                  onRestoreTask={handleRestoreTask}
                  onHardDeleteTask={handleHardDeleteTask}
                  trashRetentionDays={settings.trashRetentionDays ?? 60}
                  isActive={activeTaskId === task.id}
                  fontSize={settings.listFontSize}
                />
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
});

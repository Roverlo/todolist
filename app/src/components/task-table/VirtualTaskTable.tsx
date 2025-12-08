import React, { useMemo, useCallback } from 'react';
import type { CSSProperties } from 'react';
// @ts-ignore - react-window export issue with TypeScript
import { FixedSizeList } from 'react-window';
import { useVisibleTasks } from '../../hooks/useVisibleTasks';
import { useAppStoreShallow } from '../../state/appStore';
import { TaskRow } from './TaskRow';
import type { Task, Project } from '../../types';

export interface VirtualTaskTableProps {
  onTaskFocus: (taskId: string) => void;
  height?: number;
}

interface RowData {
  tasks: Array<{
    task: Task;
    project?: Project;
    latestNote: string;
    latestProgressAt?: number;
  }>;
  onTaskFocus: (taskId: string) => void;
  onDeleteTask: (taskId: string) => void;
}

const Row = ({ index, style, data }: { index: number; style: CSSProperties; data: RowData }) => {
  const item = data.tasks[index];
  if (!item) return null;
  
  return (
    <div style={style}>
      <table className="task-table" style={{ tableLayout: 'fixed', width: '100%' }}>
        <tbody>
          <TaskRow
            task={item.task}
            project={item.project}
            latestNote={item.latestNote}
            latestProgressAt={item.latestProgressAt}
            onTaskFocus={data.onTaskFocus}
            onDeleteTask={data.onDeleteTask}
          />
        </tbody>
      </table>
    </div>
  );
};

export const VirtualTaskTable = React.memo(({ onTaskFocus, height = 600 }: VirtualTaskTableProps) => {
  const { tasks, projectMap } = useVisibleTasks();
  const { deleteTask } = useAppStoreShallow((state) => ({
    deleteTask: state.deleteTask,
  }));

  const handleDeleteTask = useCallback((taskId: string) => {
    deleteTask(taskId);
  }, [deleteTask]);

  const rows = useMemo(
    () =>
      tasks.map((task) => {
        const project = projectMap[task.projectId];
        const latest = task.progress?.length ? task.progress[task.progress.length - 1] : undefined;
        return { task, project, latestNote: latest?.note ?? '', latestProgressAt: latest?.at };
      }),
    [tasks, projectMap],
  );

  const itemData: RowData = useMemo(
    () => ({
      tasks: rows,
      onTaskFocus,
      onDeleteTask: handleDeleteTask,
    }),
    [rows, onTaskFocus, handleDeleteTask]
  );

  // 如果任务数少于50个，使用普通表格渲染
  if (rows.length < 50) {
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
            {rows.map(({ task, project, latestNote, latestProgressAt }) => (
              <TaskRow
                key={task.id}
                task={task}
                project={project}
                latestNote={latestNote}
                latestProgressAt={latestProgressAt}
                onTaskFocus={onTaskFocus}
                onDeleteTask={handleDeleteTask}
              />
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // 大数据量使用虚拟滚动
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
      </table>
      <FixedSizeList
        height={height}
        itemCount={rows.length}
        itemSize={80}
        width="100%"
        itemData={itemData}
      >
        {Row}
      </FixedSizeList>
    </div>
  );
});

VirtualTaskTable.displayName = 'VirtualTaskTable';

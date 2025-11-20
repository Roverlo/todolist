import { Fragment, useEffect, useMemo, useState, useRef } from 'react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from 'react';
import clsx from 'clsx';
import dayjs from 'dayjs';
import { useVisibleTasks } from '../../hooks/useVisibleTasks';
import { useAppStoreShallow } from '../../state/appStore';
import type { ColumnConfig, Dictionary, Project, Settings, Task } from '../../types';
import { isDueSoon, isOverdue } from '../../utils/taskUtils';

const columnMeta: Record<
  string,
  { label: string; align?: 'left' | 'center' | 'right' }
> = {
  project: { label: '项目' },
  title: { label: '标题' },
  status: { label: '状态', align: 'center' },
  priority: { label: '优先级' },
  notes: { label: '详情' },
  nextStep: { label: '下一步' },
  latestProgress: { label: '最近进展' },
  createdAt: { label: '创建时间' },
  dueDate: { label: '截止日期' },
  onsiteOwner: { label: '现场责任人' },
  lineOwner: { label: '产线责任人' },
  tags: { label: '标签' },
  attachments: { label: '附件' },
};

const statusLabels: Record<string, string> = {
  doing: '进行中',
  done: '已完成',
  paused: '挂起',
};

const priorityLabels: Record<string, string> = {
  high: '高',
  medium: '中',
  low: '低',
};

const SELECTION_WIDTH = 0;
const TOP_COLUMNS = ['project','title','notes','latestProgress','nextStep'];
const HEADER_RATIOS: Record<string, number> = {
  project: 0.10,
  title: 0.16,
  notes: 0.28,
  latestProgress: 0.26,
  nextStep: 0.20,
};
const BOTTOM_BASE_FIELDS = ['status','priority','dueDate','onsiteOwner','lineOwner','createdAt','attachments'];

export interface TaskTableProps {
  onTaskFocus: (taskId: string) => void;
  onOpenProgress?: (taskId: string) => void;
}

export const TaskTable = ({
  onTaskFocus,
  onOpenProgress,
}: TaskTableProps) => {
  const { tasks, grouped, projectMap, filters } = useVisibleTasks();
  const {
    updateTask,
    deleteTask,
    columnConfig,
    settings,
    dictionary,
    projects,
    
  } = useAppStoreShallow((state) => ({
    updateTask: state.updateTask,
    deleteTask: state.deleteTask,
    columnConfig: state.columnConfig,
    settings: state.settings,
    dictionary: state.dictionary,
    projects: state.projects,
    
  }));

  const [editingId, setEditingId] = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoCompact, setAutoCompact] = useState(false);
  const [tableScale, setTableScale] = useState(1);
  const [headerWidths, setHeaderWidths] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!editingId) {
      setEditingId(null);
    }
  }, [editingId]);

  const pinnedOffsets = useMemo(() => computePinnedOffsets(columnConfig, headerWidths), [columnConfig, headerWidths]);

  const toggleGroup = (key: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  

  

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const actionsWidth = 180;
    const available = el.clientWidth - SELECTION_WIDTH - actionsWidth;
    const min: Record<string, number> = {
      project: 120,
      title: 140,
      notes: 180,
      latestProgress: 200,
      nextStep: 180,
    };
    const widths: Record<string, number> = {};
    TOP_COLUMNS.forEach((col) => {
      const w = Math.max(min[col], Math.floor(HEADER_RATIOS[col] * available));
      widths[col] = w;
    });
    setHeaderWidths(widths);
    const requiredWidth = SELECTION_WIDTH + Object.values(widths).reduce((a, b) => a + b, 0) + actionsWidth;
    const ratio = el.clientWidth / requiredWidth;
    const nextScale = ratio < 1 ? Math.max(0.85, Number(ratio.toFixed(2))) : 1;
    setAutoCompact(nextScale < 0.999);
    setTableScale(nextScale);
    const onResize = () => {
      const available2 = el.clientWidth - SELECTION_WIDTH - actionsWidth;
      const widths2: Record<string, number> = {};
      TOP_COLUMNS.forEach((col) => {
        const w = Math.max(min[col], Math.floor(HEADER_RATIOS[col] * available2));
        widths2[col] = w;
      });
      setHeaderWidths(widths2);
      const req2 = SELECTION_WIDTH + Object.values(widths2).reduce((a, b) => a + b, 0) + actionsWidth;
      const r2 = el.clientWidth / req2;
      const ns2 = r2 < 1 ? Math.max(0.85, Number(r2.toFixed(2))) : 1;
      setAutoCompact(ns2 < 0.999);
      setTableScale(ns2);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [columnConfig]);

  return (
    <section className='task-table-panel'>
      <header className='task-table-meta'>
        <div>
          <strong>{tasks.length}</strong> 条事项
          {filters.projectId && (
            <span className='muted'> · {projectMap[filters.projectId]?.name}</span>
          )}
        </div>
        
      </header>
      
      <div
        ref={containerRef}
        className={clsx('task-table-container', columnConfig.density, {
          compact: autoCompact || columnConfig.density === 'compact',
        })}
        style={{ '--table-scale': tableScale } as CSSProperties}
      >
        <table>
          <colgroup>
            {TOP_COLUMNS.map((column) => (
              <col key={`col-${column}`} style={{ width: headerWidths[column] ?? 160 }} />
            ))}
            <col style={{ width: 'var(--actions-width)' }} />
          </colgroup>
          <thead>
            <tr>
              {TOP_COLUMNS.map((column) => (
                <th
                  key={column}
                  className={clsx({ pinned: ['project','title'].includes(column) })}
                  style={{
                    width: headerWidths[column] ?? 160,
                    left: ['project','title'].includes(column) ? pinnedOffsets[column] : undefined,
                    textAlign: columnMeta[column]?.align ?? 'left',
                  }}
                >
                  {columnConfig.labels?.[column] ?? columnMeta[column]?.label ?? column}
                </th>
              ))}
              <th className='actions-column' style={{ width: 'var(--actions-width)' }}>
                操作
              </th>
            </tr>
          </thead>
          <tbody>
            {grouped.map((group) => (
              <Fragment key={group.key}>
                <tr className='group-row'>
                  <td colSpan={TOP_COLUMNS.length + 1}>
                    <button type='button' onClick={() => toggleGroup(group.key)} aria-label='切换分组展开'>
                      {collapsedGroups[group.key] ? '▶' : '▼'}
                    </button>
                    <span>
                      {group.label} ({group.tasks.length})
                    </span>
                  </td>
                </tr>
                {!collapsedGroups[group.key] &&
                  group.tasks.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      columns={columnConfig}
                      project={projectMap[task.projectId]}
                      pinnedOffsets={pinnedOffsets}
                      editing={editingId === task.id}
                      onEnterEdit={() => setEditingId(task.id)}
                      onSave={(updates) => {
                        updateTask(task.id, updates);
                        setEditingId(null);
                      }}
                      onCancelEdit={() => setEditingId(null)}
                      onDelete={() => deleteTask(task.id)}
                      onFocus={() => onTaskFocus(task.id)}
                      dictionary={dictionary}
                      projects={projects}
                      settings={settings}
                      onOpenProgress={onOpenProgress}
                    />
                  ))}
              </Fragment>
              ))}
              {!tasks.length && (
              <tr className='empty-row'>
                <td colSpan={TOP_COLUMNS.length + 1}>暂无匹配事项</td>
              </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    );
};

const computePinnedOffsets = (config: ColumnConfig, widths: Record<string, number>) => {
  const offsets: Record<string, number> = {};
  let offset = 0;
  config.columns.forEach((column) => {
    if (config.pinned.includes(column)) {
      offsets[column] = offset;
      offset += widths[column] ?? 160;
    }
  });
  return offsets;
};


 

interface TaskRowProps {
  task: Task;
  project?: Project;
  columns: ColumnConfig;
  pinnedOffsets: Record<string, number>;
  editing: boolean;
  onEnterEdit: () => void;
  onSave: (updates: Partial<Task>) => void;
  onCancelEdit: () => void;
  onDelete: () => void;
  onFocus: () => void;
  dictionary: Dictionary;
  projects: Project[];
  settings: Settings;
  onOpenProgress?: (taskId: string) => void;
}

const TaskRow = ({
  task,
  project,
  columns,
  pinnedOffsets,
  editing,
  onEnterEdit,
  onSave,
  onCancelEdit,
  onDelete,
  onFocus,
  dictionary,
  projects,
  settings,
  onOpenProgress,
}: TaskRowProps) => {
  const [draft, setDraft] = useState<Task>(task);

  useEffect(() => {
    if (editing) {
      setDraft(task);
    }
  }, [editing, task]);

  const handleKeyDown = (
    event: ReactKeyboardEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    if ((event.key === 's' || event.key === 'S') && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      handleSave();
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      onCancelEdit();
    }
  };

  const handleFieldChange = <K extends keyof Task>(field: K, value: Task[K]) => {
    setDraft((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
    onSave({
      ...draft,
      tags: draft.tags?.map((tag) => tag.trim()).filter(Boolean),
    });
  };

  const overdue = isOverdue(task, settings.overdueThresholdDays);
  const dueSoon = !overdue && isDueSoon(task);

  return (
    <>
      <tr
        className={clsx('task-row', { overdue, 'due-soon': dueSoon, editing })}
        onClick={() => onFocus()}
        onDoubleClick={onEnterEdit}
      >
        {TOP_COLUMNS.map((column) => (
          <td
            key={column}
            className={clsx({ pinned: ['project','title'].includes(column) })}
            style={{
              left: ['project','title'].includes(column) ? pinnedOffsets[column] : undefined,
            }}
          >
            {editing
              ? renderEditor({
                column,
                draft,
                handleChange: handleFieldChange,
                handleKeyDown,
                projects,
                dictionary,
                taskId: task.id,
              })
              : renderDisplay(column, task, project, settings)}
          </td>
        ))}
        <td className='actions-column'>
          <div className='row-actions'>
            {editing ? (
              <>
                <button type='button' onClick={handleSave}>保存</button>
                <button type='button' onClick={onCancelEdit}>取消</button>
              </>
            ) : (
              <>
                <button type='button' onClick={onEnterEdit}>编辑</button>
                <button type='button' onClick={onDelete}>删除</button>
                <button type='button' onClick={() => onOpenProgress?.(task.id)}>查看进展</button>
              </>
            )}
          </div>
        </td>
      </tr>
      <tr className={clsx('task-row-bottom')}>
        <td colSpan={TOP_COLUMNS.length + 1}>
          <div className='row-bottom'>
            {BOTTOM_BASE_FIELDS.map((field) => (
              <div key={field} className={clsx('field','module',`module--${field}`)}>
                <div className='label'>{columnMeta[field]?.label ?? columns.labels?.[field] ?? field}</div>
                {editing
                  ? renderEditor({
                    column: field,
                    draft,
                    handleChange: handleFieldChange,
                    handleKeyDown,
                    projects,
                    dictionary,
                    taskId: task.id,
                  })
                  : renderDisplay(field, task, project, settings)}
              </div>
            ))}
            {columns.columns
              .filter((c) => !TOP_COLUMNS.includes(c) && !BOTTOM_BASE_FIELDS.includes(c))
              .map((c) => (
                ((editing || (task.extras?.[c] ?? '').toString().length > 0)) && (
                  <div key={c} className={clsx('field','module','module--extras')}>
                    <div className='label'>{columnMeta[c]?.label ?? columns.labels?.[c] ?? c}</div>
                    {editing
                      ? renderEditor({
                          column: c,
                          draft,
                          handleChange: handleFieldChange,
                          handleKeyDown,
                          projects,
                          dictionary,
                          taskId: task.id,
                        })
                      : renderDisplay(c, task, project, settings)}
                  </div>
                )
              ))}
          </div>
        </td>
      </tr>
    </>
  );
};

interface EditorProps {
  column: string;
  draft: Task;
  handleChange: <K extends keyof Task>(field: K, value: Task[K]) => void;
  handleKeyDown: (
    event: ReactKeyboardEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => void;
  projects: Project[];
  dictionary: Dictionary;
  taskId: string;
}

const renderEditor = ({
  column,
  draft,
  handleChange,
  handleKeyDown,
  projects,
  dictionary,
  taskId,
}: EditorProps) => {
  switch (column) {
    case 'project':
      return (
        <select
          value={draft.projectId}
          onChange={(event) => handleChange('projectId', event.target.value)}
          onKeyDown={handleKeyDown}
        >
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
      );
    case 'title':
      return (
        <textarea
          rows={4}
          value={draft.title}
          onChange={(event) => handleChange('title', event.target.value)}
          onKeyDown={handleKeyDown}
          onInput={(event) => {
            const el = event.currentTarget;
            el.style.height = 'auto';
            el.style.height = `${el.scrollHeight}px`;
          }}
        />
      );
    case 'status':
      return (
        <select
          value={draft.status}
          onChange={(event) => handleChange('status', event.target.value as Task['status'])}
          onKeyDown={handleKeyDown}
        >
          <option value='doing'>进行中</option>
          <option value='done'>已完成</option>
          <option value='paused'>挂起</option>
        </select>
      );
    case 'priority':
      return (
        <select
          value={draft.priority ?? 'medium'}
          onChange={(event) => handleChange('priority', event.target.value as Task['priority'])}
          onKeyDown={handleKeyDown}
        >
          <option value='high'>High</option>
          <option value='medium'>Medium</option>
          <option value='low'>Low</option>
        </select>
      );
    case 'dueDate':
      return (
        <input
          type='date'
          value={draft.dueDate ?? ''}
          onChange={(event) => handleChange('dueDate', event.target.value)}
          onKeyDown={handleKeyDown}
        />
      );
    case 'onsiteOwner':
    case 'lineOwner': {
      const key = column === 'onsiteOwner' ? 'onsiteOwners' : 'lineOwners';
      const listId = `${taskId}-${column}-options`;
      return (
        <>
          <input
            list={listId}
            value={(draft[column as 'onsiteOwner' | 'lineOwner'] as string) ?? ''}
            onChange={(event) =>
              handleChange(column as 'onsiteOwner' | 'lineOwner', event.target.value)
            }
            onKeyDown={handleKeyDown}
          />
          <datalist id={listId}>
            {dictionary[key].map((item) => (
              <option key={item} value={item} />
            ))}
          </datalist>
        </>
      );
    }
    case 'nextStep':
    case 'notes':
      return (
        <textarea
          rows={4}
          value={(draft[column as 'nextStep' | 'notes'] as string) ?? ''}
          onChange={(event) => handleChange(column as 'nextStep' | 'notes', event.target.value)}
          onKeyDown={handleKeyDown}
          onInput={(event) => {
            const el = event.currentTarget;
            el.style.height = 'auto';
            el.style.height = `${el.scrollHeight}px`;
          }}
        />
      );
    case 'latestProgress': {
      const last = draft.progress?.length ? draft.progress[draft.progress.length - 1] : undefined;
      const value = last?.note ?? '';
      return (
        <textarea
          rows={4}
          value={value}
          onChange={(event) => {
            const note = event.target.value;
            const now = Date.now();
            const entry = last
              ? { ...last, note }
              : { id: String(now), at: now, status: 'doing' as const, note };
            const next = draft.progress?.length
              ? [...(draft.progress ?? []).slice(0, -1), entry]
              : [entry];
            handleChange('progress', next);
          }}
          onKeyDown={handleKeyDown}
          onInput={(event) => {
            const el = event.currentTarget;
            el.style.height = 'auto';
            el.style.height = `${el.scrollHeight}px`;
          }}
        />
      );
    }
    case 'tags':
      return (
        <input
          type='text'
          value={(draft.tags ?? []).join(', ')}
          placeholder='Comma separated'
          onChange={(event) =>
            handleChange(
              'tags',
              event.target.value
                .split(',')
                .map((tag) => tag.trim())
                .filter(Boolean),
            )
          }
          onKeyDown={handleKeyDown}
        />
      );
    default:
      return (
        <input
          type='text'
          value={(draft.extras?.[column] ?? '') as string}
          onChange={(event) =>
            handleChange('extras', {
              ...(draft.extras ?? {}),
              [column]: event.target.value,
            })
          }
          onKeyDown={handleKeyDown}
        />
      );
  }
};

const renderDisplay = (column: string, task: Task, project: Project | undefined, settings: Settings) => {
  switch (column) {
    case 'project':
      return project?.name ?? 'Unassigned';
    case 'title':
      return <span className='title-cell'>{task.title}</span>;
    case 'status':
      return <span className={`status-pill ${task.status}`}>{statusLabels[task.status]}</span>;
    case 'priority':
      return <span className={`priority-pill ${task.priority ?? 'medium'}`}>{priorityLabels[task.priority ?? 'medium']}</span>;
    case 'dueDate':
      if (!task.dueDate) return '--';
      const txt = dayjs(task.dueDate).format(settings.dateFormat);
      const diff = dayjs(task.dueDate).startOf('day').diff(dayjs().startOf('day'), 'day');
      const suffix = diff === 0 ? '(今日)' : diff > 0 ? `(${diff}天)` : `(${diff}天)`;
      return `${txt} ${suffix}`;
    case 'createdAt':
      return dayjs(task.createdAt).format(settings.dateFormat);
    case 'onsiteOwner':
      return task.onsiteOwner ?? '--';
    case 'lineOwner':
      return task.lineOwner ?? '--';
    case 'nextStep':
      return task.nextStep ?? '--';
    case 'tags':
      return (
        <div className='tag-list'>
          {(task.tags ?? []).map((tag) => (
            <span key={tag} className='tag-chip'>
              {tag}
            </span>
          ))}
        </div>
      );
    case 'notes':
      return task.notes ?? '--';
    case 'latestProgress':
      return task.progress?.length
        ? task.progress[task.progress.length - 1].note
        : '--';
    case 'attachments':
      return `${task.attachments?.length ?? 0} file(s)`;
    default:
      return String(((task as unknown as Record<string, unknown>)[column]) ?? '--');
  }
};

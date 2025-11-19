import { useState } from 'react';
import type { ChangeEvent } from 'react';
import dayjs from 'dayjs';
import { useVisibleTasks } from '../../hooks/useVisibleTasks';
import { useAppStoreShallow } from '../../state/appStore';
import { ImportModal } from './ImportModal';
import { SingleTaskModal } from './SingleTaskModal';
import { RecurringTaskModal } from './RecurringTaskModal';
import { exportTasksToCsv, saveCsvWithTauri, triggerDownload } from '../../utils/csv';
import type { Priority, Status } from '../../types';

export const PrimaryToolbar = () => {
  const {
    filters,
    setFilters,
    dictionary,
    groupBy,
    setGroupBy,
    
    importTasks,
    ensureProjectByName,
  } = useAppStoreShallow((state) => ({
    filters: state.filters,
    setFilters: state.setFilters,
    dictionary: state.dictionary,
    groupBy: state.groupBy,
    setGroupBy: state.setGroupBy,
    columnConfig: state.columnConfig,
    updateColumnConfig: state.updateColumnConfig,
    importTasks: state.importTasks,
    ensureProjectByName: state.ensureProjectByName,
  }));

  const { tasks, projectMap } = useVisibleTasks();

  const [importModal, setImportModal] = useState(false);
  const [addTaskOpen, setAddTaskOpen] = useState(false);
  const [addRecurringOpen, setAddRecurringOpen] = useState(false);

  
  const [dueFrom, setDueFrom] = useState(filters.dueRange?.from ?? '');
  const [dueTo, setDueTo] = useState(filters.dueRange?.to ?? '');

  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    setFilters({ search: event.target.value });
  };

  

  

  const handleExport = async () => {
    const csv = exportTasksToCsv(tasks, projectMap);
    const name = `tasks-${dayjs().format('YYYYMMDD-HHmmss')}.csv`;
    try {
      await saveCsvWithTauri(name, csv);
    } catch {
      triggerDownload(name, csv);
    }
  };

  const handleProjectGroup = (mode: 'project' | 'status' | null) => {
    setGroupBy(mode);
  };

  return (
    <section className='primary-toolbar'>
      <div className='toolbar-row main'>
        <input
          type='search'
          placeholder='搜索或DSL（示例：status:doing）'
          value={filters.search}
          onChange={handleSearchChange}
        />
        <div className='toolbar-actions'>
          <button type='button' className='primary-btn' onClick={() => setAddTaskOpen(true)} aria-label='新建单次任务'>
            新建单次任务
          </button>
          <button type='button' className='accent-btn' onClick={() => setAddRecurringOpen(true)} aria-label='新建周期任务'>
            新建周期任务
          </button>
          <button type='button' onClick={() => setImportModal(true)} aria-label='打开导入'>
            导入
          </button>
          <button type='button' onClick={handleExport} aria-label='导出当前筛选'>
            导出
          </button>
        </div>
      </div>
      <div className='toolbar-row filters'>
        <label>
          状态
          <select
            value={filters.status ?? 'all'}
            onChange={(event) =>
              setFilters({
                status: event.target.value === 'all' ? 'all' : (event.target.value as Status),
              })
            }
          >
            <option value='all'>全部</option>
            <option value='doing'>进行中</option>
            <option value='done'>已完成</option>
            <option value='paused'>挂起</option>
          </select>
        </label>
        <label>
          优先级
          <select
            value={filters.priority ?? 'all'}
            onChange={(event) =>
              setFilters({
                priority:
                  event.target.value === 'all' ? 'all' : (event.target.value as Priority),
              })
            }
          >
            <option value='all'>全部</option>
            <option value='high'>高</option>
            <option value='medium'>中</option>
            <option value='low'>低</option>
          </select>
        </label>
        <label>
          现场责任人
          <select
            value={filters.onsiteOwner ?? ''}
            onChange={(event) => setFilters({ onsiteOwner: event.target.value || undefined })}
          >
            <option value=''>全部</option>
            {dictionary.onsiteOwners.map((owner) => (
              <option key={owner} value={owner}>
                {owner}
              </option>
            ))}
          </select>
        </label>
        <label>
          产线责任人
          <select
            value={filters.lineOwner ?? ''}
            onChange={(event) => setFilters({ lineOwner: event.target.value || undefined })}
          >
            <option value=''>全部</option>
            {dictionary.lineOwners.map((owner) => (
              <option key={owner} value={owner}>
                {owner}
              </option>
            ))}
          </select>
        </label>
        
        <label>
          截止起
          <input
            type='date'
            value={dueFrom}
            onChange={(event) => {
              setDueFrom(event.target.value);
              setFilters({
                dueRange: { ...filters.dueRange, from: event.target.value || undefined },
              });
            }}
          />
        </label>
        <label>
          截止至
          <input
            type='date'
            value={dueTo}
            onChange={(event) => {
              setDueTo(event.target.value);
              setFilters({
                dueRange: { ...filters.dueRange, to: event.target.value || undefined },
              });
            }}
          />
        </label>
        <div className='group-switch'>
          分组：
          <button
            type='button'
            className={groupBy === 'project' ? 'active' : ''}
            onClick={() => handleProjectGroup(groupBy === 'project' ? null : 'project')}
          >
            项目
          </button>
          <button
            type='button'
            className={groupBy === 'status' ? 'active' : ''}
            onClick={() => handleProjectGroup(groupBy === 'status' ? null : 'status')}
          >
            状态
          </button>
        </div>
      </div>
      
      <ImportModal
        open={importModal}
        onClose={() => setImportModal(false)}
        onImport={importTasks}
        ensureProject={ensureProjectByName}
      />
      <SingleTaskModal open={addTaskOpen} onClose={() => setAddTaskOpen(false)} />
      <RecurringTaskModal open={addRecurringOpen} onClose={() => setAddRecurringOpen(false)} />
    </section>
  );
};

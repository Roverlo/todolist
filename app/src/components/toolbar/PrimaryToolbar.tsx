import { useState } from 'react';
import { useAppStoreShallow } from '../../state/appStore';
import type { Priority, Status } from '../../types';

export const PrimaryToolbar = () => {
  const { filters, setFilters, dictionary } = useAppStoreShallow((state) => ({
    filters: state.filters,
    setFilters: state.setFilters,
    dictionary: state.dictionary,
  }));

  const [dueFrom, setDueFrom] = useState(filters.dueRange?.from ?? '');
  const [dueTo, setDueTo] = useState(filters.dueRange?.to ?? '');
  const [stage, setStage] = useState(filters.status ?? 'all');

  const toggleStatus = (status: Status) => {
    const set = new Set(filters.statuses ?? []);
    if (set.has(status)) set.delete(status);
    else set.add(status);
    const next = Array.from(set);
    setFilters({ statuses: next, status: next.length ? 'all' : filters.status });
  };

  const resetFilters = () => {
    setStage('all');
    setDueFrom('');
    setDueTo('');
    setFilters({
      statuses: [],
      status: 'all',
      priority: 'all',
      onsiteOwner: undefined,
      lineOwner: undefined,
      dueRange: undefined,
    });
  };

  return (
    <div className='filters-card'>
      <div className='filters-row-top'>
        <div className='section-title' style={{ marginBottom: 0 }}>
          筛选
        </div>
        <div className='status-toggle-group'>
          {(['doing', 'paused', 'done'] as Status[]).map((status) => {
            const selected = !!(filters.statuses ?? []).includes(status);
            const label = status === 'doing' ? '进行中' : status === 'paused' ? '挂起' : '已完成';
            return (
              <button
                key={status}
                className={`status-toggle ${selected ? 'status-toggle-active' : ''}`}
                onClick={() => toggleStatus(status)}
                type='button'
              >
                {label}
              </button>
            );
          })}
        </div>
        <button className='btn btn-ghost' type='button' onClick={resetFilters}>
          清空筛选
        </button>
      </div>

      <div className='filters-row-bottom'>
        <div className='filter-item'>
          <span className='filter-label'>当前阶段</span>
          <select
            className='filter-control'
            value={stage}
            onChange={(event) => {
              const value = event.target.value as Status | 'all';
              setStage(value);
              if (value === 'all') {
                setFilters({ status: 'all' });
              } else {
                setFilters({ status: value, statuses: [value] });
              }
            }}
          >
            <option value='all'>全部</option>
            <option value='doing'>进行中</option>
            <option value='paused'>挂起</option>
            <option value='done'>已完成</option>
          </select>
        </div>
        <div className='filter-item'>
          <span className='filter-label'>优先级</span>
          <select
            className='filter-control'
            value={filters.priority ?? 'all'}
            onChange={(event) =>
              setFilters({
                priority: event.target.value === 'all' ? 'all' : (event.target.value as Priority),
              })
            }
          >
            <option value='all'>全部</option>
            <option value='high'>高</option>
            <option value='medium'>中</option>
            <option value='low'>低</option>
          </select>
        </div>
        <div className='filter-item'>
          <span className='filter-label'>现场责任人</span>
          <select
            className='filter-control'
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
        </div>
        <div className='filter-item'>
          <span className='filter-label'>产线责任人</span>
          <select
            className='filter-control'
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
        </div>
        <div className='filter-item'>
          <span className='filter-label'>截止日期 起</span>
          <input
            type='date'
            className='filter-control'
            value={dueFrom}
            onChange={(event) => {
              setDueFrom(event.target.value);
              setFilters({ dueRange: { ...filters.dueRange, from: event.target.value || undefined } });
            }}
          />
        </div>
        <div className='filter-item'>
          <span className='filter-label'>截止日期 止</span>
          <input
            type='date'
            className='filter-control'
            value={dueTo}
            onChange={(event) => {
              setDueTo(event.target.value);
              setFilters({ dueRange: { ...filters.dueRange, to: event.target.value || undefined } });
            }}
          />
        </div>
      </div>
    </div>
  );
};

import { useState } from 'react';
import { useAppStoreShallow } from '../../state/appStore';
import type { Priority, Status } from '../../types';
import { CustomSelect } from '../ui/CustomSelect';

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

  // Options preparation
  const stageOptions = [
    { value: 'all', label: '全部' },
    { value: 'doing', label: '进行中' },
    { value: 'paused', label: '挂起' },
    { value: 'done', label: '已完成' },
  ];

  const priorityOptions = [
    { value: 'all', label: '全部' },
    { value: 'high', label: '高' },
    { value: 'medium', label: '中' },
    { value: 'low', label: '低' },
  ];

  const onsiteOwnerOptions = [
    { value: '', label: '全部' },
    ...dictionary.onsiteOwners.map((o) => ({ value: o, label: o })),
  ];

  const lineOwnerOptions = [
    { value: '', label: '全部' },
    ...dictionary.lineOwners.map((o) => ({ value: o, label: o })),
  ];

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
          <CustomSelect
            value={stage}
            options={stageOptions}
            onChange={(val) => {
              const value = val as Status | 'all';
              setStage(value);
              if (value === 'all') {
                setFilters({ status: 'all' });
              } else {
                setFilters({ status: value, statuses: [value] });
              }
            }}
          />
        </div>
        <div className='filter-item'>
          <span className='filter-label'>优先级</span>
          <CustomSelect
            value={filters.priority ?? 'all'}
            options={priorityOptions}
            onChange={(val) =>
              setFilters({
                priority: val === 'all' ? 'all' : (val as Priority),
              })
            }
          />
        </div>
        <div className='filter-item'>
          <span className='filter-label'>现场责任人</span>
          <CustomSelect
            value={filters.onsiteOwner ?? ''}
            options={onsiteOwnerOptions}
            onChange={(val) => setFilters({ onsiteOwner: val || undefined })}
          />
        </div>
        <div className='filter-item'>
          <span className='filter-label'>产线责任人</span>
          <CustomSelect
            value={filters.lineOwner ?? ''}
            options={lineOwnerOptions}
            onChange={(val) => setFilters({ lineOwner: val || undefined })}
          />
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

import { useMemo, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { useAppStoreShallow } from '../../state/appStore';
import { ConfirmDialog } from '../ui/ConfirmDialog';

interface ProjectSidebarProps {
  onProjectSelected?: () => void;
}

export const ProjectSidebar = ({ onProjectSelected }: ProjectSidebarProps) => {
  const {
    projects,
    tasks,
    filters,
    setFilters,
    addProject,
    renameProject,
    deleteProject,
    ensureProjectByName,
    settings,
  } = useAppStoreShallow((state) => ({
    projects: state.projects,
    tasks: state.tasks,
    filters: state.filters,
    setFilters: state.setFilters,
    addProject: state.addProject,
    renameProject: state.renameProject,
    deleteProject: state.deleteProject,
    ensureProjectByName: state.ensureProjectByName,
    settings: state.settings,
  }));

  const trashId = useMemo(() => projects.find((p) => p.name === '回收站')?.id, [projects]);
  const unassignedId = useMemo(() => projects.find((p) => p.name === '未分类')?.id, [projects]);
  const visibleTasks = useMemo(() => tasks.filter((t) => t.projectId !== trashId), [tasks, trashId]);
  const counts = useMemo(() => {
    return visibleTasks.reduce<Record<string, number>>((acc, task) => {
      acc[task.projectId] = (acc[task.projectId] ?? 0) + 1;
      return acc;
    }, {});
  }, [visibleTasks]);

  const systemItems = [
    {
      key: 'ALL' as const,
      label: '汇总',
      hint: '',
      icon: '汇',
      count: trashId ? tasks.filter((t) => t.projectId !== trashId).length : tasks.length,
    },
    {
      key: 'UNASSIGNED' as const,
      label: '未分类',
      hint: '',
      icon: '未',
      count: unassignedId ? tasks.filter((t) => t.projectId === unassignedId).length : 0,
    },
    {
      key: 'TRASH' as const,
      label: '回收站',
      hint: (settings.trashRetentionDays ?? 30) >= 99999 ? '永久保留' : `保留 ${settings.trashRetentionDays ?? 30} 天`,
      icon: '回',
      count: trashId ? tasks.filter((t) => t.projectId === trashId).length : 0,
    },
  ];

  const totalSystemCount = useMemo(
    () => systemItems.find((item) => item.key === 'ALL')?.count ?? 0,
    [systemItems],
  );

  const handleSelectSystem = (key: 'ALL' | 'UNASSIGNED' | 'TRASH') => {
    if (key === 'ALL') setFilters({ projectId: undefined });
    if (key === 'UNASSIGNED') {
      const id = unassignedId ?? ensureProjectByName('未分类');
      setFilters({ projectId: id });
    }
    if (key === 'TRASH') {
      const id = trashId ?? ensureProjectByName('回收站');
      setFilters({ projectId: id });
    }
    onProjectSelected?.();
  };

  const handleSelectProject = (id: string) => {
    setFilters({ projectId: id });
    onProjectSelected?.();
  };

  const [creatingName, setCreatingName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<{ id: string; name: string; taskCount: number } | null>(null);

  // Tooltip 状态管理
  const helpIconRef = useRef<HTMLDivElement>(null);
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPos, setTooltipPos] = useState({ top: 0, left: 0 });

  const handleTooltipShow = () => {
    if (helpIconRef.current) {
      const rect = helpIconRef.current.getBoundingClientRect();
      setTooltipPos({
        top: rect.bottom + 10,
        left: rect.left,
      });
      setShowTooltip(true);
    }
  };

  return (
    <>
      <aside className='sidebar'>
      <div>
        <div className='brand'>
          <div className='brand-avatar'>待</div>
          <div>
            <div className='brand-title-row'>
              <div className='brand-text-title'>待办事项</div>
              <div 
                className='help-icon'
                ref={helpIconRef}
                onMouseEnter={handleTooltipShow}
                onMouseLeave={() => setShowTooltip(false)}
              >
                ?
              </div>
            </div>
            <div className='brand-text-sub'>网络服务处视频交付科</div>
            <div className='brand-text-note'>作者luo.fawen@zte.com.cn</div>
          </div>
        </div>
      </div>

      <div className='sidebar-group'>
        <div className='system-panel'>
          <div className='system-header'>
            <div className='system-title'>系统视图</div>
            <span className='system-stats-pill'>共 {totalSystemCount} 项</span>
          </div>

          <div className='system-list'>
            {systemItems.map((item) => {
              const isActive =
                (item.key === 'ALL' && filters.projectId === undefined) ||
                (item.key === 'UNASSIGNED' && filters.projectId === unassignedId) ||
                (item.key === 'TRASH' && filters.projectId === trashId);
              const isRecycle = item.key === 'TRASH';
              return (
                <button
                  key={item.key}
                  type='button'
                  className={clsx('system-item', { active: isActive, recycle: isRecycle })}
                  title={item.hint}
                  onClick={() => handleSelectSystem(item.key)}
                >
                  <div className='system-main'>
                    <div className='system-icon'>{item.icon}</div>
                    <div className='system-label-block'>
                      <div className='system-name'>{item.label}</div>
                      {item.hint && <div className='system-hint'>{item.hint}</div>}
                    </div>
                  </div>
                  <div className='system-count-pill'>{item.count} 项</div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className='sidebar-group'>
        <div className='section-title-row'>
          <div className='section-title' style={{ marginBottom: 0 }}>项目列表</div>
        </div>
        
        <div className='project-create-row'>
          <input
            className='input'
            placeholder='输入新项目名称...'
            value={creatingName}
            onChange={(e) => setCreatingName(e.target.value)}
          />
          <button
            className='btn btn-primary-outline project-create-btn'
            type='button'
            disabled={!creatingName.trim()}
            onClick={() => {
              const name = creatingName.trim();
              if (name) {
                addProject(name);
                setCreatingName('');
              }
            }}
          >
            新建
          </button>
        </div>
        
        <div className='project-list-wrapper'>
          <div className='project-list'>
          {projects
            .filter((p) => p.name !== '回收站' && p.name !== '未分类')
            .map((project) => (
              <div
                key={project.id}
                className={clsx('sidebar-item', { 'sidebar-item-active': filters.projectId === project.id })}
                onClick={() => handleSelectProject(project.id)}
              >
                <div className='ps-project-main'>
                  {editingId === project.id ? (
                    <input
                      className='input'
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                    />
                  ) : (
                    <div className='ps-project-name'>{project.name}</div>
                  )}
                  <div className='ps-project-meta-row'>
                    <div className='ps-meta-left'>
                      <span className='count-pill'>{(counts[project.id] ?? 0)} 条任务</span>
                    </div>
                    <div className='ps-btn-row'>
                      <button
                        type='button'
                        className='ps-icon-btn'
                        onClick={(event) => {
                          event.stopPropagation();
                          if (editingId === project.id) {
                            const name = editingName.trim();
                            if (name) renameProject(project.id, name);
                            setEditingId(null);
                            setEditingName('');
                          } else {
                            setEditingId(project.id);
                            setEditingName(project.name);
                          }
                        }}
                      >
                        {editingId === project.id ? '保存' : '重命名'}
                      </button>
                      <button
                        type='button'
                        className='ps-icon-btn ps-btn-danger'
                        title='删除或归档项目'
                        onClick={(event) => {
                          event.stopPropagation();
                          const taskCount = counts[project.id] || 0;
                          if (taskCount === 0) {
                            // 没有任务，直接删除项目
                            deleteProject(project.id, { deleteTasks: false });
                            setFilters({ projectId: undefined });
                          } else {
                            // 有任务，打开对话框询问
                            setProjectToDelete({ id: project.id, name: project.name, taskCount });
                            setDeleteDialogOpen(true);
                          }
                        }}
                      >
                        删除
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={deleteDialogOpen}
        title='删除项目'
        message={
          projectToDelete
            ? `该项目中有 ${projectToDelete.taskCount} 个任务。\n\n点击"删除任务"将任务移到回收站，\n点击"移到未分类"将任务移到"未分类"项目。`
            : ''
        }
        confirmLabel='删除任务'
        cancelLabel='移到未分类'
        variant='warning'
        onConfirm={() => {
          if (projectToDelete) {
            deleteProject(projectToDelete.id, { deleteTasks: true });
            setFilters({ projectId: undefined });
          }
          setDeleteDialogOpen(false);
          setProjectToDelete(null);
        }}
        onCancel={() => {
          if (projectToDelete) {
            deleteProject(projectToDelete.id, { deleteTasks: false });
            setFilters({ projectId: undefined });
          }
          setDeleteDialogOpen(false);
          setProjectToDelete(null);
        }}
      />
    </aside>

    {showTooltip && createPortal(
      <div 
        className='help-tooltip'
        style={{
          position: 'fixed',
          top: `${tooltipPos.top}px`,
          left: `${tooltipPos.left}px`,
          opacity: 1,
          visibility: 'visible',
        }}
      >
        <div className='help-tooltip-title'>智能排序逻辑</div>
        <div className='help-item'>
          <span className='help-icon-emoji'>🔴</span>
          <span className='help-item-text'><b>紧急区</b> (逾期/今日)：高优置顶</span>
        </div>
        <div className='help-item'>
          <span className='help-icon-emoji'>📅</span>
          <span className='help-item-text'><b>规划区</b> (未来)：按日期排列</span>
        </div>
        <div className='help-item'>
          <span className='help-icon-emoji'>⚪</span>
          <span className='help-item-text'><b>待定区</b>：按优先级排列</span>
        </div>
        <div className='help-footer'>* 已完成任务自动沉底</div>
      </div>,
      document.body
    )}
  </>
  );
};

import { useMemo } from 'react';
import clsx from 'clsx';
import { useAppStoreShallow } from '../../state/appStore';

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
  } = useAppStoreShallow((state) => ({
    projects: state.projects,
    tasks: state.tasks,
    filters: state.filters,
    setFilters: state.setFilters,
    addProject: state.addProject,
    renameProject: state.renameProject,
    deleteProject: state.deleteProject,
    ensureProjectByName: state.ensureProjectByName,
  }));

  const trashId = useMemo(() => projects.find((p) => p.name === '回收站')?.id, [projects]);
  const visibleTasks = useMemo(() => tasks.filter((t) => t.projectId !== trashId), [tasks, trashId]);
  const counts = useMemo(() => {
    return visibleTasks.reduce<Record<string, number>>((acc, task) => {
      acc[task.projectId] = (acc[task.projectId] ?? 0) + 1;
      return acc;
    }, {});
  }, [visibleTasks]);

  const systemItems = [
    { key: 'ALL' as const, label: '汇总', count: visibleTasks.length },
    { key: 'UNASSIGNED' as const, label: '未分类', count: tasks.filter((t) => !t.projectId).length },
    {
      key: 'TRASH' as const,
      label: '回收站',
      count: trashId ? tasks.filter((t) => t.projectId === trashId).length : 0,
    },
  ];

  const handleSelectSystem = (key: 'ALL' | 'UNASSIGNED' | 'TRASH') => {
    if (key === 'ALL') setFilters({ projectId: undefined });
    if (key === 'UNASSIGNED') setFilters({ projectId: 'UNASSIGNED' as string });
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

  return (
    <aside className='sidebar'>
      <div>
        <div className='brand'>
          <div className='brand-avatar'>待</div>
          <div>
            <div className='brand-text-title'>待办事项</div>
            <div className='brand-text-sub'>网络服务处视频交付科</div>
            <div className='brand-text-note'>作者luo.fawen@zte.com.cn</div>
          </div>
        </div>
      </div>

      <div className='sidebar-group'>
        <div className='section-title'>系统视图</div>
        <div className='sidebar-list'>
          {systemItems.map((item) => (
            <button
              key={item.key}
              type='button'
              className={clsx('sidebar-item', {
                'sidebar-item-active':
                  (item.key === 'ALL' && filters.projectId === undefined) ||
                  (item.key === 'UNASSIGNED' && filters.projectId === ('UNASSIGNED' as string)) ||
                  (item.key === 'TRASH' && filters.projectId === trashId),
              })}
              onClick={() => handleSelectSystem(item.key)}
            >
              <span>{item.label}</span>
              <span className='pill-counter'>{item.count} 项</span>
            </button>
          ))}
        </div>
      </div>

      <div className='sidebar-group'>
        <div className='section-title-row'>
          <div className='section-title' style={{ marginBottom: 0 }}>
            项目列表
          </div>
          <button
            className='btn btn-section'
            type='button'
            onClick={() => {
              const name = prompt('新建项目');
              if (name && name.trim()) addProject(name.trim());
            }}
          >
            新建项目
          </button>
        </div>
        <div className='sidebar-subnote'>
          在这里切换具体项目，右侧任务列表会跟着切换。新建项目后会出现在下方列表中。
        </div>
        <div className='sidebar-list sidebar-project-list'>
          {projects
            .filter((p) => p.name !== '回收站')
            .map((project) => (
              <button
                key={project.id}
                type='button'
                className={clsx('sidebar-item', { 'sidebar-item-active': filters.projectId === project.id })}
                onClick={() => handleSelectProject(project.id)}
              >
                <div className='sidebar-item-main'>
                  <span className='sidebar-item-name'>{project.name}</span>
                  <span className='pill-counter'>{counts[project.id] ?? 0}</span>
                </div>
                <div className='sidebar-item-actions'>
                  <button
                    type='button'
                    className='btn-mini'
                    title='重命名项目'
                    onClick={(event) => {
                      event.stopPropagation();
                      const next = prompt('重命名项目', project.name);
                      if (next && next.trim()) renameProject(project.id, next.trim());
                    }}
                  >
                    编辑
                  </button>
                  <button
                    type='button'
                    className='btn-mini'
                    title='删除或归档项目'
                    onClick={(event) => {
                      event.stopPropagation();
                      if (confirm('删除该项目？任务会移动到未分类')) {
                        deleteProject(project.id, { deleteTasks: false });
                        setFilters({ projectId: undefined });
                      }
                    }}
                  >
                    删除
                  </button>
                </div>
              </button>
            ))}
        </div>
      </div>

    </aside>
  );
};

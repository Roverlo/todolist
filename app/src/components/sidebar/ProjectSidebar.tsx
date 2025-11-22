import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { useAppStoreShallow } from '../../state/appStore';
import type { Project } from '../../types';

interface ProjectSidebarProps {
  onProjectSelected?: () => void;
}

export const ProjectSidebar = ({ onProjectSelected }: ProjectSidebarProps) => {
  const {
    projects,
    tasks,
    filters,
    addProject,
    renameProject,
    deleteProject,
    setFilters,
    ensureProjectByName,
  } = useAppStoreShallow((state) => ({
    projects: state.projects,
    tasks: state.tasks,
    filters: state.filters,
    addProject: state.addProject,
    renameProject: state.renameProject,
    deleteProject: state.deleteProject,
    setFilters: state.setFilters,
    ensureProjectByName: state.ensureProjectByName,
  }));

  const [newProject, setNewProject] = useState('');

  const trashId = useMemo(() => projects.find((p) => p.name === '回收站')?.id, [projects]);
  const visibleTasks = useMemo(() => tasks.filter((t) => t.projectId !== trashId), [tasks, trashId]);
  const counts = useMemo(() => {
    return visibleTasks.reduce<Record<string, number>>((acc, task) => {
      acc[task.projectId] = (acc[task.projectId] ?? 0) + 1;
      return acc;
    }, {});
  }, [visibleTasks]);

  const filtered = useMemo(() => {
    return [...projects].sort((a, b) => a.name.localeCompare(b.name, 'zh'));
  }, [projects]);

  const activeProjects = filtered.filter((p) => p.name !== '回收站');

  const handleSelect = (project?: Project | 'ALL' | 'UNASSIGNED') => {
    if (project === 'ALL') {
      setFilters({ projectId: undefined });
      onProjectSelected?.();
      return;
    }
    if (project === 'UNASSIGNED') {
      setFilters({ projectId: 'UNASSIGNED' as string });
      onProjectSelected?.();
      return;
    }
    const targetId = project?.id;
    const next = filters.projectId === targetId ? undefined : targetId;
    setFilters({ projectId: next });
    onProjectSelected?.();
  };

  const handleCreateProject = () => {
    const name = newProject.trim();
    if (!name) return;
    addProject(name);
    setNewProject('');
  };

  const handleRename = (project: Project) => {
    const next = prompt('重命名项目', project.name);
    if (next && next.trim() && next !== project.name) {
      renameProject(project.id, next.trim());
    }
  };

  const palette = ['#e8f7f1', '#f3e8ff', '#e6f0ff', '#fff7e6', '#e6fffa', '#fce7f3', '#f0fdf4'];
  const colorFor = (key: string) => {
    const sum = Array.from(key).reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
    return palette[sum % palette.length];
  };

  const systemItems = [
    { key: 'ALL' as const, label: '汇总', count: visibleTasks.length, tone: 'mint' },
    { key: 'UNASSIGNED' as const, label: '未分类', count: tasks.filter((t) => !t.projectId).length, tone: 'sand' },
    {
      key: 'TRASH' as const,
      label: '回收站',
      count: trashId ? tasks.filter((t) => t.projectId === trashId).length : 0,
      tone: 'rose',
    },
  ];

  const renderProjectPill = (project: Project) => (
    <button
      key={project.id}
      type='button'
      className={clsx('project-pill', { active: filters.projectId === project.id })}
      style={{ background: colorFor(project.name) }}
      onClick={() => handleSelect(project)}
      title={`${counts[project.id] ?? 0} 条任务`}
    >
      <div className='pill-title'>{project.name}</div>
      <span className='pill-count'>{counts[project.id] ?? 0} 项</span>
    </button>
  );

  const selectedProject = projects.find((p) => p.id === filters.projectId);

  return (
    <aside className='project-sidebar project-sidebar-modern'>
      <section className='panel author-card'>
        <div className='author-tag'>作者</div>
        <div className='author-name'>ZTE网络服务处</div>
        <div className='author-mail'>luo.fawen@zte.com.cn</div>
      </section>

      <section className='panel create-card'>
        <div className='panel-head'>
          <div>
            <h3>新建项目</h3>
            <p className='panel-desc'>一句话创建，立即加入列表。</p>
          </div>
        </div>
        <div className='new-project-row'>
          <input
            id='new-project-input'
            type='text'
            value={newProject}
            placeholder='项目名称'
            onChange={(event) => setNewProject(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') handleCreateProject();
            }}
          />
          <button type='button' className='primary-btn' onClick={handleCreateProject}>新建</button>
        </div>
      </section>

      <section className='panel manage-card'>
        <div className='panel-head'>
          <div>
            <h3>现有项目管理</h3>
            <p className='panel-desc'>选择后可编辑或删除，未选中则按钮禁用。</p>
          </div>
          {selectedProject && <span className='current-chip'>{selectedProject.name}</span>}
        </div>

        <div className='manage-actions'>
          <button
            type='button'
            className='ghost-btn'
            disabled={!selectedProject}
            onClick={() => selectedProject && handleRename(selectedProject)}
          >
            编辑
          </button>
          <button
            type='button'
            className='ghost-btn danger'
            disabled={!selectedProject}
            onClick={() => {
              if (!selectedProject) return;
              if (confirm('删除该项目？其任务将移至未分类。')) {
                deleteProject(selectedProject.id, { deleteTasks: false });
                setFilters({ projectId: undefined });
              }
            }}
          >
            删除
          </button>
        </div>

        <div className='pill-section'>
          <div className='pill-title-row'>
            <span>系统视图</span>
          </div>
          <div className='pill-grid'>
            {systemItems.map((item) => (
              <button
                key={item.key}
                type='button'
                className={clsx('project-pill tone', `tone-${item.tone}`, {
                  active:
                    (item.key === 'ALL' && filters.projectId === undefined) ||
                    (item.key === 'UNASSIGNED' && filters.projectId === ('UNASSIGNED' as string)) ||
                    (item.key === 'TRASH' && filters.projectId === trashId),
                })}
                onClick={() => {
                  if (item.key === 'ALL') handleSelect('ALL');
                  else if (item.key === 'UNASSIGNED') handleSelect('UNASSIGNED');
                  else {
                    const id = trashId ?? ensureProjectByName('回收站');
                    const proj = projects.find((p) => p.id === id);
                    if (proj) handleSelect(proj);
                  }
                }}
              >
                <div className='pill-title'>{item.label}</div>
                <span className='pill-count'>{item.count} 项</span>
              </button>
            ))}
          </div>
        </div>

        <div className='pill-section'>
          <div className='pill-title-row'>
            <span>项目列表</span>
            <span className='pill-hint'>按名称排序</span>
          </div>
          <div className='pill-grid'>
            {activeProjects.map(renderProjectPill)}
          </div>
        </div>
      </section>
    </aside>
  );
};

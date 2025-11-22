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

  

  const palette = ['#e6f0ff', '#fff7e6', '#e6fffa', '#fce7f3', '#f0fdf4', '#fef3c7', '#e0f2fe'];
  const colorFor = (key: string) => {
    const sum = Array.from(key).reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
    return palette[sum % palette.length];
  };

  const renderItem = (project: Project) => (
    <tr
      key={project.id}
      style={{ 
        background: colorFor(project.name),
        cursor: 'pointer',
        borderRadius: '6px',
        transition: 'all 0.2s ease'
      }}
      className={clsx('project-item', { active: filters.projectId === project.id, archived: project.archived })}
      onClick={() => handleSelect(project)}
      title={`${counts[project.id] ?? 0} 条任务`}
    >
      <td>{project.name}</td>
      <td style={{ textAlign: 'right', color: '#64748b', fontSize: '12px' }}>{counts[project.id] ?? 0} 项</td>
    </tr>
  );

  return (
    <aside className='project-sidebar'>
      <header className='sidebar-header'>
        <h2>项目</h2>
      </header>
      <div className='sidebar-section new-project'>
        <label htmlFor='new-project-input'>新建项目</label>
        <div className='new-project-row'>
          <input
            id='new-project-input'
            type='text'
            value={newProject}
            placeholder='项目名称'
            onChange={(event) => setNewProject(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                handleCreateProject();
              }
            }}
          />
          <button type='button' onClick={handleCreateProject}>新建</button>
        </div>
      </div>
      <div className='project-toolbar'>
        <button
          type='button'
          disabled={!projects.find(p => p.id === filters.projectId)}
          onClick={() => {
            const p = projects.find(p => p.id === filters.projectId);
            if (!p) return;
            handleRename(p);
          }}
          title='编辑当前项目'
        >编辑</button>
        <button
          type='button'
          disabled={!projects.find(p => p.id === filters.projectId)}
          onClick={() => {
            const p = projects.find(p => p.id === filters.projectId);
            if (!p) return;
            if (confirm('删除该项目？其任务将移至未分类。')) {
              deleteProject(p.id, { deleteTasks: false });
              setFilters({ projectId: undefined });
            }
          }}
          title='删除当前项目'
        >删除</button>
      </div>
      <div className='project-list compact'>
        <div className='sidebar-subheader'>系统视图</div>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 4px' }}>
          <colgroup>
            <col />
            <col style={{ width: 60 }} />
          </colgroup>
          <tbody>
            <tr 
              style={{ 
                background: '#f0fdf4', 
                cursor: 'pointer',
                borderRadius: '6px',
                transition: 'all 0.2s ease'
              }}
              className={clsx('project-item', { active: filters.projectId === undefined })}
              onClick={() => handleSelect('ALL')}
              title='汇总所有项目'
            >
              <td>汇总</td>
              <td style={{ textAlign: 'right', color: '#64748b', fontSize: '12px' }}>{visibleTasks.length} 项</td>
            </tr>
            <tr 
              style={{ 
                background: '#fff7e6', 
                cursor: 'pointer',
                borderRadius: '6px',
                transition: 'all 0.2s ease'
              }}
              className={clsx('project-item', { active: filters.projectId === ('UNASSIGNED' as string) })}
              onClick={() => handleSelect('UNASSIGNED')}
              title='未分类任务'
            >
              <td>未分类</td>
              <td style={{ textAlign: 'right', color: '#64748b', fontSize: '12px' }}>{tasks.filter(t => !t.projectId).length} 项</td>
            </tr>
            {(() => {
              const trashIdLocal = trashId;
              const count = trashIdLocal ? tasks.filter(t => t.projectId === trashIdLocal).length : 0;
              return (
                <tr 
                  style={{ 
                    background: '#fee2e2', 
                    cursor: 'pointer',
                    borderRadius: '6px',
                    transition: 'all 0.2s ease'
                  }}
                  className={clsx('project-item', { active: filters.projectId === trashIdLocal })}
                  onClick={() => {
                    const id = trashIdLocal ?? ensureProjectByName('回收站');
                    const proj = projects.find(p => p.id === id);
                    if (proj) handleSelect(proj);
                  }}
                  title='回收站（可恢复或清理）'
                >
                  <td>回收站</td>
                  <td style={{ textAlign: 'right', color: '#b91c1c', fontSize: '12px' }}>{count} 项</td>
                </tr>
              );
            })()}
          </tbody>
        </table>
        <div className='sidebar-subheader' style={{ marginTop: 8 }}>项目列表</div>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 4px' }}>
          <colgroup>
            <col />
            <col style={{ width: 60 }} />
          </colgroup>
          <tbody>
            {activeProjects.map(renderItem)}
          </tbody>
        </table>
        
      </div>
    </aside>
  );
};

import { useMemo } from 'react';
import { useAppStoreShallow } from '../state/appStore';
import { filterTasks, groupTasks, parseSearchInput, sortTasks } from '../utils/taskUtils';

export const useVisibleTasks = () => {
  const { tasks, filters, sortRules, projects, groupBy } = useAppStoreShallow((state) => ({
    tasks: state.tasks,
    filters: state.filters,
    sortRules: state.sortRules,
    projects: state.projects,
    groupBy: state.groupBy,
  }));

  const projectMap = useMemo(() => {
    return projects.reduce<Record<string, (typeof projects)[number]>>((acc, project) => {
      acc[project.id] = project;
      return acc;
    }, {});
  }, [projects]);

  const parsedSearch = useMemo(() => parseSearchInput(filters.search), [filters.search]);

  const filtered = useMemo(
    () => filterTasks(tasks, filters, parsedSearch, projectMap),
    [tasks, filters, parsedSearch, projectMap],
  );

  const sorted = useMemo(
    () => sortTasks(filtered, sortRules, projectMap),
    [filtered, sortRules, projectMap],
  );

  const grouped = useMemo(
    () => groupTasks(sorted, groupBy, projectMap),
    [sorted, groupBy, projectMap],
  );

  return { tasks: sorted, grouped, projectMap, filters, sortRules };
};


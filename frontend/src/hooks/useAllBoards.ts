import { useMemo } from 'react';
import { useProjects } from './useProjects';
import { useProjectGroups } from './useProjectGroups';
import type { Project, ProjectGroup } from 'shared/types';

export interface GroupedProjects {
  group: ProjectGroup | null; // null = ungrouped
  projects: Project[];
}

export interface UseAllBoardsResult {
  groupedProjects: GroupedProjects[];
  ungroupedProjects: Project[];
  groups: ProjectGroup[];
  projects: Project[];
  projectsById: Record<string, Project>;
  groupsById: Record<string, ProjectGroup>;
  isLoading: boolean;
  error: Error | null;
}

export function useAllBoards(): UseAllBoardsResult {
  const {
    projects,
    projectsById,
    isLoading: projectsLoading,
    error: projectsError,
  } = useProjects();
  const {
    groups,
    groupsById,
    isLoading: groupsLoading,
    error: groupsError,
  } = useProjectGroups();

  const groupedProjects = useMemo(() => {
    const result: GroupedProjects[] = [];

    // Add grouped projects (in group position order)
    for (const group of groups) {
      const groupProjects = projects.filter((p) => p.group_id === group.id);
      result.push({ group, projects: groupProjects });
    }

    // Add ungrouped projects at the end
    const ungrouped = projects.filter((p) => !p.group_id);
    if (ungrouped.length > 0 || groups.length === 0) {
      result.push({ group: null, projects: ungrouped });
    }

    return result;
  }, [projects, groups]);

  const ungroupedProjects = useMemo(
    () => projects.filter((p) => !p.group_id),
    [projects]
  );

  return {
    groupedProjects,
    ungroupedProjects,
    groups,
    projects,
    projectsById,
    groupsById,
    isLoading: projectsLoading || groupsLoading,
    error: projectsError || groupsError,
  };
}

import { useMemo } from 'react';
import { useProjects } from './useProjects';

export function useProject(projectId?: string, options: { enabled?: boolean } = {}) {
  const { projectsById, isLoading, error } = useProjects();
  
  const project = useMemo(() => {
    if (!projectId) return undefined;
    return projectsById[projectId];
  }, [projectId, projectsById]);

  return {
    data: project,
    isLoading: (options.enabled ?? true) ? isLoading : false,
    error,
  };
}

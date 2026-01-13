import { useCallback, useMemo } from 'react';
import { useJsonPatchWsStream } from './useJsonPatchWsStream';
import type { Project } from 'shared/types';

type ProjectsState = {
  projects: Record<string, Project>;
};

export interface UseProjectsResult {
  projects: Project[];
  projectsById: Record<string, Project>;
  isLoading: boolean;
  isConnected: boolean;
  error: Error | null;
}

export function useProjects(): UseProjectsResult {
  const endpoint = '/api/projects/stream/ws';

  const initialData = useCallback((): ProjectsState => ({ projects: {} }), []);

  const { data, isConnected, isInitialized, error } =
    useJsonPatchWsStream<ProjectsState>(endpoint, true, initialData);

  const projectsById = useMemo(() => data?.projects ?? {}, [data]);

  const projects = useMemo(() => {
    // Backend now sorts by activity, so respect that order
    return Object.values(projectsById);
  }, [projectsById]);

  const projectsData = data ? projects : undefined;
  const errorObj = useMemo(() => (error ? new Error(error) : null), [error]);

  return {
    projects: projectsData ?? [],
    projectsById,
    isLoading: !isInitialized && !error,
    isConnected,
    error: errorObj,
  };
}

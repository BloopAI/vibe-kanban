import { useCallback, useMemo, useState, useEffect } from 'react';
import { useJsonPatchWsStream } from './useJsonPatchWsStream';
import type { Project } from 'shared/types';
import { resolveProjectFromParam } from '@/lib/url-utils';
import { useAuth } from '@clerk/clerk-react';

type ProjectsState = {
  projects: Record<string, Project>;
};

export interface UseProjectsResult {
  projects: Project[];
  projectsById: Record<string, Project>;
  isLoading: boolean;
  isConnected: boolean;
  error: Error | null;
  resolveProject: (param: string) => Project | undefined;
  addProject: (project: Project) => void;
  updateProject: (project: Project) => void;
  removeProject: (projectId: string) => void;
}

// Shared state for optimistic updates across all useProjects instances
let optimisticProjects: Record<string, Project> = {};
const listeners = new Set<() => void>();

function notifyListeners() {
  listeners.forEach((listener) => listener());
}

function addOptimisticProject(project: Project) {
  optimisticProjects = { ...optimisticProjects, [project.id]: project };
  notifyListeners();
}

function updateOptimisticProject(project: Project) {
  optimisticProjects = { ...optimisticProjects, [project.id]: project };
  notifyListeners();
}

function removeOptimisticProject(projectId: string) {
  const { [projectId]: _, ...rest } = optimisticProjects;
  optimisticProjects = rest;
  notifyListeners();
}

export function useProjects(): UseProjectsResult {
  const endpoint = '/api/projects/stream/ws';
  const { getToken, isLoaded } = useAuth();
  const [token, setToken] = useState<string | null>(null);
  const [, forceUpdate] = useState({});

  useEffect(() => {
    if (isLoaded) {
      getToken().then(setToken).catch(console.error);
    }
  }, [getToken, isLoaded]);

  // Subscribe to optimistic updates
  useEffect(() => {
    const listener = () => forceUpdate({});
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const initialData = useCallback((): ProjectsState => ({ projects: {} }), []);

  const { data, isConnected, error } = useJsonPatchWsStream<ProjectsState>(
    endpoint,
    !!token, // Only enable when token is available
    initialData,
    { token }
  );

  // Merge WebSocket data with optimistic updates
  // WebSocket data takes precedence when it arrives
  const projectsById = useMemo(() => {
    const wsProjects = data?.projects ?? {};
    // Only include optimistic projects that aren't in WebSocket data yet
    const merged = { ...optimisticProjects };
    Object.entries(wsProjects).forEach(([id, project]) => {
      merged[id] = project;
      // Clean up optimistic entry once WebSocket has the data
      if (optimisticProjects[id]) {
        delete optimisticProjects[id];
      }
    });
    return merged;
  }, [data]);

  const projects = useMemo(() => {
    return Object.values(projectsById).sort(
      (a, b) =>
        new Date(b.created_at as unknown as string).getTime() -
        new Date(a.created_at as unknown as string).getTime()
    );
  }, [projectsById]);

  const projectsData = data ? projects : undefined;
  const errorObj = useMemo(() => (error ? new Error(error) : null), [error]);

  const resolveProject = useMemo(
    () => (param: string) => resolveProjectFromParam(param, projects, projectsById),
    [projects, projectsById]
  );

  const addProject = useCallback((project: Project) => {
    addOptimisticProject(project);
  }, []);

  const updateProject = useCallback((project: Project) => {
    updateOptimisticProject(project);
  }, []);

  const removeProject = useCallback((projectId: string) => {
    removeOptimisticProject(projectId);
  }, []);

  return {
    projects: projectsData ?? [],
    projectsById,
    isLoading: !data && !error,
    isConnected,
    error: errorObj,
    resolveProject,
    addProject,
    updateProject,
    removeProject,
  };
}

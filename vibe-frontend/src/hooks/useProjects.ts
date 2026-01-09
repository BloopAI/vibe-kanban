import { useCallback, useMemo, useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useJsonPatchWsStream } from './useJsonPatchWsStream';
import type { Project } from 'shared/types';
import { resolveProjectFromParam } from '@/lib/url-utils';
import { useClerkAuth } from '@/hooks/auth/useClerkAuth';

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

// Detect if we're running in cloud mode (when VITE_API_URL is set to external API)
// In cloud mode, WebSocket streaming is not available, so we use REST API polling
const API_BASE_URL = import.meta.env.VITE_API_URL || '';
const isCloudMode = !!API_BASE_URL;

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
  const { [projectId]: _removed, ...rest } = optimisticProjects;
  void _removed; // Ignore unused variable
  optimisticProjects = rest;
  notifyListeners();
}

export function useProjects(): UseProjectsResult {
  const endpoint = '/api/projects/stream/ws';
  const { getToken, isLoaded } = useClerkAuth();
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

  // In cloud mode, disable WebSocket and use REST polling instead
  const { data: wsData, isConnected, error: wsError } = useJsonPatchWsStream<ProjectsState>(
    endpoint,
    !isCloudMode && !!token, // Disable WebSocket in cloud mode
    initialData,
    { token }
  );

  // REST API polling for cloud mode using TanStack Query for automatic deduplication
  const restQuery = useQuery({
    queryKey: ['projects', 'list'],
    queryFn: async () => {
      const response = await fetch(`${API_BASE_URL}/api/projects`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch projects: ${response.status}`);
      }

      const result = await response.json();
      if (result.success && Array.isArray(result.data)) {
        const projectsMap: Record<string, Project> = {};
        result.data.forEach((project: Project) => {
          projectsMap[project.id] = project;
        });
        return projectsMap;
      }
      return {} as Record<string, Project>;
    },
    enabled: isCloudMode && !!token,
    staleTime: 30000, // Data considered fresh for 30 seconds (prevents duplicate requests)
    refetchInterval: 60000, // Poll every 60 seconds (increased from 30s to reduce rate limiting)
    refetchOnWindowFocus: false, // Don't refetch when tab gets focus
    refetchOnReconnect: false, // Don't refetch on network reconnect
    retry: 1, // Only retry once on failure
    retryDelay: 5000, // Wait 5 seconds before retrying
  });

  const restProjects = restQuery.data ?? {};
  const restLoading = restQuery.isLoading;
  const restError = restQuery.error?.message ?? null;

  // Use REST data in cloud mode, WebSocket data otherwise
  const data = useMemo(
    () => (isCloudMode ? { projects: restProjects } : wsData),
    [restProjects, wsData]
  );
  const error = isCloudMode ? restError : wsError;

  // Clean up optimistic entries when data arrives (in useEffect, not useMemo)
  useEffect(() => {
    const fetchedProjects = data?.projects ?? {};
    const idsToClean = Object.keys(optimisticProjects).filter(id => fetchedProjects[id]);
    if (idsToClean.length > 0) {
      idsToClean.forEach(id => {
        delete optimisticProjects[id];
      });
      // No need to notify - the data change will trigger re-render
    }
  }, [data]);

  // Merge fetched data with optimistic updates
  // Fetched data takes precedence when it arrives
  const projectsById = useMemo(() => {
    const fetchedProjects = data?.projects ?? {};
    // Merge: optimistic projects first, then fetched data overwrites
    return { ...optimisticProjects, ...fetchedProjects };
  }, [data]);

  const projects = useMemo(() => {
    return Object.values(projectsById).sort(
      (a, b) =>
        new Date(b.created_at as unknown as string).getTime() -
        new Date(a.created_at as unknown as string).getTime()
    );
  }, [projectsById]);

  const hasData = isCloudMode ? !restLoading : !!wsData;
  const projectsData = hasData ? projects : undefined;
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
    isLoading: isCloudMode ? restLoading : (!wsData && !wsError),
    isConnected: isCloudMode ? !restError : isConnected,
    error: errorObj,
    resolveProject,
    addProject,
    updateProject,
    removeProject,
  };
}

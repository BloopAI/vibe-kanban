import { useCallback, useMemo, useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
// In cloud mode, WebSocket streaming is not available, so we use REST API with TanStack Query
const API_BASE_URL = import.meta.env.VITE_API_URL || '';
const isCloudMode = !!API_BASE_URL;

// Helper to check if error is a rate limit (429)
function isRateLimitError(error: unknown): boolean {
  if (error instanceof Error) {
    return error.message.includes('429') || error.message.includes('Too Many Requests');
  }
  return false;
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
  const { [projectId]: _removed, ...rest } = optimisticProjects;
  void _removed; // Ignore unused variable
  optimisticProjects = rest;
  notifyListeners();
}

// Query key for TanStack Query (cloud mode)
export const projectsKeys = {
  all: ['projects'] as const,
  list: () => [...projectsKeys.all, 'list'] as const,
};

// Fetch function for TanStack Query (cloud mode)
async function fetchProjects(token: string | null): Promise<Record<string, Project>> {
  if (!token) return {};

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
  return {};
}

export function useProjects(): UseProjectsResult {
  const endpoint = '/api/projects/stream/ws';
  const { getToken, isLoaded, isSignedIn } = useClerkAuth();
  const [token, setToken] = useState<string | null>(null);
  const [, forceUpdate] = useState({});
  const queryClient = useQueryClient();

  useEffect(() => {
    // Only fetch token when user is loaded AND signed in
    if (isLoaded && isSignedIn) {
      getToken().then(setToken).catch(console.error);
    } else if (isLoaded && !isSignedIn) {
      // Clear token if user signs out
      setToken(null);
    }
  }, [getToken, isLoaded, isSignedIn]);

  // Subscribe to optimistic updates
  useEffect(() => {
    const listener = () => forceUpdate({});
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const initialData = useCallback((): ProjectsState => ({ projects: {} }), []);

  // In cloud mode, disable WebSocket and use TanStack Query instead
  const { data: wsData, isConnected, error: wsError } = useJsonPatchWsStream<ProjectsState>(
    endpoint,
    !isCloudMode && isSignedIn && !!token, // Disable WebSocket in cloud mode or when not signed in
    initialData,
    { token }
  );

  // TanStack Query for cloud mode - provides request deduplication and caching
  const {
    data: restProjects = {},
    isLoading: restLoading,
    error: restError
  } = useQuery({
    queryKey: projectsKeys.list(),
    queryFn: () => fetchProjects(token),
    enabled: isCloudMode && isSignedIn && !!token,
    staleTime: 5 * 60 * 1000, // 5 minutes - projects don't change frequently
    gcTime: 15 * 60 * 1000, // 15 minutes cache retention
    refetchInterval: 5 * 60 * 1000, // Poll every 5 minutes (not 30 seconds!)
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: (failureCount, error) => {
      // Never retry rate limit errors - this amplifies the problem
      if (isRateLimitError(error)) return false;
      return failureCount < 1;
    },
    retryDelay: 60000, // 60 seconds - respect rate limit window
  });

  // Use REST data in cloud mode, WebSocket data otherwise
  const data = useMemo(
    () => (isCloudMode ? { projects: restProjects } : wsData),
    [restProjects, wsData]
  );
  const error = isCloudMode
    ? (restError instanceof Error ? restError.message : restError ? String(restError) : null)
    : wsError;

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
    // Also update TanStack Query cache for immediate UI update
    if (isCloudMode) {
      queryClient.setQueryData(projectsKeys.list(), (old: Record<string, Project> | undefined) => {
        return { ...old, [project.id]: project };
      });
    }
  }, [queryClient]);

  const updateProject = useCallback((project: Project) => {
    updateOptimisticProject(project);
    if (isCloudMode) {
      queryClient.setQueryData(projectsKeys.list(), (old: Record<string, Project> | undefined) => {
        return { ...old, [project.id]: project };
      });
    }
  }, [queryClient]);

  const removeProject = useCallback((projectId: string) => {
    removeOptimisticProject(projectId);
    if (isCloudMode) {
      queryClient.setQueryData(projectsKeys.list(), (old: Record<string, Project> | undefined) => {
        if (!old) return {};
        const { [projectId]: _removed, ...rest } = old;
        void _removed;
        return rest;
      });
    }
  }, [queryClient]);

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

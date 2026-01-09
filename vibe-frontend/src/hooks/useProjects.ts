import { useCallback, useMemo, useState, useEffect, useRef } from 'react';
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

  // REST API polling state (for cloud mode)
  const [restProjects, setRestProjects] = useState<Record<string, Project>>({});
  const [restLoading, setRestLoading] = useState(isCloudMode);
  const [restError, setRestError] = useState<string | null>(null);
  const pollingIntervalRef = useRef<number | null>(null);

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

  // REST API polling for cloud mode
  useEffect(() => {
    if (!isCloudMode || !token) return;

    const fetchProjects = async () => {
      try {
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
          setRestProjects(projectsMap);
          setRestError(null);
        }
      } catch (err) {
        console.error('Failed to fetch projects:', err);
        setRestError(err instanceof Error ? err.message : 'Failed to fetch projects');
      } finally {
        setRestLoading(false);
      }
    };

    // Initial fetch
    fetchProjects();

    // Poll every 30 seconds in cloud mode
    pollingIntervalRef.current = window.setInterval(fetchProjects, 30000);

    return () => {
      if (pollingIntervalRef.current) {
        window.clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [token]);

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

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

  // Clean up optimistic entries when WebSocket data arrives (in useEffect, not useMemo)
  useEffect(() => {
    const wsProjects = data?.projects ?? {};
    const idsToClean = Object.keys(optimisticProjects).filter(id => wsProjects[id]);
    if (idsToClean.length > 0) {
      idsToClean.forEach(id => {
        delete optimisticProjects[id];
      });
      // No need to notify - the data change will trigger re-render
    }
  }, [data]);

  // Merge WebSocket data with optimistic updates
  // WebSocket data takes precedence when it arrives
  const projectsById = useMemo(() => {
    const wsProjects = data?.projects ?? {};
    // Merge: optimistic projects first, then WebSocket overwrites
    return { ...optimisticProjects, ...wsProjects };
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

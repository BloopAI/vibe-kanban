import {
  createContext,
  useContext,
  ReactNode,
  useMemo,
  useEffect,
} from 'react';
import { useLocation } from 'react-router-dom';
import type { Project } from 'shared/types';
import { useProjects } from '@/hooks/useProjects';

interface ProjectContextValue {
  projectId: string | undefined;
  project: Project | undefined;
  isLoading: boolean;
  error: Error | null;
  isError: boolean;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

interface ProjectProviderProps {
  children: ReactNode;
}

export function ProjectProvider({ children }: ProjectProviderProps) {
  const location = useLocation();

  // Extract project param (can be UUID or slug) from current route path
  const projectParam = useMemo(() => {
    const match = location.pathname.match(/^\/projects\/([^/]+)/);
    return match ? match[1] : undefined;
  }, [location.pathname]);

  const { resolveProject, isLoading, error } = useProjects();

  // Resolve the project - handles both UUID and slug lookups
  const project = useMemo(
    () => projectParam ? resolveProject(projectParam) : undefined,
    [projectParam, resolveProject]
  );

  // The actual project ID (UUID) - use resolved project's ID
  const projectId = project?.id;

  const value = useMemo(
    () => ({
      projectId,
      project,
      isLoading,
      error,
      isError: !!error,
    }),
    [projectId, project, isLoading, error]
  );

  // Centralized page title management
  useEffect(() => {
    if (project) {
      document.title = `${project.name} | iKanban`;
    } else {
      document.title = 'iKanban';
    }
  }, [project]);

  return (
    <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>
  );
}

export function useProject(): ProjectContextValue {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error('useProject must be used within a ProjectProvider');
  }
  return context;
}

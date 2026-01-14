import {
  createContext,
  useContext,
  ReactNode,
  useMemo,
  useEffect,
} from 'react';
import type { Project } from 'shared/types';
import { useProjects } from '@/hooks/useProjects';
import { ProjectContext } from './ProjectContext';

interface ProjectContextValue {
  projectId: string | undefined;
  project: Project | undefined;
  isLoading: boolean;
  error: Error | null;
  isError: boolean;
}

const ProjectOverrideContext = createContext<ProjectContextValue | null>(null);

interface ProjectProviderOverrideProps {
  projectId: string;
  children: ReactNode;
  /** If true, updates the document title with the project name */
  updateDocumentTitle?: boolean;
}

/**
 * A variant of ProjectProvider that accepts projectId as a prop
 * instead of extracting it from the URL. This allows embedding
 * project-specific components (like ProjectTasks) anywhere in the app.
 */
export function ProjectProviderOverride({
  projectId,
  children,
  updateDocumentTitle = false,
}: ProjectProviderOverrideProps) {
  const { projectsById, isLoading, error } = useProjects();
  const project = projectsById[projectId];

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

  // Optionally update document title
  useEffect(() => {
    if (!updateDocumentTitle) return;
    if (project) {
      document.title = `${project.name} | vibe-kanban`;
    }
    return () => {
      document.title = 'vibe-kanban';
    };
  }, [project, updateDocumentTitle]);

  return (
    <ProjectOverrideContext.Provider value={value}>
      {/* Also provide the regular ProjectContext for components using useProject() */}
      <ProjectContext.Provider value={value}>
        {children}
      </ProjectContext.Provider>
    </ProjectOverrideContext.Provider>
  );
}

/**
 * Hook to use the overridden project context.
 * Falls back to checking ProjectOverrideContext first.
 */
export function useProjectOverride(): ProjectContextValue {
  const context = useContext(ProjectOverrideContext);
  if (!context) {
    throw new Error(
      'useProjectOverride must be used within a ProjectProviderOverride'
    );
  }
  return context;
}

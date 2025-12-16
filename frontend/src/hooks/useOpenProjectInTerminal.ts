import { useCallback } from 'react';
import { projectsApi } from '@/lib/api';
import type { Project } from 'shared/types';

export function useOpenProjectInTerminal(project: Project | null) {
  return useCallback(async () => {
    if (!project) return;

    try {
      await projectsApi.openTerminal(project.id);
    } catch (err) {
      console.error('Failed to open project in terminal:', err);
      // Terminal opening failures are logged but don't require user intervention
      // since the terminal application might not be available
    }
  }, [project]);
}

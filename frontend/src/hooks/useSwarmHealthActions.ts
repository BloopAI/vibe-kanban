import { useCallback, useState } from 'react';
import { projectsApi } from '@/lib/api/projects';
import { useProjectMutations } from './useProjectMutations';
import type { UnlinkSwarmRequest } from 'shared/types';

export interface FixAllResult {
  successCount: number;
  errorCount: number;
  errors: Array<{ projectId: string; projectName: string; error: unknown }>;
}

interface UseSwarmHealthActionsOptions {
  onFixAllSuccess?: (result: FixAllResult) => void;
  onFixAllError?: (error: unknown) => void;
  onFixAllPartial?: (result: FixAllResult) => void;
}

export function useSwarmHealthActions(options?: UseSwarmHealthActionsOptions) {
  const [isFixing, setIsFixing] = useState(false);
  const { unlinkFromSwarm } = useProjectMutations();

  const { onFixAllSuccess, onFixAllError, onFixAllPartial } = options ?? {};
  const { mutateAsync: unlinkAsync } = unlinkFromSwarm;

  const fixAllIssues = useCallback(async (): Promise<FixAllResult> => {
    setIsFixing(true);
    const result: FixAllResult = {
      successCount: 0,
      errorCount: 0,
      errors: [],
    };

    try {
      // Fetch all projects using API client
      const projects = await projectsApi.getAll();

      // Check all health statuses in parallel
      const healthResults = await Promise.allSettled(
        projects.map(async (project) => {
          const health = await projectsApi.getSyncHealth(project.id);
          return { project, health };
        })
      );

      // Log health-check failures, collect projects needing fix
      const toFix: typeof projects = [];
      for (const res of healthResults) {
        if (res.status === 'rejected') {
          console.error('Failed to get sync health:', res.reason);
        } else if (res.value.health.has_sync_issues) {
          toFix.push(res.value.project);
        }
      }

      // Batch all unlinks in parallel
      const unlinkResults = await Promise.allSettled(
        toFix.map(async (project) => {
          const unlinkRequest: UnlinkSwarmRequest = { notify_hive: false };
          await unlinkAsync({ projectId: project.id, data: unlinkRequest });
          return project;
        })
      );

      // Tally results
      toFix.forEach((project, i) => {
        const res = unlinkResults[i];
        if (res.status === 'fulfilled') {
          result.successCount++;
        } else {
          console.error(`Failed to unlink project ${project.name}:`, res.reason);
          result.errorCount++;
          result.errors.push({
            projectId: project.id,
            projectName: project.name,
            error: res.reason,
          });
        }
      });

      // Call appropriate callback based on result
      if (result.errorCount === 0) {
        onFixAllSuccess?.(result);
      } else {
        onFixAllPartial?.(result);
      }

      return result;
    } catch (error) {
      console.error('Failed to fix swarm issues:', error);
      onFixAllError?.(error);
      throw error;
    } finally {
      setIsFixing(false);
    }
  }, [unlinkAsync, onFixAllSuccess, onFixAllError, onFixAllPartial]);

  return {
    fixAllIssues,
    isFixing,
  };
}

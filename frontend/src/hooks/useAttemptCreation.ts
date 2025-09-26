import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { attemptsApi } from '@/lib/api';
import { useTaskViewManager } from '@/hooks/useTaskViewManager';
import type { TaskAttempt } from 'shared/types';
import type { ExecutorProfileId } from 'shared/types';
import { queryKey as pbQk } from './useProjectBranches';

export function useAttemptCreation(taskId: string) {
  const queryClient = useQueryClient();
  const { projectId } = useParams<{ projectId: string }>();
  const { navigateToAttempt } = useTaskViewManager();

  const mutation = useMutation({
    mutationFn: ({
      profile,
      baseBranch,
    }: {
      profile: ExecutorProfileId;
      baseBranch: string;
    }) =>
      attemptsApi.create({
        task_id: taskId,
        executor_profile_id: profile,
        base_branch: baseBranch,
      }),
    onSuccess: (newAttempt: TaskAttempt) => {
      // Optimistically add to cache to prevent UI flicker
      queryClient.setQueryData(
        ['taskAttempts', taskId],
        (old: TaskAttempt[] = []) => [newAttempt, ...old]
      );

      // Navigate to new attempt (triggers polling switch)
      if (projectId) {
        navigateToAttempt(projectId, taskId, newAttempt.id);
      }
      // Refresh project branches as a new attempt creates a new branch
      queryClient.invalidateQueries({
        queryKey: pbQk(projectId),
      });
    },
  });

  return {
    createAttempt: mutation.mutateAsync,
    isCreating: mutation.isPending,
    error: mutation.error,
  };
}

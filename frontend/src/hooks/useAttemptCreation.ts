import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { attemptsApi } from '@/lib/api';
import { paths } from '@/lib/paths';
import type { TaskAttempt } from 'shared/types';
import type { ExecutorProfileId } from 'shared/types';

export function useAttemptCreation(taskId: string) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { projectId } = useParams<{ projectId: string }>();

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
      queryClient.setQueryData(
        ['taskAttempts', taskId],
        (old: TaskAttempt[] = []) => [newAttempt, ...old]
      );

      if (projectId) {
        navigate(paths.attempt(projectId, taskId, newAttempt.id));
      }
    },
  });

  return {
    createAttempt: mutation.mutateAsync,
    isCreating: mutation.isPending,
    error: mutation.error,
  };
}

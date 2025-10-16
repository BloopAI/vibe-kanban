import { useMutation, useQueryClient } from '@tanstack/react-query';
import { attemptsApi } from '@/lib/api';
import type { TaskAttempt, ExecutorProfileId } from 'shared/types';

type CreateAttemptArgs = {
  profile: ExecutorProfileId;
  baseBranch: string;
};

type UseAttemptCreationArgs = {
  taskId: string;
  onSuccess?: (attempt: TaskAttempt) => void;
};

export function useAttemptCreation({
  taskId,
  onSuccess,
}: UseAttemptCreationArgs) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: ({ profile, baseBranch }: CreateAttemptArgs) =>
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
      onSuccess?.(newAttempt);
    },
  });

  return {
    createAttempt: mutation.mutateAsync,
    isCreating: mutation.isPending,
    error: mutation.error,
  };
}

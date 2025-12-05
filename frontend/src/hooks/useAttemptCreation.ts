import { useMutation, useQueryClient } from '@tanstack/react-query';
import { attemptsApi } from '@/lib/api';
import type { TaskAttempt, ExecutorProfileId, RepoBranch } from 'shared/types';

type CreateAttemptArgs = {
  profile: ExecutorProfileId;
  baseBranches: RepoBranch[];
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
    mutationFn: ({ profile, baseBranches }: CreateAttemptArgs) =>
      attemptsApi.create({
        task_id: taskId,
        executor_profile_id: profile,
        base_branches: baseBranches,
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

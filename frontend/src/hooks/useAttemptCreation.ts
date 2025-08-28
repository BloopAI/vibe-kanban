import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { attemptsApi } from '@/lib/api';
import type { ProfileVariantLabel, TaskAttempt } from 'shared/types';

export function useAttemptCreation(taskId: string) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { projectId } = useParams<{ projectId: string }>();

  const mutation = useMutation({
    mutationFn: ({
      profile,
      baseBranch,
    }: {
      profile: ProfileVariantLabel;
      baseBranch: string;
    }) =>
      attemptsApi.create({
        task_id: taskId,
        profile_variant_label: profile,
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
        navigate(
          `/projects/${projectId}/tasks/${taskId}/attempts/${newAttempt.id}`,
          { replace: true }
        );
      }
    },
  });

  return {
    createAttempt: mutation.mutateAsync,
    isCreating: mutation.isPending,
    error: mutation.error,
  };
}

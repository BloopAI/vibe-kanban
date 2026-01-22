import { useMutation, useQueryClient } from '@tanstack/react-query';
import { tasksApi } from '@/lib/api';

export function useRalphAutoContinue(taskId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (autoContinue: boolean) =>
      tasksApi.updateRalphAutoContinue(taskId, { auto_continue: autoContinue }),
    onSuccess: () => {
      // Invalidate tasks to refresh the task data with new auto_continue value
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

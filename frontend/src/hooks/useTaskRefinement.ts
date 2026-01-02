import { useMutation } from '@tanstack/react-query';
import { tasksApi } from '@/lib/api';
import type { RefineDescriptionRequest, RefineDescriptionResponse } from 'shared/types';

export function useTaskRefinement() {
  return useMutation({
    mutationFn: (data: RefineDescriptionRequest): Promise<RefineDescriptionResponse> =>
      tasksApi.refineDescription(data),
    onError: (err) => {
      console.error('Failed to refine task description:', err);
    },
  });
}

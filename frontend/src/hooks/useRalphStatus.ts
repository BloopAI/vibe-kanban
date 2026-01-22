import { useQuery } from '@tanstack/react-query';
import { tasksApi } from '@/lib/api';
import type { RalphStatusResponse } from 'shared/types';

export const ralphStatusKeys = {
  all: ['ralph-status'] as const,
  byTaskId: (taskId: string | undefined) => ['ralph-status', taskId] as const,
};

type Options = {
  enabled?: boolean;
};

export function useRalphStatus(taskId?: string, opts?: Options) {
  const enabled = (opts?.enabled ?? true) && !!taskId;

  return useQuery<RalphStatusResponse>({
    queryKey: ralphStatusKeys.byTaskId(taskId),
    queryFn: () => tasksApi.getRalphStatus(taskId!),
    enabled,
  });
}

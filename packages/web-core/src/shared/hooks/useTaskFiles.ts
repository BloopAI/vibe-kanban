import { useQuery } from '@tanstack/react-query';
import { filesApi } from '@/shared/lib/api';
import type { FileResponse } from 'shared/types';

export function useTaskFiles(taskId?: string) {
  return useQuery<FileResponse[]>({
    queryKey: ['taskFiles', taskId],
    queryFn: () => filesApi.getTaskFiles(taskId!),
    enabled: !!taskId,
  });
}

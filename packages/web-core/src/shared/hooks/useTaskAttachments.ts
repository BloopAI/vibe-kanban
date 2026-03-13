import { useQuery } from '@tanstack/react-query';
import { attachmentsApi } from '@/shared/lib/api';
import type { AttachmentResponse } from 'shared/types';

export function useTaskAttachments(taskId?: string) {
  return useQuery<AttachmentResponse[]>({
    queryKey: ['taskAttachments', taskId],
    queryFn: () => attachmentsApi.getTaskAttachments(taskId!),
    enabled: !!taskId,
  });
}

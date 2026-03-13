import { useCallback } from 'react';
import { attachmentsApi } from '@/shared/lib/api';
import type { AttachmentResponse } from 'shared/types';

export function useAttachmentUpload() {
  const upload = useCallback(
    async (file: File): Promise<AttachmentResponse> => {
      return attachmentsApi.upload(file);
    },
    []
  );

  const uploadForTask = useCallback(
    async (taskId: string, file: File): Promise<AttachmentResponse> => {
      return attachmentsApi.uploadForTask(taskId, file);
    },
    []
  );

  const deleteAttachment = useCallback(
    async (attachmentId: string): Promise<void> => {
      return attachmentsApi.delete(attachmentId);
    },
    []
  );

  return {
    upload,
    uploadForTask,
    deleteAttachment,
  };
}

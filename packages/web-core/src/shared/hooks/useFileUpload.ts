import { useCallback } from 'react';
import { filesApi } from '@/shared/lib/api';
import type { FileResponse } from 'shared/types';

export function useFileUpload() {
  const upload = useCallback(async (file: File): Promise<FileResponse> => {
    return filesApi.upload(file);
  }, []);

  const uploadForTask = useCallback(
    async (taskId: string, file: File): Promise<FileResponse> => {
      return filesApi.uploadForTask(taskId, file);
    },
    []
  );

  const deleteFile = useCallback(async (fileId: string): Promise<void> => {
    return filesApi.delete(fileId);
  }, []);

  return {
    upload,
    uploadForTask,
    deleteFile,
  };
}

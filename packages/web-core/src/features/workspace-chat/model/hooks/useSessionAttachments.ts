import { useCallback, useState } from 'react';
import { filesApi } from '@/shared/lib/api';
import type { LocalFileMetadata } from '@vibe/ui/components/WorkspaceContext';
import {
  buildWorkspaceAttachmentMarkdown,
  toLocalFileMetadata,
} from '@/shared/lib/workspaceAttachments';
import type { FileResponse } from 'shared/types';

/**
 * Hook for handling file attachments in session follow-up messages.
 * Uploads files to the workspace and calls back with markdown to insert.
 * Also tracks uploaded files for immediate preview in the editor.
 */
export function useSessionAttachments(
  workspaceId: string | undefined,
  sessionId: string | undefined,
  onInsertMarkdown: (markdown: string) => void
) {
  const [uploadedFiles, setUploadedFiles] = useState<FileResponse[]>([]);

  const uploadFiles = useCallback(
    async (files: File[]) => {
      if (!workspaceId || !sessionId) return;

      const uploadResults: FileResponse[] = [];

      for (const file of files) {
        try {
          const response = await filesApi.uploadForAttempt(
            workspaceId,
            sessionId,
            file
          );
          uploadResults.push(response);
        } catch (error) {
          console.error('Failed to upload file:', error);
        }
      }

      if (uploadResults.length > 0) {
        setUploadedFiles((prev) => [...prev, ...uploadResults]);
        const allMarkdown = uploadResults
          .map(buildWorkspaceAttachmentMarkdown)
          .join('\n\n');
        onInsertMarkdown(allMarkdown);
      }
    },
    [workspaceId, sessionId, onInsertMarkdown]
  );

  const clearUploadedFiles = useCallback(() => {
    setUploadedFiles([]);
  }, []);

  const localFiles: LocalFileMetadata[] =
    uploadedFiles.map(toLocalFileMetadata);

  return { uploadFiles, localFiles, clearUploadedFiles };
}

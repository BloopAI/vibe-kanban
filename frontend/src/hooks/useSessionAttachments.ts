import { useCallback } from 'react';
import { imagesApi } from '@/lib/api';

/**
 * Hook for handling image attachments in session follow-up messages.
 * Uploads images to the workspace and calls back with markdown to insert.
 */
export function useSessionAttachments(
  workspaceId: string | undefined,
  onInsertMarkdown: (markdown: string) => void
) {
  const uploadFiles = useCallback(
    async (files: File[]) => {
      if (!workspaceId) return;

      const imageFiles = files.filter((f) => f.type.startsWith('image/'));

      for (const file of imageFiles) {
        try {
          const response = await imagesApi.uploadForAttempt(workspaceId, file);
          const imageMarkdown = `![${response.original_name}](${response.file_path})`;
          onInsertMarkdown(imageMarkdown);
        } catch (error) {
          console.error('Failed to upload image:', error);
        }
      }
    },
    [workspaceId, onInsertMarkdown]
  );

  return { uploadFiles };
}

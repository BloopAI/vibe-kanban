import { useCallback, useState } from 'react';
import { attachmentsApi } from '@/shared/lib/api';
import type { LocalAttachmentMetadata } from '@vibe/ui/components/WorkspaceContext';
import {
  buildWorkspaceAttachmentMarkdown,
  toLocalAttachmentMetadata,
} from '@/shared/lib/workspaceAttachments';
import type { AttachmentResponse } from 'shared/types';

/**
 * Hook for handling attachments in session follow-up messages.
 * Uploads attachments to the workspace and calls back with markdown to insert.
 * Also tracks uploaded attachments for immediate preview in the editor.
 */
export function useSessionAttachments(
  workspaceId: string | undefined,
  sessionId: string | undefined,
  onInsertMarkdown: (markdown: string) => void
) {
  const [uploadedAttachments, setUploadedAttachments] = useState<
    AttachmentResponse[]
  >([]);

  const uploadFiles = useCallback(
    async (files: File[]) => {
      if (!workspaceId || !sessionId) return;

      const uploadResults: AttachmentResponse[] = [];

      for (const file of files) {
        try {
          const response = await attachmentsApi.uploadForAttempt(
            workspaceId,
            sessionId,
            file
          );
          uploadResults.push(response);
        } catch (error) {
          console.error('Failed to upload attachment:', error);
        }
      }

      if (uploadResults.length > 0) {
        setUploadedAttachments((prev) => [...prev, ...uploadResults]);
        const allMarkdown = uploadResults
          .map(buildWorkspaceAttachmentMarkdown)
          .join('\n\n');
        onInsertMarkdown(allMarkdown);
      }
    },
    [workspaceId, sessionId, onInsertMarkdown]
  );

  const clearUploadedAttachments = useCallback(() => {
    setUploadedAttachments([]);
  }, []);

  const localAttachments: LocalAttachmentMetadata[] = uploadedAttachments.map(
    toLocalAttachmentMetadata
  );

  return { uploadFiles, localAttachments, clearUploadedAttachments };
}

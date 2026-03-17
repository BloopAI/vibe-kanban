import { useCallback, useEffect, useRef, useState } from 'react';
import { attachmentsApi } from '@/shared/lib/api';
import type { LocalAttachmentMetadata } from '@vibe/ui/components/WorkspaceContext';
import {
  buildWorkspaceAttachmentMarkdown,
  toLocalAttachmentMetadata,
} from '@/shared/lib/workspaceAttachments';
import type { DraftWorkspaceAttachment } from 'shared/types';

/**
 * Hook for handling attachments during workspace creation.
 * Uploads attachments and tracks their IDs for association with the workspace.
 * Also tracks uploaded attachments for immediate preview in the editor.
 * Supports restoring previously uploaded attachments from a persisted draft.
 */
export function useCreateAttachments(
  onInsertMarkdown: (markdown: string) => void,
  initialAttachments?: DraftWorkspaceAttachment[],
  onAttachmentsChange?: (attachments: DraftWorkspaceAttachment[]) => void
) {
  const [attachments, setAttachments] = useState<DraftWorkspaceAttachment[]>(
    initialAttachments ?? []
  );
  const hasInitialized = useRef(false);

  useEffect(() => {
    if (hasInitialized.current) return;
    if (initialAttachments && initialAttachments.length > 0) {
      hasInitialized.current = true;
      setAttachments(initialAttachments);
    }
  }, [initialAttachments]);

  useEffect(() => {
    onAttachmentsChange?.(attachments);
  }, [attachments, onAttachmentsChange]);

  const uploadFiles = useCallback(
    async (selectedFiles: File[]) => {
      const uploadResults: DraftWorkspaceAttachment[] = [];

      for (const attachment of selectedFiles) {
        try {
          const response = await attachmentsApi.upload(attachment);
          uploadResults.push({
            id: response.id,
            file_path: response.file_path,
            original_name: response.original_name,
            mime_type: response.mime_type,
            size_bytes: Number(response.size_bytes) as unknown as bigint,
          });
        } catch (error) {
          console.error('Failed to upload attachment:', error);
        }
      }

      if (uploadResults.length > 0) {
        setAttachments((prev) => [...prev, ...uploadResults]);
        const allMarkdown = uploadResults
          .map(buildWorkspaceAttachmentMarkdown)
          .join('\n\n');
        onInsertMarkdown(allMarkdown);
      }
    },
    [onInsertMarkdown]
  );

  const getAttachmentIds = useCallback(() => {
    const ids = attachments.map((attachment) => attachment.id);
    return ids.length > 0 ? ids : null;
  }, [attachments]);

  const clearAttachments = useCallback(() => setAttachments([]), []);

  const localAttachments: LocalAttachmentMetadata[] = attachments.map(
    (attachment) =>
      toLocalAttachmentMetadata({
        ...attachment,
        hash: '',
        created_at: '',
        updated_at: '',
      })
  );

  return {
    uploadFiles,
    getAttachmentIds,
    clearAttachments,
    localAttachments,
  };
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { filesApi } from '@/shared/lib/api';
import type { LocalFileMetadata } from '@vibe/ui/components/WorkspaceContext';
import {
  buildWorkspaceAttachmentMarkdown,
  toLocalFileMetadata,
} from '@/shared/lib/workspaceAttachments';
import type { DraftWorkspaceFile } from 'shared/types';

/**
 * Hook for handling file attachments during workspace creation.
 * Uploads files and tracks their IDs for association with the workspace.
 * Also tracks uploaded files for immediate preview in the editor.
 * Supports restoring previously uploaded files from a persisted draft.
 */
export function useCreateAttachments(
  onInsertMarkdown: (markdown: string) => void,
  initialFiles?: DraftWorkspaceFile[],
  onFilesChange?: (files: DraftWorkspaceFile[]) => void
) {
  const [files, setFiles] = useState<DraftWorkspaceFile[]>(initialFiles ?? []);
  const hasInitialized = useRef(false);

  useEffect(() => {
    if (hasInitialized.current) return;
    if (initialFiles && initialFiles.length > 0) {
      hasInitialized.current = true;
      setFiles(initialFiles);
    }
  }, [initialFiles]);

  useEffect(() => {
    onFilesChange?.(files);
  }, [files, onFilesChange]);

  const uploadFiles = useCallback(
    async (files: File[]) => {
      const uploadResults: DraftWorkspaceFile[] = [];

      for (const file of files) {
        try {
          const response = await filesApi.upload(file);
          uploadResults.push({
            id: response.id,
            file_path: response.file_path,
            original_name: response.original_name,
            mime_type: response.mime_type,
            size_bytes: Number(response.size_bytes) as unknown as bigint,
          });
        } catch (error) {
          console.error('Failed to upload file:', error);
        }
      }

      if (uploadResults.length > 0) {
        setFiles((prev) => [...prev, ...uploadResults]);
        const allMarkdown = uploadResults
          .map(buildWorkspaceAttachmentMarkdown)
          .join('\n\n');
        onInsertMarkdown(allMarkdown);
      }
    },
    [onInsertMarkdown]
  );

  const getFileIds = useCallback(() => {
    const ids = files.map((file) => file.id);
    return ids.length > 0 ? ids : null;
  }, [files]);

  const clearAttachments = useCallback(() => setFiles([]), []);

  const localFiles: LocalFileMetadata[] = files.map((file) =>
    toLocalFileMetadata({
      ...file,
      hash: '',
      created_at: '',
      updated_at: '',
    })
  );

  return { uploadFiles, getFileIds, clearAttachments, localFiles };
}

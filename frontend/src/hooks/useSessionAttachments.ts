import { useCallback, useState } from 'react';
import { imagesApi } from '@/lib/api';
import type { LocalImageMetadata } from '@/components/ui/wysiwyg/context/task-attempt-context';
import type { ImageResponse } from 'shared/types';

/**
 * Hook for handling image attachments in session follow-up messages.
 * Uploads images to the workspace and calls back with markdown to insert.
 * Also tracks uploaded images for immediate preview in the editor.
 */
export function useSessionAttachments(
  workspaceId: string | undefined,
  onInsertMarkdown: (markdown: string) => void
) {
  const [uploadedImages, setUploadedImages] = useState<ImageResponse[]>([]);

  const uploadFiles = useCallback(
    async (files: File[]) => {
      if (!workspaceId) return;

      const imageFiles = files.filter((f) => f.type.startsWith('image/'));

      for (const file of imageFiles) {
        try {
          const response = await imagesApi.uploadForAttempt(workspaceId, file);
          const imageMarkdown = `![${response.original_name}](${response.file_path})`;
          onInsertMarkdown(imageMarkdown);
          setUploadedImages((prev) => [...prev, response]);
        } catch (error) {
          console.error('Failed to upload image:', error);
        }
      }
    },
    [workspaceId, onInsertMarkdown]
  );

  const clearUploadedImages = useCallback(() => {
    setUploadedImages([]);
  }, []);

  // Convert uploaded images to LocalImageMetadata format for WYSIWYG preview
  const localImages: LocalImageMetadata[] = uploadedImages.map((img) => ({
    path: img.file_path,
    proxy_url: `/api/images/${img.id}/file`,
    file_name: img.original_name,
    size_bytes: Number(img.size_bytes),
    format: img.mime_type?.split('/')[1] ?? 'png',
  }));

  return { uploadFiles, localImages, clearUploadedImages };
}

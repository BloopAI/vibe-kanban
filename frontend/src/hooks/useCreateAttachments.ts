import { useCallback, useState } from 'react';
import { imagesApi } from '@/lib/api';
import type { LocalImageMetadata } from '@/components/ui/wysiwyg/context/task-attempt-context';
import type { ImageResponse } from 'shared/types';

/**
 * Hook for handling image attachments during task creation.
 * Uploads images and tracks their IDs for association with the task.
 * Also tracks uploaded images for immediate preview in the editor.
 */
export function useCreateAttachments(
  onInsertMarkdown: (markdown: string) => void
) {
  const [uploadedImages, setUploadedImages] = useState<ImageResponse[]>([]);

  const uploadFiles = useCallback(
    async (files: File[]) => {
      const imageFiles = files.filter((f) => f.type.startsWith('image/'));

      for (const file of imageFiles) {
        try {
          const response = await imagesApi.upload(file);
          setUploadedImages((prev) => [...prev, response]);
          const imageMarkdown = `![${response.original_name}](${response.file_path})`;
          onInsertMarkdown(imageMarkdown);
        } catch (error) {
          console.error('Failed to upload image:', error);
        }
      }
    },
    [onInsertMarkdown]
  );

  const getImageIds = useCallback(() => {
    const ids = uploadedImages.map((img) => img.id);
    return ids.length > 0 ? ids : null;
  }, [uploadedImages]);

  const clearAttachments = useCallback(() => setUploadedImages([]), []);

  // Convert uploaded images to LocalImageMetadata format for WYSIWYG preview
  const localImages: LocalImageMetadata[] = uploadedImages.map((img) => ({
    path: img.file_path,
    proxy_url: `/api/images/${img.id}/file`,
    file_name: img.original_name,
    size_bytes: Number(img.size_bytes),
    format: img.mime_type?.split('/')[1] ?? 'png',
  }));

  return { uploadFiles, getImageIds, clearAttachments, localImages };
}

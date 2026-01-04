import { useCallback, useState } from 'react';
import { imagesApi } from '@/lib/api';

/**
 * Hook for handling image attachments during task creation.
 * Uploads images and tracks their IDs for association with the task.
 */
export function useCreateAttachments(
  onInsertMarkdown: (markdown: string) => void
) {
  const [imageIds, setImageIds] = useState<string[]>([]);

  const uploadFiles = useCallback(
    async (files: File[]) => {
      const imageFiles = files.filter((f) => f.type.startsWith('image/'));

      for (const file of imageFiles) {
        try {
          const response = await imagesApi.upload(file);
          setImageIds((prev) => [...prev, response.id]);
          const imageMarkdown = `![${response.original_name}](${response.file_path})`;
          onInsertMarkdown(imageMarkdown);
        } catch (error) {
          console.error('Failed to upload image:', error);
        }
      }
    },
    [onInsertMarkdown]
  );

  const getImageIds = useCallback(
    () => (imageIds.length > 0 ? imageIds : null),
    [imageIds]
  );

  const clearAttachments = useCallback(() => setImageIds([]), []);

  return { uploadFiles, getImageIds, clearAttachments };
}

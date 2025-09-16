import { useCallback, useEffect, useRef, useState } from 'react';
import type { FollowUpDraft, ImageResponse } from 'shared/types';
import { imagesApi } from '@/lib/api';

type Args = {
  draft: FollowUpDraft | null;
  taskId: string;
};

export function useDraftImages({ draft, taskId }: Args) {
  const [images, setImages] = useState<ImageResponse[]>([]);
  const [newlyUploadedImageIds, setNewlyUploadedImageIds] = useState<string[]>(
    []
  );
  const imagesDirtyRef = useRef<boolean>(false);

  useEffect(() => {
    if (!draft) return;
    const serverIds = (draft.image_ids || []) as string[];
    const wantIds = new Set(serverIds);
    const haveIds = new Set(images.map((img) => img.id));
    const equal =
      haveIds.size === wantIds.size &&
      Array.from(haveIds).every((id) => wantIds.has(id));

    if (equal) {
      // Server and UI are aligned; no longer locally dirty
      imagesDirtyRef.current = false;
      // Do not clear newlyUploadedImageIds automatically; keep until send/cleanup
      return;
    }

    if (imagesDirtyRef.current) {
      // Local edits pending; avoid clobbering UI with server list
      return;
    }

    // Adopt server list (UI not dirty)
    imagesApi
      .getTaskImages(taskId)
      .then((all) => {
        const next = all.filter((img) => wantIds.has(img.id));
        setImages(next);
        // Clear newly uploaded IDs when adopting server list
        setNewlyUploadedImageIds([]);
      })
      .catch(() => void 0);
  }, [draft?.image_ids, taskId, images]);

  const handleImageUploaded = useCallback((image: ImageResponse) => {
    imagesDirtyRef.current = true;
    setImages((prev) => [...prev, image]);
    setNewlyUploadedImageIds((prev) => [...prev, image.id]);
  }, []);

  const clearImagesAndUploads = useCallback(() => {
    imagesDirtyRef.current = false;
    setImages([]);
    setNewlyUploadedImageIds([]);
  }, []);

  return {
    images,
    setImages,
    newlyUploadedImageIds,
    handleImageUploaded,
    clearImagesAndUploads,
  } as const;
}

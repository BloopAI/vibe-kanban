import { useEffect, useRef, useState, useCallback } from 'react';
import type { FollowUpDraft, ImageResponse } from 'shared/types';
import { imagesApi } from '@/lib/api';

type Args = {
  draft: FollowUpDraft | null;
  lastServerVersionRef: React.MutableRefObject<number>;
  suppressNextSaveRef: React.MutableRefObject<boolean>;
  forceNextApplyRef: React.MutableRefObject<boolean>;
  taskId: string;
};

export function useDraftEdits({
  draft,
  lastServerVersionRef,
  suppressNextSaveRef,
  forceNextApplyRef,
  taskId,
}: Args) {
  const [message, setMessageInner] = useState('');
  const [images, setImages] = useState<ImageResponse[]>([]);
  const [newlyUploadedImageIds, setNewlyUploadedImageIds] = useState<string[]>(
    []
  );

  const localDirtyRef = useRef<boolean>(false);
  const imagesDirtyRef = useRef<boolean>(false);

  useEffect(() => {
    if (!draft) return;
    const incomingVersion = Number(draft.version ?? 0n);

    if (incomingVersion === lastServerVersionRef.current) return;
    suppressNextSaveRef.current = true;
    const isInitial = lastServerVersionRef.current === -1;
    const shouldForce = forceNextApplyRef.current;
    const allowApply = isInitial || shouldForce || !localDirtyRef.current;
    if (allowApply && incomingVersion >= lastServerVersionRef.current) {
      setMessageInner(draft.prompt || '');
      localDirtyRef.current = false;
      lastServerVersionRef.current = incomingVersion;
      if (shouldForce) forceNextApplyRef.current = false;
    } else if (incomingVersion > lastServerVersionRef.current) {
      // Skip applying server changes while user is editing; still advance version to avoid loops
      lastServerVersionRef.current = incomingVersion;
    }
  }, [draft]);

  // Sync images from server when not locally dirty
  useEffect(() => {
    if (!draft) return;
    const serverIds = (draft.image_ids || []) as string[];
    const wantIds = new Set(serverIds);
    const haveIds = new Set(images.map((img) => img.id));
    const equal =
      haveIds.size === wantIds.size &&
      Array.from(haveIds).every((id) => wantIds.has(id));

    if (equal) {
      imagesDirtyRef.current = false;
      return;
    }

    if (imagesDirtyRef.current) return;

    imagesApi
      .getTaskImages(taskId)
      .then((all) => {
        const next = all.filter((img) => wantIds.has(img.id));
        setImages(next);
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
    message,
    setMessage: (v: React.SetStateAction<string>) => {
      localDirtyRef.current = true;
      if (typeof v === 'function') {
        setMessageInner((prev) => (v as (prev: string) => string)(prev));
      } else {
        setMessageInner(v);
      }
    },
    images,
    setImages,
    newlyUploadedImageIds,
    handleImageUploaded,
    clearImagesAndUploads,
  } as const;
}

import { useEffect, useRef, useState, useCallback } from 'react';
import type { Draft, ImageResponse } from 'shared/types';
import { imagesApi } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';

type PartialDraft = Pick<Draft, 'prompt' | 'image_ids'>;

type Args = {
  draft: PartialDraft | null;
  taskId: string;
};

// Don't overwrite user's text if they edited within this window
const EDIT_PROTECTION_MS = 5000;

export function useDraftEditor({ draft, taskId }: Args) {
  const [message, setMessageInner] = useState('');
  const [localImages, setLocalImages] = useState<ImageResponse[]>([]);
  const [newlyUploadedImageIds, setNewlyUploadedImageIds] = useState<string[]>(
    []
  );

  const localDirtyRef = useRef<boolean>(false);
  const imagesDirtyRef = useRef<boolean>(false);
  const lastEditTimeRef = useRef<number>(0);

  const isMessageLocallyDirty = useCallback(() => localDirtyRef.current, []);

  // Sync message with server when not locally dirty
  // Protected against overwriting recent user edits during WebSocket reconnection
  useEffect(() => {
    if (!draft) return;
    const serverPrompt = draft.prompt || '';

    // Don't overwrite if user recently edited (protects during WS reconnection)
    const timeSinceEdit = Date.now() - lastEditTimeRef.current;
    if (timeSinceEdit < EDIT_PROTECTION_MS && localDirtyRef.current) {
      return;
    }

    if (!localDirtyRef.current) {
      setMessageInner(serverPrompt);
    } else if (serverPrompt === message) {
      // When server catches up to local text, clear dirty
      localDirtyRef.current = false;
    }
  }, [draft, message]);

  // Fetch images for task via react-query and map to the draft's image_ids
  const serverIds = (draft?.image_ids ?? []).filter(Boolean);
  const idsKey = serverIds.join(',');
  const imagesQuery = useQuery({
    queryKey: ['taskImagesForDraft', taskId, idsKey],
    enabled: !!taskId,
    queryFn: async () => {
      const all = await imagesApi.getTaskImages(taskId);
      const want = new Set(serverIds);
      return all.filter((img) => want.has(img.id));
    },
    staleTime: 60_000,
  });

  const images = imagesDirtyRef.current
    ? localImages
    : (imagesQuery.data ?? []);

  const setMessage = (v: React.SetStateAction<string>) => {
    // Track edit time to protect against overwrites during WS reconnection
    lastEditTimeRef.current = Date.now();
    localDirtyRef.current = true;
    if (typeof v === 'function') {
      setMessageInner((prev) => v(prev));
    } else {
      setMessageInner(v);
    }
  };

  const setImages = (next: ImageResponse[]) => {
    imagesDirtyRef.current = true;
    setLocalImages(next);
  };

  const handleImageUploaded = useCallback((image: ImageResponse) => {
    imagesDirtyRef.current = true;
    setLocalImages((prev) => [...prev, image]);
    setNewlyUploadedImageIds((prev) => [...prev, image.id]);
  }, []);

  const clearImagesAndUploads = useCallback(() => {
    imagesDirtyRef.current = false;
    setLocalImages([]);
    setNewlyUploadedImageIds([]);
  }, []);

  return {
    message,
    setMessage,
    images,
    setImages,
    newlyUploadedImageIds,
    handleImageUploaded,
    clearImagesAndUploads,
    isMessageLocallyDirty,
  } as const;
}

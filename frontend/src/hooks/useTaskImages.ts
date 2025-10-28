import { useState, useEffect, useCallback } from 'react';
import { imagesApi } from '@/lib/api';
import type { ImageResponse } from 'shared/types';

interface UseTaskImagesProps {
  taskId?: string;
  modalVisible: boolean;
}

export function useTaskImages({ taskId, modalVisible }: UseTaskImagesProps) {
  const [images, setImages] = useState<ImageResponse[]>([]);
  const [showImageUpload, setShowImageUpload] = useState(false);
  const [newlyUploadedImageIds, setNewlyUploadedImageIds] = useState<string[]>(
    []
  );

  // Load existing images for the task in edit mode
  useEffect(() => {
    if (!taskId || !modalVisible) return;

    let cancelled = false;

    imagesApi
      .getTaskImages(taskId)
      .then((taskImages) => {
        if (cancelled) return;

        setImages(taskImages);
        if (taskImages.length > 0) {
          setShowImageUpload(true);
        }
      })
      .catch((err) => {
        console.error('Failed to load task images:', err);
        setImages([]);
      });

    return () => {
      cancelled = true;
    };
  }, [taskId, modalVisible]);

  const handleImageUploaded = useCallback((image: ImageResponse) => {
    setImages((prev) => [...prev, image]);
    setShowImageUpload(true);
    setNewlyUploadedImageIds((prev) => [...prev, image.id]);
  }, []);

  const handleImagesChange = useCallback((updatedImages: ImageResponse[]) => {
    setImages(updatedImages);
    setNewlyUploadedImageIds((prev) =>
      prev.filter((id) => updatedImages.some((img) => img.id === id))
    );
  }, []);

  const clearNewlyUploaded = useCallback(() => {
    setNewlyUploadedImageIds([]);
  }, []);

  const resetImages = useCallback(() => {
    setImages([]);
    setNewlyUploadedImageIds([]);
  }, []);

  return {
    images,
    setImages,
    showImageUpload,
    setShowImageUpload,
    handleImageUploaded,
    handleImagesChange,
    newlyUploadedImageIds,
    clearNewlyUploaded,
    resetImages,
  };
}

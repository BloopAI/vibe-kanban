import { useState, useCallback, useEffect, useRef } from 'react';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { defineModal } from '@/lib/modals';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Trash2,
  X,
  ImageOff,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { imagesApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import { ConfirmDialog } from '@/components/dialogs/shared/ConfirmDialog';
import type { ImageResponse } from 'shared/types';

export interface ImageLightboxDialogProps {
  images: ImageResponse[];
  initialIndex?: number;
  onDelete?: (imageId: string) => Promise<void>;
  readOnly?: boolean;
}

interface ImageDimensions {
  width: number;
  height: number;
}

type ImageLoadState = 'loading' | 'loaded' | 'error';

const formatSize = (bytes: bigint): string => {
  const num = Number(bytes);
  if (num < 1024) return `${num} B`;
  if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
  return `${(num / (1024 * 1024)).toFixed(1)} MB`;
};

const ImageLightboxDialogImpl = NiceModal.create<ImageLightboxDialogProps>(
  ({ images: initialImages, initialIndex = 0, onDelete, readOnly = false }) => {
    const modal = useModal();
    const [images, setImages] = useState(initialImages);
    const [currentIndex, setCurrentIndex] = useState(initialIndex);
    const [imageStates, setImageStates] = useState<Map<string, ImageLoadState>>(
      new Map()
    );
    const [imageDimensions, setImageDimensions] = useState<
      Map<string, ImageDimensions>
    >(new Map());
    const containerRef = useRef<HTMLDivElement>(null);

    const currentImage = images[currentIndex];
    const hasMultipleImages = images.length > 1;
    const hasPrev = currentIndex > 0;
    const hasNext = currentIndex < images.length - 1;
    const currentState = imageStates.get(currentImage?.id) || 'loading';
    const currentDimensions = imageDimensions.get(currentImage?.id);

    // Focus container for keyboard events
    useEffect(() => {
      if (modal.visible && containerRef.current) {
        containerRef.current.focus();
      }
    }, [modal.visible]);

    // Reset to loading state when image changes
    useEffect(() => {
      if (currentImage && !imageStates.has(currentImage.id)) {
        setImageStates((prev) => new Map(prev).set(currentImage.id, 'loading'));
      }
    }, [currentImage, imageStates]);

    const handleImageLoad = useCallback(
      (imageId: string, img: HTMLImageElement) => {
        setImageStates((prev) => new Map(prev).set(imageId, 'loaded'));
        setImageDimensions((prev) =>
          new Map(prev).set(imageId, {
            width: img.naturalWidth,
            height: img.naturalHeight,
          })
        );
      },
      []
    );

    const handleImageError = useCallback((imageId: string) => {
      setImageStates((prev) => new Map(prev).set(imageId, 'error'));
    }, []);

    const handlePrev = useCallback(() => {
      if (hasPrev) setCurrentIndex((i) => i - 1);
    }, [hasPrev]);

    const handleNext = useCallback(() => {
      if (hasNext) setCurrentIndex((i) => i + 1);
    }, [hasNext]);

    const handleClose = useCallback(() => {
      modal.hide();
    }, [modal]);

    const handleDownload = useCallback(() => {
      if (!currentImage) return;
      const link = document.createElement('a');
      link.href = imagesApi.getImageUrl(currentImage.id);
      link.download = currentImage.original_name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }, [currentImage]);

    const handleDelete = useCallback(async () => {
      if (!onDelete || !currentImage) return;

      const result = await ConfirmDialog.show({
        title: 'Delete Image',
        message: `Are you sure you want to delete "${currentImage.original_name}"? This action cannot be undone.`,
        confirmText: 'Delete',
        variant: 'destructive',
      });

      if (result === 'confirmed') {
        await onDelete(currentImage.id);

        // Update local images array
        const newImages = images.filter((img) => img.id !== currentImage.id);
        setImages(newImages);

        if (newImages.length === 0) {
          modal.hide();
        } else {
          // Stay on current index or move to previous if at end
          if (currentIndex >= newImages.length) {
            setCurrentIndex(Math.max(0, newImages.length - 1));
          }
        }
      }
    }, [currentImage, onDelete, images, currentIndex, modal]);

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        switch (e.key) {
          case 'ArrowLeft':
            e.preventDefault();
            handlePrev();
            break;
          case 'ArrowRight':
            e.preventDefault();
            handleNext();
            break;
          case 'd':
          case 'D':
            e.preventDefault();
            handleDownload();
            break;
          case 'Delete':
          case 'Backspace':
            if (!readOnly && onDelete) {
              e.preventDefault();
              void handleDelete();
            }
            break;
          case 'Escape':
            e.preventDefault();
            handleClose();
            break;
        }
      },
      [
        handlePrev,
        handleNext,
        handleDownload,
        handleDelete,
        handleClose,
        readOnly,
        onDelete,
      ]
    );

    const handleThumbnailClick = useCallback((index: number) => {
      setCurrentIndex(index);
    }, []);

    const handleBackdropClick = useCallback(
      (e: React.MouseEvent) => {
        if (e.target === e.currentTarget) {
          handleClose();
        }
      },
      [handleClose]
    );

    if (!modal.visible || !currentImage) return null;

    return (
      <div
        ref={containerRef}
        className="fixed inset-0 z-[9999] flex flex-col outline-none"
        role="dialog"
        aria-modal="true"
        aria-label={`Image viewer: ${currentImage.original_name}`}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onClick={handleBackdropClick}
      >
        {/* Dark overlay */}
        <div className="absolute inset-0 bg-black/90" />

        {/* Header */}
        <div className="relative z-10 flex items-center justify-between p-4">
          <span className="text-sm text-white/80">
            {hasMultipleImages && `${currentIndex + 1} / ${images.length}`}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 text-white/80 hover:text-white hover:bg-white/20"
              onClick={handleDownload}
              title="Download (D)"
            >
              <Download className="h-5 w-5" />
            </Button>
            {!readOnly && onDelete && (
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-white/80 hover:text-white hover:bg-red-500/30"
                onClick={handleDelete}
                title="Delete"
              >
                <Trash2 className="h-5 w-5" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 text-white/80 hover:text-white hover:bg-white/20"
              onClick={handleClose}
              title="Close (Esc)"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Main image area */}
        <div
          className="relative z-10 flex-1 flex items-center justify-center px-16"
          onClick={handleBackdropClick}
        >
          {/* Navigation arrows */}
          {hasMultipleImages && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  'absolute left-4 h-12 w-12 rounded-full bg-black/50 text-white hover:bg-black/70',
                  !hasPrev && 'opacity-30 cursor-not-allowed'
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  handlePrev();
                }}
                disabled={!hasPrev}
              >
                <ChevronLeft className="h-8 w-8" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  'absolute right-4 h-12 w-12 rounded-full bg-black/50 text-white hover:bg-black/70',
                  !hasNext && 'opacity-30 cursor-not-allowed'
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  handleNext();
                }}
                disabled={!hasNext}
              >
                <ChevronRight className="h-8 w-8" />
              </Button>
            </>
          )}

          {/* Image container */}
          <div
            className="relative flex items-center justify-center max-w-[90vw] max-h-[70vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {currentState === 'loading' && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-white/50" />
              </div>
            )}

            {currentState === 'error' ? (
              <div className="flex flex-col items-center gap-3 text-white/70">
                <ImageOff className="h-16 w-16" />
                <span className="text-sm">Failed to load image</span>
                <span className="text-xs text-white/50">
                  {currentImage.original_name}
                </span>
              </div>
            ) : (
              <img
                key={currentImage.id}
                src={imagesApi.getImageUrl(currentImage.id)}
                alt={currentImage.original_name}
                className={cn(
                  'max-w-[90vw] max-h-[70vh] object-contain transition-opacity duration-200',
                  currentState === 'loaded' ? 'opacity-100' : 'opacity-0'
                )}
                onLoad={(e) =>
                  handleImageLoad(currentImage.id, e.currentTarget)
                }
                onError={() => handleImageError(currentImage.id)}
              />
            )}
          </div>
        </div>

        {/* Metadata panel */}
        <div className="relative z-10 flex justify-center py-2">
          <div className="flex items-center gap-4 px-4 py-2 rounded-lg bg-black/60 text-sm text-white/80">
            <span className="font-medium text-white max-w-[300px] truncate">
              {currentImage.original_name}
            </span>
            <span>{formatSize(currentImage.size_bytes)}</span>
            {currentDimensions && (
              <span>
                {currentDimensions.width} x {currentDimensions.height}
              </span>
            )}
          </div>
        </div>

        {/* Thumbnail strip */}
        {hasMultipleImages && (
          <div className="relative z-10 flex justify-center gap-2 p-4 overflow-x-auto">
            {images.map((image, index) => (
              <button
                key={image.id}
                onClick={(e) => {
                  e.stopPropagation();
                  handleThumbnailClick(index);
                }}
                className={cn(
                  'flex-shrink-0 w-14 h-14 rounded overflow-hidden border-2 transition-all',
                  index === currentIndex
                    ? 'border-white ring-2 ring-white/50'
                    : 'border-transparent opacity-50 hover:opacity-80'
                )}
              >
                <img
                  src={imagesApi.getImageUrl(image.id)}
                  alt={image.original_name}
                  className="w-full h-full object-cover"
                />
              </button>
            ))}
          </div>
        )}

        {/* Screen reader announcements */}
        <div className="sr-only" role="status" aria-live="polite">
          Showing image {currentIndex + 1} of {images.length}:{' '}
          {currentImage.original_name}
        </div>
      </div>
    );
  }
);

export const ImageLightboxDialog = defineModal<ImageLightboxDialogProps, void>(
  ImageLightboxDialogImpl
);

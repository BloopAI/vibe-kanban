import {
  useCallback,
  useRef,
  forwardRef,
  useImperativeHandle,
  useState,
  useEffect,
} from 'react';
import { FileSearchTextarea } from '@/components/ui/file-search-textarea';
import {
  ImageUploadSection,
  type ImageUploadSectionHandle,
} from '@/components/ui/ImageUploadSection';
import { imagesApi } from '@/lib/api';
import { useTaskFormStore } from '@/stores/useTaskFormStore';
import type { ImageResponse } from 'shared/types';

export interface DescriptionRowHandle {
  addFiles: (files: File[]) => void;
}

interface DescriptionRowProps {
  projectId?: string;
  disabled?: boolean;
  onPasteFiles?: (files: File[]) => void;
}

export const DescriptionRow = forwardRef<
  DescriptionRowHandle,
  DescriptionRowProps
>(({ projectId, disabled, onPasteFiles }, ref) => {
  const description = useTaskFormStore((s) => s.description);
  const setDescription = useTaskFormStore((s) => s.setDescription);
  const images = useTaskFormStore((s) => s.images);
  const setImages = useTaskFormStore((s) => s.setImages);
  const showImageUpload = useTaskFormStore((s) => s.showImageUpload);
  const setShowImageUpload = useTaskFormStore((s) => s.setShowImageUpload);
  const addNewlyUploadedImageId = useTaskFormStore(
    (s) => s.addNewlyUploadedImageId
  );

  const imageUploadRef = useRef<ImageUploadSectionHandle>(null);
  const [pendingFiles, setPendingFiles] = useState<File[] | null>(null);

  useImperativeHandle(ref, () => ({
    addFiles: (files: File[]) => {
      if (imageUploadRef.current) {
        imageUploadRef.current.addFiles(files);
      } else {
        // Queue files to be added when ImageUploadSection mounts
        setPendingFiles(files);
      }
    },
  }));

  // Apply pending files when ImageUploadSection becomes available
  useEffect(() => {
    if (pendingFiles && imageUploadRef.current) {
      imageUploadRef.current.addFiles(pendingFiles);
      setPendingFiles(null);
    }
  }, [pendingFiles, showImageUpload]);

  const handleImageUploaded = useCallback(
    (image: ImageResponse) => {
      const markdownText = `![${image.original_name}](${image.file_path})`;
      const newDescription =
        description.trim() === ''
          ? markdownText
          : description + ' ' + markdownText;
      setDescription(newDescription);
      setImages([...images, image]);
      setShowImageUpload(true);
      addNewlyUploadedImageId(image.id);
    },
    [
      description,
      images,
      setDescription,
      setImages,
      setShowImageUpload,
      addNewlyUploadedImageId,
    ]
  );

  const handleImagesChange = useCallback(
    (updatedImages: ImageResponse[]) => {
      setImages(updatedImages);
    },
    [setImages]
  );

  return (
    <>
      <div>
        <FileSearchTextarea
          value={description}
          onChange={setDescription}
          rows={4}
          maxRows={35}
          placeholder="Add more details (optional). Type @ to search files."
          className="border-none shadow-none px-0 resize-none placeholder:text-muted-foreground/60 focus-visible:ring-0"
          disabled={disabled}
          projectId={projectId}
          onPasteFiles={onPasteFiles}
        />
      </div>

      {showImageUpload && (
        <ImageUploadSection
          ref={imageUploadRef}
          images={images}
          onImagesChange={handleImagesChange}
          onUpload={imagesApi.upload}
          onDelete={imagesApi.delete}
          onImageUploaded={handleImageUploaded}
          disabled={disabled}
          collapsible={false}
          defaultExpanded={true}
          hideDropZone={true}
        />
      )}
    </>
  );
});

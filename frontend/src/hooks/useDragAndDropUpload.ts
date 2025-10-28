import { useState, useCallback, useRef } from 'react';

interface UseDragAndDropUploadProps {
  onFiles: (files: File[]) => void;
  enabled?: boolean;
}

export function useDragAndDropUpload({
  onFiles,
  enabled = true,
}: UseDragAndDropUploadProps) {
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const dragCounterRef = useRef(0);

  const handleDragEnter = useCallback(
    (e: React.DragEvent) => {
      if (!enabled) return;
      e.preventDefault();
      e.stopPropagation();

      if (e.dataTransfer.types.includes('Files')) {
        dragCounterRef.current++;
        if (dragCounterRef.current === 1) {
          setIsDraggingFile(true);
        }
      }
    },
    [enabled]
  );

  const handleDragLeave = useCallback(
    (e: React.DragEvent) => {
      if (!enabled) return;
      e.preventDefault();
      e.stopPropagation();

      if (dragCounterRef.current > 0) {
        dragCounterRef.current--;
      }
      if (dragCounterRef.current === 0) {
        setIsDraggingFile(false);
      }
    },
    [enabled]
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!enabled) return;
      e.preventDefault();
      e.stopPropagation();
    },
    [enabled]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      if (!enabled) return;
      e.preventDefault();
      e.stopPropagation();

      dragCounterRef.current = 0;
      setIsDraggingFile(false);

      const files = Array.from(e.dataTransfer.files).filter((file) =>
        file.type.startsWith('image/')
      );

      if (files.length > 0) {
        onFiles(files);
      }
    },
    [enabled, onFiles]
  );

  return {
    isDraggingFile,
    handlers: {
      onDragEnter: handleDragEnter,
      onDragLeave: handleDragLeave,
      onDragOver: handleDragOver,
      onDrop: handleDrop,
    },
  };
}

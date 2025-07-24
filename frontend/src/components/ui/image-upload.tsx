import React, { useCallback, useState, useRef, useEffect } from 'react';
import { Upload, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './button';
import { Attachment } from 'shared/types';

export interface PendingFile {
  file: File;
  blobUrl: string;
  id: string;
}

interface ImageUploadProps {
  onUpload: (files: File[]) => Promise<void>;
  attachments?: Attachment[];
  pendingFiles?: PendingFile[];
  onRemove?: (attachmentId: string) => Promise<void>;
  className?: string;
  maxFiles?: number;
  accept?: string;
}

export function ImageUpload({
  onUpload,
  attachments = [],
  pendingFiles = [],
  onRemove,
  className,
  maxFiles = 10,
  accept = 'image/*',
}: ImageUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Clean up blob URLs when component unmounts or pending files change
  useEffect(() => {
    return () => {
      pendingFiles.forEach((pf) => {
        URL.revokeObjectURL(pf.blobUrl);
      });
    };
  }, [pendingFiles]);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const files = Array.from(e.dataTransfer.files).filter((file) =>
        file.type.startsWith('image/')
      );

      if (files.length > 0) {
        await handleFiles(files);
      }
    },
    [onUpload]
  );

  const handleFiles = async (files: File[]) => {
    if (files.length === 0) return;

    const totalFiles = attachments.length + pendingFiles.length;
    const remainingSlots = maxFiles - totalFiles;
    if (remainingSlots <= 0) {
      alert(`Maximum ${maxFiles} files allowed`);
      return;
    }

    const filesToUpload = files.slice(0, remainingSlots);

    setIsUploading(true);
    try {
      await onUpload(filesToUpload);
    } catch (error) {
      console.error('Upload failed:', error);
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      await handleFiles(files);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    [onUpload, attachments.length, pendingFiles.length, maxFiles]
  );

  const handlePaste = useCallback(
    async (e: React.ClipboardEvent) => {
      const items = Array.from(e.clipboardData.items);
      const files: File[] = [];

      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) files.push(file);
        }
      }

      if (files.length > 0) {
        await handleFiles(files);
      }
    },
    [onUpload, attachments.length, pendingFiles.length, maxFiles]
  );

  const handleRemove = async (attachmentId: string) => {
    if (onRemove) {
      try {
        await onRemove(attachmentId);
      } catch (error) {
        console.error('Failed to remove attachment:', error);
      }
    }
  };

  return (
    <div className={cn('space-y-4', className)} onPaste={handlePaste}>
      <div
        className={cn(
          'relative rounded-lg border-2 border-dashed p-6 text-center transition-colors',
          isDragging
            ? 'border-primary bg-primary/5'
            : 'border-muted-foreground/25 hover:border-muted-foreground/50',
          isUploading && 'opacity-50 pointer-events-none'
        )}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />

        <Upload className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground mb-1">
          Drag and drop images here, or click to select
        </p>
        <p className="text-xs text-muted-foreground mb-3">
          You can also paste images from clipboard or in the description field
        </p>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
        >
          Select Images
        </Button>
      </div>

      {(attachments.length > 0 || pendingFiles.length > 0) && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {/* Render uploaded attachments */}
          {attachments.map((attachment) => (
            <div
              key={attachment.id}
              className="relative group rounded-lg overflow-hidden border bg-card"
            >
              <img
                src={`/api/attachments/${attachment.id}`}
                alt={attachment.original_filename}
                className="w-full h-32 object-cover"
              />
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-white hover:text-red-400"
                  onClick={() => handleRemove(attachment.id)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="p-2">
                <p className="text-xs truncate" title={attachment.original_filename}>
                  {attachment.original_filename}
                </p>
                <p className="text-xs text-muted-foreground">
                  {(Number(attachment.size) / 1024).toFixed(1)} KB
                </p>
              </div>
            </div>
          ))}

          {/* Render pending files */}
          {pendingFiles.map((pendingFile) => (
            <div
              key={pendingFile.id}
              className="relative group rounded-lg overflow-hidden border bg-card"
            >
              <img
                src={pendingFile.blobUrl}
                alt={pendingFile.file.name}
                className="w-full h-32 object-cover"
              />
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-white hover:text-red-400"
                  onClick={() => handleRemove(pendingFile.id)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="p-2">
                <p className="text-xs truncate" title={pendingFile.file.name}>
                  {pendingFile.file.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {(pendingFile.file.size / 1024).toFixed(1)} KB
                  <span className="ml-1 text-yellow-600">(pending)</span>
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
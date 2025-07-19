import { useState, useRef, useCallback } from 'react';
import { Upload, X, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface ImageFile {
  file_name: string;
  file_type: string;
  data: string; // Base64 encoded
  preview?: string; // For display
}

interface ImageUploadProps {
  value: ImageFile[];
  onChange: (files: ImageFile[]) => void;
  maxFiles?: number;
  maxSizeMB?: number;
  disabled?: boolean;
  className?: string;
}

export function ImageUpload({
  value = [],
  onChange,
  maxFiles = 5,
  maxSizeMB = 10,
  disabled = false,
  className,
}: ImageUploadProps) {
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || disabled) return;

      const newImages: ImageFile[] = [];
      const maxSize = maxSizeMB * 1024 * 1024;

      for (let i = 0; i < files.length && value.length + newImages.length < maxFiles; i++) {
        const file = files[i];
        
        // Check if it's an image
        if (!file.type.startsWith('image/')) {
          console.warn(`File ${file.name} is not an image`);
          continue;
        }

        // Check file size
        if (file.size > maxSize) {
          console.warn(`File ${file.name} exceeds ${maxSizeMB}MB limit`);
          continue;
        }

        // Convert to base64
        const reader = new FileReader();
        const base64Promise = new Promise<string>((resolve, reject) => {
          reader.onload = (e) => {
            const result = e.target?.result as string;
            // Remove data URL prefix to get just the base64 string
            const base64 = result.split(',')[1];
            resolve(base64);
          };
          reader.onerror = reject;
        });
        
        reader.readAsDataURL(file);
        
        try {
          const base64Data = await base64Promise;
          newImages.push({
            file_name: file.name,
            file_type: file.type,
            data: base64Data,
            preview: `data:${file.type};base64,${base64Data}`,
          });
        } catch (error) {
          console.error('Error reading file:', error);
        }
      }

      if (newImages.length > 0) {
        onChange([...value, ...newImages]);
      }
    },
    [value, onChange, maxFiles, maxSizeMB, disabled]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  }, []);

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      const files: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) files.push(file);
        }
      }

      if (files.length > 0) {
        const dt = new DataTransfer();
        files.forEach(file => dt.items.add(file));
        handleFiles(dt.files);
      }
    },
    [handleFiles]
  );

  const removeImage = useCallback(
    (index: number) => {
      const newImages = [...value];
      newImages.splice(index, 1);
      onChange(newImages);
    },
    [value, onChange]
  );

  return (
    <div className={className} onPaste={handlePaste}>
      <div
        className={cn(
          "border-2 border-dashed rounded-lg p-4 text-center transition-colors",
          dragActive && "border-primary bg-primary/5",
          disabled && "opacity-50 cursor-not-allowed",
          !disabled && !dragActive && "border-muted-foreground/25 hover:border-muted-foreground/50"
        )}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/*"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
          disabled={disabled}
        />
        
        {value.length === 0 ? (
          <div className="space-y-2">
            <Upload className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Drag & drop images here, paste with Ctrl+V, or click to upload
            </p>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => inputRef.current?.click()}
              disabled={disabled}
            >
              Choose Images
            </Button>
            <p className="text-xs text-muted-foreground">
              Max {maxFiles} images, {maxSizeMB}MB each
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {value.map((image, index) => (
                <div key={index} className="relative group">
                  {image.preview ? (
                    <img
                      src={image.preview}
                      alt={image.file_name}
                      className="w-full h-24 object-cover rounded border"
                    />
                  ) : (
                    <div className="w-full h-24 flex items-center justify-center bg-muted rounded border">
                      <ImageIcon className="h-8 w-8 text-muted-foreground" />
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => removeImage(index)}
                    className="absolute top-1 right-1 p-1 bg-destructive text-destructive-foreground rounded opacity-0 group-hover:opacity-100 transition-opacity"
                    disabled={disabled}
                  >
                    <X className="h-3 w-3" />
                  </button>
                  <p className="text-xs text-center mt-1 truncate px-1">
                    {image.file_name}
                  </p>
                </div>
              ))}
            </div>
            {value.length < maxFiles && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => inputRef.current?.click()}
                disabled={disabled}
              >
                Add More Images
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
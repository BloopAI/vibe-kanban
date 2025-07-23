import { useState } from 'react';
import { Image as ImageIcon, X, Download, Maximize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Attachment } from 'shared/types';
import { attachmentsApi } from '@/lib/api';

interface TaskAttachmentsProps {
  attachments: Attachment[];
  onRemove?: (attachmentId: string) => Promise<void>;
  editable?: boolean;
}

export function TaskAttachments({ 
  attachments, 
  onRemove,
  editable = false 
}: TaskAttachmentsProps) {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());

  if (attachments.length === 0) {
    return null;
  }

  const handleRemove = async (attachmentId: string) => {
    if (!onRemove || removingIds.has(attachmentId)) return;
    
    setRemovingIds(prev => new Set(prev).add(attachmentId));
    try {
      await onRemove(attachmentId);
    } catch (error) {
      console.error('Failed to remove attachment:', error);
    } finally {
      setRemovingIds(prev => {
        const next = new Set(prev);
        next.delete(attachmentId);
        return next;
      });
    }
  };

  const handleDownload = (attachment: Attachment) => {
    const link = document.createElement('a');
    link.href = attachmentsApi.getDownloadUrl(attachment.id);
    link.download = attachment.original_filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <>
      <div className="border-t pt-4">
        <div className="flex items-center gap-2 mb-3">
          <ImageIcon className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">Attachments ({attachments.length})</h3>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {attachments.map((attachment) => (
            <div
              key={attachment.id}
              className="relative group rounded-lg overflow-hidden border bg-card hover:border-primary/50 transition-colors"
            >
              <img
                src={`/api/attachments/${attachment.id}`}
                alt={attachment.original_filename}
                className="w-full h-32 object-cover cursor-pointer"
                onClick={() => setSelectedImage(`/api/attachments/${attachment.id}`)}
              />
              
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-white hover:text-primary"
                  onClick={() => setSelectedImage(`/api/attachments/${attachment.id}`)}
                  title="View full size"
                >
                  <Maximize2 className="h-4 w-4" />
                </Button>
                
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-white hover:text-primary"
                  onClick={() => handleDownload(attachment)}
                  title="Download"
                >
                  <Download className="h-4 w-4" />
                </Button>
                
                {editable && onRemove && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-white hover:text-red-400"
                    onClick={() => handleRemove(attachment.id)}
                    disabled={removingIds.has(attachment.id)}
                    title="Remove"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
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
        </div>
      </div>

      {/* Lightbox for viewing full-size images */}
      {selectedImage && (
        <div 
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setSelectedImage(null)}
        >
          <button
            className="absolute top-4 right-4 text-white hover:text-gray-300 transition-colors"
            onClick={() => setSelectedImage(null)}
          >
            <X className="h-6 w-6" />
          </button>
          <img
            src={selectedImage}
            alt="Full size preview"
            className="max-w-full max-h-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}
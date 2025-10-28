import { Image } from 'lucide-react';

interface DragOverlayProps {
  isDragging: boolean;
}

export function DragOverlay({ isDragging }: DragOverlayProps) {
  if (!isDragging) return null;

  return (
    <div className="absolute inset-0 z-50 bg-primary/95 border-2 border-dashed border-primary-foreground/50 rounded-lg flex items-center justify-center pointer-events-none">
      <div className="text-center">
        <Image className="h-12 w-12 mx-auto mb-2 text-primary-foreground" />
        <p className="text-lg font-medium text-primary-foreground">
          Drop images here
        </p>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download, X } from 'lucide-react';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { defineModal } from '@/lib/modals';

type UpdateAvailableDialogProps = {
  currentVersion: string;
  latestVersion: string;
};

const UpdateAvailableDialogImpl = NiceModal.create<UpdateAvailableDialogProps>(
  ({ currentVersion, latestVersion }) => {
    const modal = useModal();
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
      // Animate in after a brief delay
      const timer = setTimeout(() => setIsVisible(true), 100);
      return () => clearTimeout(timer);
    }, []);

    const handleDismiss = () => {
      setIsVisible(false);
      // Wait for animation to complete before resolving
      setTimeout(() => modal.resolve('dismissed'), 200);
    };

    if (!modal.visible) return null;

    return (
      <div
        className="fixed bottom-4 right-4 z-50"
        style={{ pointerEvents: 'none' }}
      >
        <div
          className={`
            bg-background border-2 border-primary/20 rounded-lg shadow-2xl
            w-80 p-4 transition-all duration-200 ease-out
            ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}
          `}
          style={{ pointerEvents: 'auto' }}
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-primary/10 rounded">
                <Download className="h-4 w-4 text-primary" />
              </div>
              <h3 className="font-semibold text-sm">Update Available</h3>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 -mt-1 -mr-1"
              onClick={handleDismiss}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Content */}
          <p className="text-xs text-muted-foreground mb-3">
            A new version of vibe-kanban is available
          </p>

          {/* Version info */}
          <div className="bg-muted/50 rounded p-2 space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Current:</span>
              <span className="font-mono">{currentVersion}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Latest:</span>
              <span className="font-mono">{latestVersion}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }
);

type DialogResult = 'dismissed';

export const UpdateAvailableDialog = defineModal<
  UpdateAvailableDialogProps,
  DialogResult
>(UpdateAvailableDialogImpl);

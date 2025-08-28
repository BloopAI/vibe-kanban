import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { X, ExternalLink, AlertCircle } from 'lucide-react';

interface ReleaseNotesDialogProps {
  open: boolean;
  onClose: () => void;
}

const RELEASE_NOTES_URL = 'https://vibekanban.com/release-notes';

export function ReleaseNotesDialog({ open, onClose }: ReleaseNotesDialogProps) {
  const [iframeError, setIframeError] = useState(false);

  const handleOpenInBrowser = () => {
    window.open(RELEASE_NOTES_URL, '_blank');
    onClose();
  };

  const handleIframeError = () => {
    setIframeError(true);
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="w-[95vw] max-w-7xl max-h-[calc(100dvh-1rem)] p-0 gap-0 grid grid-rows-[auto_1fr_auto] sm:rounded-lg">
        <DialogHeader className="p-4 border-b flex-shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-xl font-semibold">
              What's New in Vibe Kanban
            </DialogTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-6 w-6"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-hidden p-4">
          {iframeError ? (
            <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
              <AlertCircle className="h-12 w-12 text-muted-foreground" />
              <div className="space-y-2">
                <h3 className="text-lg font-medium">Unable to load release notes</h3>
                <p className="text-sm text-muted-foreground max-w-md">
                  We couldn't display the release notes in this window. Click below to view them in your browser.
                </p>
              </div>
              <Button onClick={handleOpenInBrowser} className="mt-4">
                <ExternalLink className="h-4 w-4 mr-2" />
                Open Release Notes in Browser
              </Button>
            </div>
          ) : (
            <iframe
              src={RELEASE_NOTES_URL}
              className="w-full h-full border-0 rounded"
              sandbox="allow-scripts allow-same-origin allow-popups"
              referrerPolicy="no-referrer"
              title="Release Notes"
              onError={handleIframeError}
              onLoad={(e) => {
                // Check if iframe content loaded successfully
                try {
                  const iframe = e.target as HTMLIFrameElement;
                  // If iframe is accessible but empty, it might indicate loading issues
                  if (iframe.contentDocument?.body?.children.length === 0) {
                    setTimeout(() => setIframeError(true), 5000); // Wait 5s then show fallback
                  }
                } catch {
                  // Cross-origin access blocked (expected), iframe loaded successfully
                }
              }}
            />
          )}
        </div>

        <DialogFooter className="p-4 border-t flex-shrink-0">
          <Button variant="outline" onClick={handleOpenInBrowser}>
            <ExternalLink className="h-4 w-4 mr-2" />
            Open in Browser
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

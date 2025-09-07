import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ExternalLink, AlertCircle } from 'lucide-react';
import NiceModal, { useModal } from '@ebay/nice-modal-react';

const RELEASE_NOTES_URL = 'https://vibekanban.com/release-notes';

export const ReleaseNotesDialog = NiceModal.create(() => {
  const modal = useModal();
  const [iframeError, setIframeError] = useState(false);

  const handleOpenInBrowser = () => {
    window.open(RELEASE_NOTES_URL, '_blank');
    modal.resolve();
  };

  const handleIframeError = () => {
    setIframeError(true);
  };

  return (
    <Dialog
      open={modal.visible}
      onOpenChange={(open) => !open && modal.resolve()}
    >
      <DialogContent className="flex flex-col w-full h-full max-w-7xl max-h-[calc(100dvh-1rem)] p-0">
        <DialogHeader className="p-4 border-b flex-shrink-0">
          <DialogTitle className="text-xl font-semibold">
            We've updated Vibe Kanban! Check out what's new...
          </DialogTitle>
        </DialogHeader>

        {iframeError ? (
          <div className="flex flex-col items-center justify-center flex-1 text-center space-y-4 p-4">
            <AlertCircle className="h-12 w-12 text-muted-foreground" />
            <div className="space-y-2">
              <h3 className="text-lg font-medium">
                Unable to load release notes
              </h3>
              <p className="text-sm text-muted-foreground max-w-md">
                We couldn't display the release notes in this window. Click
                below to view them in your browser.
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
            className="flex-1 w-full border-0 min-h-[600px]"
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

        <DialogFooter className="p-4 border-t flex-shrink-0">
          <Button variant="outline" onClick={handleOpenInBrowser}>
            <ExternalLink className="h-4 w-4 mr-2" />
            Open in Browser
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});

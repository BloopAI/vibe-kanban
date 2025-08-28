import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

interface ReleaseNotesDialogProps {
  open: boolean;
  onClose: () => void;
}

export function ReleaseNotesDialog({ open, onClose }: ReleaseNotesDialogProps) {
  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="w-full h-full max-w-none max-h-none p-0 gap-0 grid grid-rows-[auto_1fr_auto] max-h-[calc(100dvh-2rem)]">
        <DialogHeader className="p-6 pb-0 flex-shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-xl font-semibold">
              What's New in Vibe Kanban
            </DialogTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-6 w-6"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 min-h-0 px-6">
          <iframe
            src="https://vibekanban.com/release-notes"
            className="w-full h-full border-0 rounded"
            sandbox="allow-same-origin allow-popups"
            referrerPolicy="no-referrer"
            title="Release Notes"
          />
        </div>

        <DialogFooter className="p-6 pt-0 flex-shrink-0">
          <Button onClick={onClose} className="w-full">
            Continue to Vibe Kanban
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

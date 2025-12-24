import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
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

    const handleDismiss = () => {
      modal.resolve('dismissed');
    };

    return (
      <Dialog
        open={modal.visible}
        onOpenChange={(open) => !open && handleDismiss()}
      >
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Download className="h-5 w-5" />
              Update Available
            </DialogTitle>
            <DialogDescription className="pt-4 space-y-3">
              <p>
                A new version of Vibe Kanban is available! Restart the app to
                get the latest features and bug fixes.
              </p>
              <div className="bg-muted p-3 rounded-md space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Current version:
                  </span>
                  <span className="font-mono font-medium">
                    {currentVersion}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Latest version:
                  </span>
                  <span className="font-mono font-medium text-primary">
                    {latestVersion}
                  </span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Note: Please save your work before restarting the app.
              </p>
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={handleDismiss}>
              <X className="h-4 w-4 mr-2" />
              Dismiss
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
);

type DialogResult = 'dismissed';

export const UpdateAvailableDialog = defineModal<
  UpdateAvailableDialogProps,
  DialogResult
>(UpdateAvailableDialogImpl);

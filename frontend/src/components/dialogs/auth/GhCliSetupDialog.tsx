import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { attemptsApi } from '@/lib/api';

interface GhCliSetupDialogProps {
  attemptId: string;
}

export const GhCliSetupDialog = NiceModal.create<GhCliSetupDialogProps>(
  ({ attemptId }) => {
    const modal = useModal();

    const handleRunSetup = async () => {
      try {
        await attemptsApi.setupGhCli(attemptId);
        modal.resolve(true);
      } catch (err: any) {
        modal.resolve(false);
      } finally {
        modal.hide();
      }
    };

    const handleClose = () => {
      modal.resolve(false);
      modal.hide();
    };

    return (
      <Dialog
        open={modal.visible}
        onOpenChange={(open) => !open && handleClose()}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>GitHub CLI Setup</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p>
              GitHub CLI authentication is required to create pull requests and
              interact with GitHub repositories.
            </p>

            <div className="space-y-2">
              <p className="text-sm">This setup will:</p>
              <ol className="text-sm list-decimal list-inside space-y-1 ml-2">
                <li>Check if GitHub CLI (gh) is installed</li>
                <li>Install it via Homebrew if needed (macOS)</li>
                <li>Authenticate with GitHub using OAuth</li>
              </ol>
              <p className="text-sm text-muted-foreground mt-4">
                The setup will run in the chat window. You'll need to complete
                the authentication in your browser.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleRunSetup}>Run Setup</Button>
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
);

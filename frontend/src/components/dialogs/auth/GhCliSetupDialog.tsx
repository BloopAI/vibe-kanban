import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { configApi } from '@/lib/api';

export const GhCliSetupDialog = NiceModal.create(() => {
  const modal = useModal();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleRunSetup = async () => {
    setRunning(true);
    setError(null);
    setSuccess(false);
    try {
      const result = await configApi.setupGitHubCli();
      if (result.success) {
        setSuccess(true);
        setError(null);
      } else {
        setError(result.message);
        setSuccess(false);
      }
    } catch (err) {
      setError('Failed to run GitHub CLI setup. Please try again.');
      setSuccess(false);
    } finally {
      setRunning(false);
    }
  };

  const handleClose = () => {
    modal.resolve(success);
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

          {!success && !error && (
            <div className="space-y-2">
              <p className="text-sm">This setup will:</p>
              <ol className="text-sm list-decimal list-inside space-y-1 ml-2">
                <li>Check if GitHub CLI (gh) is installed</li>
                <li>Install it via Homebrew if needed (macOS)</li>
                <li>Authenticate with GitHub using OAuth</li>
              </ol>
              <p className="text-sm text-muted-foreground mt-4">
                You'll need to complete the authentication in your browser.
              </p>
            </div>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertDescription>
                <div className="whitespace-pre-line">{error}</div>
              </AlertDescription>
            </Alert>
          )}

          {success && (
            <Alert>
              <AlertDescription>
                GitHub CLI is authenticated successfully! You can now create
                pull requests.
              </AlertDescription>
            </Alert>
          )}
        </div>
        <DialogFooter>
          {!success ? (
            <>
              <Button onClick={handleRunSetup} disabled={running}>
                {running
                  ? 'Running Setup...'
                  : error
                    ? 'Try Again'
                    : 'Run Setup'}
              </Button>
              <Button
                variant="outline"
                onClick={handleClose}
                disabled={running}
              >
                Cancel
              </Button>
            </>
          ) : (
            <Button onClick={handleClose}>Done</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});

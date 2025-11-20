import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { defineModal } from '@/lib/modals';
import { useForcePush } from '@/hooks/useForcePush';
import { useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';

export interface ForcePushDialogProps {
  attemptId: string;
  branchName?: string;
}

const ForcePushDialogImpl = NiceModal.create<ForcePushDialogProps>((props) => {
  const modal = useModal();
  const { attemptId, branchName } = props;
  const [error, setError] = useState<string | null>(null);

  const forcePush = useForcePush(
    attemptId,
    () => {
      // Success - close dialog
      modal.resolve('success');
      modal.hide();
    },
    (err: unknown) => {
      // Error - show in dialog and keep open
      const message =
        err && typeof err === 'object' && 'message' in err
          ? String(err.message)
          : 'Failed to force push';
      setError(message);
    }
  );

  const handleConfirm = async () => {
    setError(null);
    try {
      await forcePush.mutateAsync();
    } catch {
      // Error already handled by onError callback
    }
  };

  const handleCancel = () => {
    modal.resolve('canceled');
    modal.hide();
  };

  const isProcessing = forcePush.isPending;

  return (
    <Dialog open={modal.visible} onOpenChange={handleCancel}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-6 w-6 text-destructive" />
            <DialogTitle>Force Push Required</DialogTitle>
          </div>
          <DialogDescription className="text-left pt-2 space-y-2">
            <p>
              The remote branch{branchName ? ` "${branchName}"` : ''} has
              diverged from your local branch. A regular push was rejected.
            </p>
            <p className="font-medium">
              Force pushing will overwrite the remote changes with your local
              changes. This action cannot be undone.
            </p>
            <p className="text-sm text-muted-foreground">
              Only proceed if you're certain you want to replace the remote
              branch history.
            </p>
          </DialogDescription>
        </DialogHeader>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={isProcessing}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={isProcessing}
          >
            {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isProcessing ? 'Force Pushing...' : 'Force Push'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});

export const ForcePushDialog = defineModal<ForcePushDialogProps, string>(
  ForcePushDialogImpl
);

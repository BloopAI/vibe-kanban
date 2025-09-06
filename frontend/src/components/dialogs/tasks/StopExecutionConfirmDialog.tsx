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

export interface StopExecutionConfirmDialogProps {
  title?: string;
  message?: string;
  isExecuting?: boolean;
}

export type StopExecutionConfirmResult = 'confirmed' | 'canceled';

export const StopExecutionConfirmDialog =
  NiceModal.create<StopExecutionConfirmDialogProps>(
    ({
      title = 'Stop Current Attempt?',
      message = 'Are you sure you want to stop the current execution? This action cannot be undone.',
      isExecuting = false,
    }) => {
      const modal = useModal();

      const handleConfirm = () => {
        modal.resolve('confirmed' as StopExecutionConfirmResult);
        modal.hide();
      };

      const handleCancel = () => {
        modal.resolve('canceled' as StopExecutionConfirmResult);
        modal.hide();
      };

      const handleOpenChange = (open: boolean) => {
        if (!open) {
          handleCancel();
        }
      };

      return (
        <Dialog open={modal.visible} onOpenChange={handleOpenChange}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription>{message}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={handleCancel}
                disabled={isExecuting}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleConfirm}
                disabled={isExecuting}
              >
                {isExecuting ? 'Stopping...' : 'Stop'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      );
    }
  );

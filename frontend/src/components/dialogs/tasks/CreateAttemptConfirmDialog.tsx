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

export interface CreateAttemptConfirmDialogProps {
  title?: string;
  message?: string;
}

export type CreateAttemptConfirmResult = 'confirmed' | 'canceled';

export const CreateAttemptConfirmDialog =
  NiceModal.create<CreateAttemptConfirmDialogProps>(
    ({
      title = 'Start New Attempt?',
      message = 'Are you sure you want to start a new attempt for this task? This will create a new session and branch.',
    }) => {
      const modal = useModal();

      const handleConfirm = () => {
        modal.resolve('confirmed' as CreateAttemptConfirmResult);
        modal.hide();
      };

      const handleCancel = () => {
        modal.resolve('canceled' as CreateAttemptConfirmResult);
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
              <Button variant="outline" onClick={handleCancel}>
                Cancel
              </Button>
              <Button
                onClick={handleConfirm}
                className="bg-black text-white hover:bg-black/90"
              >
                Start
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      );
    }
  );

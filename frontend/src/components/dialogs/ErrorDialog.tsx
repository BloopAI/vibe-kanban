import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
import NiceModal, { useModal } from '@ebay/nice-modal-react';

interface ErrorDialogProps {
  title?: string;
  error: string;
}

const ErrorDialog = NiceModal.create(() => {
  const modal = useModal();
  const data = modal.args as ErrorDialogProps | undefined;

  const title = data?.title || 'Operation Failed';
  const error = data?.error || 'An unknown error occurred';

  const handleClose = () => {
    modal.hide();
  };

  return (
    <Dialog open={modal.visible} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-destructive" />
            {title}
          </DialogTitle>
          <DialogDescription>
            Please review the error below and try again.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <Alert variant="destructive" className="break-words">
            {error}
          </Alert>
        </div>
        <DialogFooter>
          <Button onClick={handleClose}>OK</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});

export { ErrorDialog };

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
import { AlertTriangle } from 'lucide-react';

export interface ErrorDialogProps {
  title: string;
  message: string;
  closeText?: string;
}

const ErrorDialog = NiceModal.create<ErrorDialogProps>((props) => {
  const modal = useModal();
  const { title, message, closeText = 'Close' } = props;

  const handleClose = () => {
    modal.resolve();
    modal.remove();
  };

  return (
    <Dialog open={modal.visible} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-6 w-6 text-destructive" />
            <DialogTitle>{title}</DialogTitle>
          </div>
          <DialogDescription className="text-left pt-2 whitespace-pre-wrap">
            {message}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={handleClose}>{closeText}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});

export { ErrorDialog };

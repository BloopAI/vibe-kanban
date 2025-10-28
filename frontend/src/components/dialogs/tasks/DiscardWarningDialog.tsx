import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface DiscardWarningDialogProps {
  open: boolean;
  onContinue: () => void;
  onDiscard: () => void;
}

export function DiscardWarningDialog({
  open,
  onContinue,
  onDiscard,
}: DiscardWarningDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onContinue()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Discard unsaved changes?</DialogTitle>
        </DialogHeader>
        <div className="py-4">
          <p className="text-sm text-muted-foreground">
            You have unsaved changes. Are you sure you want to discard them?
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onContinue}>
            Continue Editing
          </Button>
          <Button variant="destructive" onClick={onDiscard}>
            Discard Changes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

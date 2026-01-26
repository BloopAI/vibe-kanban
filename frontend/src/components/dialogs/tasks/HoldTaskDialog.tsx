import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { PauseCircle } from 'lucide-react';
import { defineModal, type ConfirmResult } from '@/lib/modals';

export interface HoldTaskDialogProps {
  taskTitle: string;
}

const HoldTaskDialogImpl = NiceModal.create<HoldTaskDialogProps>((props) => {
  const modal = useModal();
  const { t } = useTranslation('tasks');
  const { taskTitle } = props;
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = () => {
    const trimmedComment = comment.trim();
    if (!trimmedComment) {
      setError(
        t(
          'holdTaskDialog.errorRequired',
          'Please provide a reason for placing this task on hold.'
        )
      );
      return;
    }
    modal.resolve(trimmedComment);
  };

  const handleCancel = () => {
    modal.resolve('canceled' as ConfirmResult);
  };

  return (
    <Dialog open={modal.visible} onOpenChange={handleCancel}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <PauseCircle className="h-6 w-6 text-amber-500" />
            <DialogTitle>{t('holdTaskDialog.title')}</DialogTitle>
          </div>
          <DialogDescription className="text-left pt-2">
            {t('holdTaskDialog.description', { taskTitle })}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="hold-comment">
              {t('holdTaskDialog.commentLabel')}{' '}
              <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="hold-comment"
              placeholder={t('holdTaskDialog.commentPlaceholder')}
              value={comment}
              onChange={(e) => {
                setComment(e.target.value);
                setError(null);
              }}
              className="min-h-[80px]"
              autoFocus
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleCancel}>
            {t('holdTaskDialog.cancel')}
          </Button>
          <Button onClick={handleConfirm}>
            {t('holdTaskDialog.placeHold')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});

export const HoldTaskDialog = defineModal<
  HoldTaskDialogProps,
  string | ConfirmResult
>(HoldTaskDialogImpl);

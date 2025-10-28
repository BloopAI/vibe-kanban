import { useState } from 'react';
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
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { useTranslation } from 'react-i18next';
import type { SharedTaskRecord } from '@/hooks/useProjectTasks';
import { useTaskMutations } from '@/hooks/useTaskMutations';

export interface StopShareTaskDialogProps {
  sharedTask: SharedTaskRecord;
}

const StopShareTaskDialog = NiceModal.create<StopShareTaskDialogProps>(
  ({ sharedTask }) => {
    const modal = useModal();
    const { t } = useTranslation('tasks');
    const { stopShareTask } = useTaskMutations(sharedTask.project_id);
    const [error, setError] = useState<string | null>(null);

    const close = () => {
      if (stopShareTask.isPending) {
        return;
      }
      stopShareTask.reset();
      modal.hide();
    };

    const handleCancel = () => {
      close();
      modal.reject();
    };

    const handleConfirm = async () => {
      setError(null);
      try {
        await stopShareTask.mutateAsync(sharedTask.id);
        modal.resolve();
        close();
      } catch (err: unknown) {
        const message =
          err instanceof Error
            ? err.message
            : t('stopShareDialog.genericError');
        setError(message);
      }
    };

    return (
      <Dialog
        open={modal.visible}
        onOpenChange={(open) => !open && handleCancel()}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('stopShareDialog.title')}</DialogTitle>
            <DialogDescription>
              {t('stopShareDialog.description', { title: sharedTask.title })}
            </DialogDescription>
          </DialogHeader>

          <Alert variant="destructive" className="mb-4">
            {t('stopShareDialog.warning')}
          </Alert>

          {error && (
            <Alert variant="destructive" className="mb-4">
              {error}
            </Alert>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={handleCancel}
              disabled={stopShareTask.isPending}
              autoFocus
            >
              {t('common:buttons.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirm}
              disabled={stopShareTask.isPending}
            >
              {stopShareTask.isPending
                ? t('stopShareDialog.inProgress')
                : t('stopShareDialog.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
);

export { StopShareTaskDialog };

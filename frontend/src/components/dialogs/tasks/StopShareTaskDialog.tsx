import { useRef, useState } from 'react';
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
import { useProject } from '@/contexts/project-context';

export interface StopShareTaskDialogProps {
  sharedTask: SharedTaskRecord;
}

const StopShareTaskDialog = NiceModal.create<StopShareTaskDialogProps>(
  ({ sharedTask }) => {
    const modal = useModal();
    const { t } = useTranslation('tasks');
    const { projectId } = useProject();
    const { stopShareTask } = useTaskMutations(projectId ?? undefined);
    const [error, setError] = useState<string | null>(null);
    const isProgrammaticCloseRef = useRef(false);
    const didConfirmRef = useRef(false);

    const getReadableError = (err: unknown) =>
      err instanceof Error && err.message
        ? err.message
        : t('stopShareDialog.genericError');

    const requestClose = (didConfirm: boolean) => {
      if (stopShareTask.isPending) {
        return;
      }
      isProgrammaticCloseRef.current = true;
      didConfirmRef.current = didConfirm;
      modal.hide();
    };

    const handleCancel = () => {
      requestClose(false);
    };

    const handleConfirm = async () => {
      setError(null);
      try {
        await stopShareTask.mutateAsync(sharedTask.id);
        requestClose(true);
      } catch (err: unknown) {
        setError(getReadableError(err));
      }
    };

    return (
      <Dialog
        open={modal.visible}
        onOpenChange={(open) => {
          if (open) {
            stopShareTask.reset();
            setError(null);
            isProgrammaticCloseRef.current = false;
            didConfirmRef.current = false;
            return;
          }

          if (stopShareTask.isPending) {
            return;
          }

          const shouldResolve =
            isProgrammaticCloseRef.current && didConfirmRef.current;

          isProgrammaticCloseRef.current = false;
          didConfirmRef.current = false;
          stopShareTask.reset();

          if (shouldResolve) {
            modal.resolve();
          } else {
            modal.reject();
          }
        }}
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

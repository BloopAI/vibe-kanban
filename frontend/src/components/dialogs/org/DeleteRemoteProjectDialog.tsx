import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2 } from 'lucide-react';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { useTranslation } from 'react-i18next';
import { defineModal } from '@/lib/modals';

export interface DeleteRemoteProjectDialogProps {
  projectName: string;
}

export type DeleteRemoteProjectResult = 'deleted' | 'canceled';

const DeleteRemoteProjectDialogImpl =
  NiceModal.create<DeleteRemoteProjectDialogProps>(({ projectName }) => {
    const modal = useModal();
    const { t } = useTranslation(['projects', 'common']);
    const [isDeleting, setIsDeleting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleDelete = async () => {
      setIsDeleting(true);
      setError(null);

      try {
        // Resolve with 'deleted' to let parent handle the deletion
        modal.resolve('deleted' as DeleteRemoteProjectResult);
        modal.hide();
      } catch {
        setError(
          t(
            'deleteProjectDialog.error',
            'Failed to delete project. Please try again.'
          )
        );
      } finally {
        setIsDeleting(false);
      }
    };

    const handleCancel = () => {
      modal.resolve('canceled' as DeleteRemoteProjectResult);
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
            <DialogTitle>
              {t('deleteProjectDialog.title', 'Delete Project?')}
            </DialogTitle>
            <DialogDescription>
              {t(
                'deleteProjectDialog.description',
                'This will permanently delete "{{name}}" and all its issues. This action cannot be undone.',
                { name: projectName }
              )}
            </DialogDescription>
          </DialogHeader>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={handleCancel}
              disabled={isDeleting}
            >
              {t('common:buttons.cancel', 'Cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('common:buttons.delete', 'Delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  });

export const DeleteRemoteProjectDialog = defineModal<
  DeleteRemoteProjectDialogProps,
  DeleteRemoteProjectResult
>(DeleteRemoteProjectDialogImpl);

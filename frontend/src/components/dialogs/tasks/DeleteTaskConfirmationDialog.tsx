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
import { tasksApi } from '@/lib/api';
import type { TaskWithAttemptStatus } from 'shared/types';
import NiceModal, { useModal } from '@ebay/nice-modal-react';

export interface DeleteTaskConfirmationDialogProps {
  task: TaskWithAttemptStatus;
  projectId: string;
}

const DeleteTaskConfirmationDialog =
  NiceModal.create<DeleteTaskConfirmationDialogProps>(({ task }) => {
    const modal = useModal();
    const [isDeleting, setIsDeleting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleConfirmDelete = async () => {
      setIsDeleting(true);
      setError(null);

      try {
        await tasksApi.delete(task.id);
        modal.resolve();
        modal.hide();
      } catch (err: unknown) {
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to delete task';
        setError(errorMessage);
      } finally {
        setIsDeleting(false);
      }
    };

    const handleCancelDelete = () => {
      modal.reject();
      modal.hide();
    };

    return (
      <Dialog
        open={modal.visible}
        onOpenChange={(open) => !open && handleCancelDelete()}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Task</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{' '}
              <span className="font-semibold">"{task.title}"</span>?
            </DialogDescription>
          </DialogHeader>

          <Alert variant="destructive" className="mb-4">
            <strong>Warning:</strong> This action will permanently delete the
            task and cannot be undone.
          </Alert>

          {error && (
            <Alert variant="destructive" className="mb-4">
              {error}
            </Alert>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={handleCancelDelete}
              disabled={isDeleting}
              autoFocus
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting...' : 'Delete Task'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  });

export { DeleteTaskConfirmationDialog };

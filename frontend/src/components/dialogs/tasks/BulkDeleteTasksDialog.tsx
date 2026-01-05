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
import type { TaskStatus } from 'shared/types';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { defineModal } from '@/lib/modals';

export interface BulkDeleteTasksDialogProps {
  projectId: string;
  status: TaskStatus;
  count: number;
}

const BulkDeleteTasksDialogImpl =
  NiceModal.create<BulkDeleteTasksDialogProps>(
    ({ projectId, status, count }) => {
      const modal = useModal();
      const [isDeleting, setIsDeleting] = useState(false);
      const [error, setError] = useState<string | null>(null);

      const handleConfirmDelete = async () => {
        setIsDeleting(true);
        setError(null);

        try {
          await tasksApi.bulkDelete({ project_id: projectId, status });
          modal.resolve();
          modal.hide();
        } catch (err: unknown) {
          const errorMessage =
            err instanceof Error ? err.message : 'Failed to delete tasks';
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
              <DialogTitle>Clear Done Tasks</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete{' '}
                <span className="font-semibold">
                  {count} {count === 1 ? 'task' : 'tasks'}
                </span>
                ?
              </DialogDescription>
            </DialogHeader>

            <Alert variant="destructive" className="mb-4">
              <strong>Warning:</strong> This action will permanently delete all
              done tasks and cannot be undone.
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
                {isDeleting ? 'Deleting...' : `Delete ${count} Tasks`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      );
    }
  );

export const BulkDeleteTasksDialog = defineModal<
  BulkDeleteTasksDialogProps,
  void
>(BulkDeleteTasksDialogImpl);

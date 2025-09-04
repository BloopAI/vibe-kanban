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

type Props = {
  task: TaskWithAttemptStatus;
  projectId: string;
  onClose: () => void;
  onDeleted: () => void;
};

function DeleteTaskConfirmationDialog({ task, onClose, onDeleted }: Props) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirmDelete = async () => {
    setIsDeleting(true);
    setError(null);

    try {
      await tasksApi.delete(task.id);
      onDeleted();
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to delete task';
      setError(errorMessage);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCancelDelete = () => {
    onClose();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Task</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete{' '}
            <span className="font-semibold">"{task.title}"</span>?
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <div className="bg-red-50 border border-red-200 rounded-md p-3">
            <p className="text-sm text-red-800">
              <strong>Warning:</strong> This action will permanently delete the
              task and cannot be undone.
            </p>
          </div>
        </div>

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
}

export default DeleteTaskConfirmationDialog;

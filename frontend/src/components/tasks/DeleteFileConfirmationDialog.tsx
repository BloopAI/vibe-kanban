import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.tsx';
import { Button } from '@/components/ui/button.tsx';
import { attemptsApi } from '@/lib/api.ts';
import { useTaskDeletingFiles } from '@/stores/useTaskDetailsUiStore';
import type { Task, TaskAttempt } from 'shared/types';

type Props = {
  task: Task;
  projectId: string;
  selectedAttempt: TaskAttempt | null;
};

function DeleteFileConfirmationDialog({
  task,
  projectId,
  selectedAttempt,
}: Props) {
  const { setDeletingFiles, fileToDelete, deletingFiles, setFileToDelete } =
    useTaskDeletingFiles(task.id);

  const handleConfirmDelete = async () => {
    if (!fileToDelete || !projectId || !task?.id || !selectedAttempt?.id)
      return;

    setDeletingFiles(new Set([...deletingFiles, fileToDelete]));

    try {
      await attemptsApi.deleteFile(selectedAttempt.id, fileToDelete);
    } catch (error: unknown) {
      console.error('Failed to delete file:', error);
    } finally {
      const newSet = new Set(deletingFiles);
      newSet.delete(fileToDelete);
      setDeletingFiles(newSet);
      setFileToDelete(null);
    }
  };

  const handleCancelDelete = () => {
    setFileToDelete(null);
  };

  return (
    <Dialog open={!!fileToDelete} onOpenChange={() => handleCancelDelete()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete File</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete the file{' '}
            <span className="font-mono font-medium">"{fileToDelete}"</span>?
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <div className="bg-red-50 border border-red-200 rounded-md p-3">
            <p className="text-sm text-red-800">
              <strong>Warning:</strong> This action will permanently remove the
              entire file from the worktree. This cannot be undone.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleCancelDelete}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirmDelete}
            disabled={deletingFiles.has(fileToDelete || '')}
          >
            {deletingFiles.has(fileToDelete || '')
              ? 'Deleting...'
              : 'Delete File'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default DeleteFileConfirmationDialog;

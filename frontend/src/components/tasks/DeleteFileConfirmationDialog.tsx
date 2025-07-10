import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.tsx';
import { Button } from '@/components/ui/button.tsx';

type Props = {
  fileToDelete: string | null;
  handleCancelDelete: () => void;
  handleConfirmDelete: () => void;
  deletingFiles: Set<string>;
};

function DeleteFileConfirmationDialog({
  fileToDelete,
  handleCancelDelete,
  handleConfirmDelete,
  deletingFiles,
}: Props) {
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

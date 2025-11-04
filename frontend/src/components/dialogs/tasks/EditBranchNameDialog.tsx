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
import { Input } from '@/components/ui/input';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { attemptsApi } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';

export interface EditBranchNameDialogProps {
  attemptId: string;
  currentBranchName: string;
}

export type EditBranchNameDialogResult = {
  action: 'confirmed' | 'canceled';
  branchName?: string;
};

export const EditBranchNameDialog = NiceModal.create<EditBranchNameDialogProps>(
  ({ attemptId, currentBranchName }) => {
    const modal = useModal();
    const { t } = useTranslation(['tasks', 'common']);
    const queryClient = useQueryClient();
    const [branchName, setBranchName] = useState<string>(currentBranchName);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleConfirm = async () => {
      const trimmedName = branchName.trim();

      if (!trimmedName) {
        setError('Branch name cannot be empty');
        return;
      }

      if (trimmedName === currentBranchName) {
        modal.resolve({ action: 'canceled' } as EditBranchNameDialogResult);
        modal.hide();
        return;
      }

      if (trimmedName.includes(' ')) {
        setError('Branch name cannot contain spaces');
        return;
      }

      try {
        setIsLoading(true);
        setError(null);
        await attemptsApi.renameBranch(attemptId, trimmedName);

        await Promise.all([
          // Main query key used by DiffsPanel and project-tasks.tsx
          queryClient.invalidateQueries({
            queryKey: ['taskAttempt', attemptId],
          }),
          // Legacy key for backward compatibility (NextActionCard, etc.)
          queryClient.invalidateQueries({ queryKey: ['attempt', attemptId] }),
          // Branch-specific data
          queryClient.invalidateQueries({
            queryKey: ['attemptBranch', attemptId],
          }),
          // Git operations panel data
          queryClient.invalidateQueries({
            queryKey: ['branchStatus', attemptId],
          }),
          // List of attempts (shows branch names in task panel)
          queryClient.invalidateQueries({ queryKey: ['taskAttempts'] }),
        ]);

        modal.resolve({
          action: 'confirmed',
          branchName: trimmedName,
        } as EditBranchNameDialogResult);
        modal.hide();
      } catch (err: any) {
        setError(err.message || 'Failed to rename branch');
        setIsLoading(false);
      }
    };

    const handleCancel = () => {
      modal.resolve({ action: 'canceled' } as EditBranchNameDialogResult);
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
            <DialogTitle>Edit Branch Name</DialogTitle>
            <DialogDescription>
              Enter a new name for the branch. Cannot rename if an open PR
              exists.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="branch-name" className="text-sm font-medium">
                Branch Name
              </label>
              <Input
                id="branch-name"
                type="text"
                value={branchName}
                onChange={(e) => {
                  setBranchName(e.target.value);
                  setError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !isLoading) {
                    handleConfirm();
                  }
                }}
                placeholder="e.g., feature/my-branch"
                disabled={isLoading}
                autoFocus
              />
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={handleCancel}
              disabled={isLoading}
            >
              {t('common:buttons.cancel')}
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={isLoading || !branchName.trim()}
            >
              {isLoading ? 'Renaming...' : 'Rename Branch'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
);

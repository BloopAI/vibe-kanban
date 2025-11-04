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
import { useRenameBranch } from '@/hooks/useRenameBranch';

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
    const [branchName, setBranchName] = useState<string>(currentBranchName);
    const [error, setError] = useState<string | null>(null);

    const renameMutation = useRenameBranch(
      attemptId,
      (newBranch) => {
        modal.resolve({
          action: 'confirmed',
          branchName: newBranch,
        } as EditBranchNameDialogResult);
        modal.hide();
      },
      (err: any) => {
        setError(err?.message || 'Failed to rename branch');
      }
    );

    const handleConfirm = () => {
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

      setError(null);
      renameMutation.mutate(trimmedName);
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
            <DialogTitle>{t('editBranchName.dialog.title')}</DialogTitle>
            <DialogDescription>
              {t('editBranchName.dialog.description')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="branch-name" className="text-sm font-medium">
                {t('editBranchName.dialog.branchNameLabel')}
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
                  if (e.key === 'Enter' && !renameMutation.isPending) {
                    handleConfirm();
                  }
                }}
                placeholder={t('editBranchName.dialog.placeholder')}
                disabled={renameMutation.isPending}
                autoFocus
              />
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={handleCancel}
              disabled={renameMutation.isPending}
            >
              {t('common:buttons.cancel')}
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={renameMutation.isPending || !branchName.trim()}
            >
              {renameMutation.isPending
                ? t('editBranchName.dialog.renaming')
                : t('editBranchName.dialog.action')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
);

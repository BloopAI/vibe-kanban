import { useEffect, useState } from 'react';
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
import { defineModal, getErrorMessage } from '@/lib/modals';
import { useRenameBranch } from '@/hooks/useRenameBranch';
import { ApiError } from '@/lib/api';
import type { RenameBranchError } from 'shared/types';

export interface EditBranchNameDialogProps {
  attemptId: string;
  currentBranchName: string;
}

export type EditBranchNameDialogResult = {
  action: 'confirmed' | 'canceled';
  branchName?: string;
};

function formatRenameBranchError(error: RenameBranchError): string {
  switch (error.type) {
    case 'empty_branch_name':
      return 'Branch name cannot be empty';
    case 'invalid_branch_name_format':
      return 'Invalid branch name format. Branch names cannot contain spaces or special characters like ~, ^, :, ?, *, [, \\';
    case 'open_pull_request':
      return 'Cannot rename branch while a pull request is open';
    case 'branch_already_exists':
      return `Branch name already exists in repository "${error.repo_name}"`;
    case 'rebase_in_progress':
      return `Cannot rename branch while a rebase is in progress in repository "${error.repo_name}"`;
    case 'rename_failed':
      return `Failed to rename branch in repository "${error.repo_name}": ${error.message}`;
    default:
      return 'Failed to rename branch';
  }
}

const EditBranchNameDialogImpl = NiceModal.create<EditBranchNameDialogProps>(
  ({ attemptId, currentBranchName }) => {
    const modal = useModal();
    const { t } = useTranslation(['tasks', 'common']);
    const [branchName, setBranchName] = useState<string>(currentBranchName);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
      setBranchName(currentBranchName);
      setError(null);
    }, [currentBranchName]);

    const renameMutation = useRenameBranch(
      attemptId,
      (newBranch) => {
        modal.resolve({
          action: 'confirmed',
          branchName: newBranch,
        } as EditBranchNameDialogResult);
        modal.hide();
      },
      (err: unknown) => {
        // intenta extraer el error tipado de la respuesta
        if (err instanceof ApiError && err.error_data) {
          const errorData = err.error_data as RenameBranchError;
          setError(formatRenameBranchError(errorData));
        } else {
          setError(getErrorMessage(err) || 'Failed to rename branch');
        }
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

export const EditBranchNameDialog = defineModal<
  EditBranchNameDialogProps,
  EditBranchNameDialogResult
>(EditBranchNameDialogImpl);

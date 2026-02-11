import { useState, useMemo } from 'react';
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
import { Checkbox } from '@/components/ui/checkbox';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { WarningIcon, GitBranchIcon } from '@phosphor-icons/react';
import { defineModal } from '@/lib/modals';
import { useBranchStatus } from '@/hooks/useBranchStatus';
import type { Merge } from 'shared/types';

export interface DeleteWorkspaceDialogProps {
  workspaceId: string;
  branchName: string;
}

export type DeleteWorkspaceDialogResult = {
  action: 'confirmed' | 'canceled';
  deleteBranches?: boolean;
};

const DeleteWorkspaceDialogImpl = NiceModal.create<DeleteWorkspaceDialogProps>(
  ({ workspaceId, branchName }) => {
    const modal = useModal();
    const { t } = useTranslation();
    const [deleteBranches, setDeleteBranches] = useState(false);

    // Check if branch deletion is safe by looking for open PRs
    const { data: branchStatus } = useBranchStatus(workspaceId);

    const hasOpenPR = useMemo(() => {
      if (!branchStatus) return false;
      return branchStatus.some((repoStatus) =>
        repoStatus.merges?.some(
          (m: Merge) => m.type === 'pr' && m.pr_info.status === 'open'
        )
      );
    }, [branchStatus]);

    const canDeleteBranches = !hasOpenPR;

    const handleConfirm = () => {
      modal.resolve({
        action: 'confirmed',
        deleteBranches: canDeleteBranches && deleteBranches,
      } as DeleteWorkspaceDialogResult);
      modal.hide();
    };

    const handleCancel = () => {
      modal.resolve({ action: 'canceled' } as DeleteWorkspaceDialogResult);
      modal.hide();
    };

    return (
      <Dialog open={modal.visible} onOpenChange={handleCancel}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <WarningIcon className="h-6 w-6 text-destructive" />
              <DialogTitle>
                {t('workspaces.deleteDialog.title', 'Delete Workspace')}
              </DialogTitle>
            </div>
            <DialogDescription className="text-left pt-2">
              {t(
                'workspaces.deleteDialog.description',
                'Are you sure you want to delete this workspace? This action cannot be undone.'
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <div className="flex items-start space-x-3">
              <Checkbox
                id="delete-branches"
                checked={deleteBranches}
                onCheckedChange={(checked) => setDeleteBranches(checked)}
                disabled={!canDeleteBranches}
              />
              <div className="flex flex-col gap-1">
                <label
                  htmlFor="delete-branches"
                  className={`text-sm font-medium leading-none cursor-pointer ${
                    !canDeleteBranches
                      ? 'text-muted-foreground cursor-not-allowed'
                      : ''
                  }`}
                  onClick={() =>
                    canDeleteBranches && setDeleteBranches(!deleteBranches)
                  }
                >
                  <span className="flex items-center gap-2">
                    <GitBranchIcon className="h-4 w-4" />
                    <>
                      {t(
                        'workspaces.deleteDialog.deleteBranchLabel',
                        'Delete branch'
                      )}{' '}
                      <code className="rounded bg-muted px-1 py-0.5 text-xs font-mono">
                        {branchName}
                      </code>
                    </>
                  </span>
                </label>
                {hasOpenPR && (
                  <p className="text-xs text-muted-foreground">
                    {t(
                      'workspaces.deleteDialog.cannotDeleteOpenPr',
                      'Cannot delete branch while PR is open'
                    )}
                  </p>
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={handleCancel}>
              {t('confirm.defaultCancel', 'Cancel')}
            </Button>
            <Button variant="destructive" onClick={handleConfirm}>
              {t('confirm.delete', 'Delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
);

export const DeleteWorkspaceDialog = defineModal<
  DeleteWorkspaceDialogProps,
  DeleteWorkspaceDialogResult
>(DeleteWorkspaceDialogImpl);

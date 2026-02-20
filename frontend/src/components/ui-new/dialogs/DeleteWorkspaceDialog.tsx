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
import {
  WarningIcon,
  GitBranchIcon,
  LinkBreakIcon,
} from '@phosphor-icons/react';
import { defineModal } from '@/lib/modals';
import { useBranchStatus } from '@/hooks/useBranchStatus';
import { useShape } from '@/lib/electric/hooks';
import { PROJECT_ISSUES_SHAPE } from 'shared/remote-types';
import type { Merge } from 'shared/types';

export interface DeleteWorkspaceDialogProps {
  workspaceId: string;
  branchName: string;
  linkedIssueId?: string;
  linkedProjectId?: string;
}

export type DeleteWorkspaceDialogResult = {
  action: 'confirmed' | 'canceled';
  deleteBranches?: boolean;
  unlinkFromIssue?: boolean;
};

const DeleteWorkspaceDialogImpl = NiceModal.create<DeleteWorkspaceDialogProps>(
  ({ workspaceId, branchName, linkedIssueId, linkedProjectId }) => {
    const modal = useModal();
    const { t } = useTranslation();
    const [deleteBranches, setDeleteBranches] = useState(false);
    const [unlinkFromIssue, setUnlinkFromIssue] = useState(true);

    // Fetch issue data via Electric sync to show issue simple_id
    const isLinkedToIssue = !!linkedIssueId;
    const { data: issues } = useShape(
      PROJECT_ISSUES_SHAPE,
      {
        project_id: linkedProjectId ?? '',
      },
      { enabled: !!linkedProjectId }
    );
    const linkedIssue = useMemo(
      () => (linkedIssueId ? issues.find((i) => i.id === linkedIssueId) : null),
      [issues, linkedIssueId]
    );

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
        unlinkFromIssue: isLinkedToIssue && unlinkFromIssue,
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

          <div className="py-4 space-y-4">
            <div className="flex flex-col gap-1">
              <div
                className={`flex items-center gap-3 text-sm font-medium select-none ${
                  canDeleteBranches
                    ? 'cursor-pointer'
                    : 'text-muted-foreground cursor-not-allowed'
                }`}
                onClick={() => {
                  if (canDeleteBranches) setDeleteBranches((v) => !v);
                }}
              >
                <Checkbox
                  checked={deleteBranches}
                  disabled={!canDeleteBranches}
                />
                <span className="flex items-center gap-2">
                  <GitBranchIcon className="h-4 w-4" />
                  {t(
                    'workspaces.deleteDialog.deleteBranchLabel',
                    'Delete branch'
                  )}{' '}
                  <code className="rounded bg-muted px-1 py-0.5 text-xs font-mono">
                    {branchName}
                  </code>
                </span>
              </div>
              {hasOpenPR && (
                <p className="text-xs text-muted-foreground pl-7">
                  {t(
                    'workspaces.deleteDialog.cannotDeleteOpenPr',
                    'Cannot delete branch while PR is open'
                  )}
                </p>
              )}
            </div>
            {isLinkedToIssue && (
              <div
                className="flex items-center gap-3 text-sm font-medium cursor-pointer select-none"
                onClick={() => setUnlinkFromIssue((v) => !v)}
              >
                <Checkbox checked={unlinkFromIssue} />
                <span className="flex items-center gap-2">
                  <LinkBreakIcon className="h-4 w-4" />
                  {t(
                    'workspaces.deleteDialog.unlinkFromIssueLabel',
                    'Also unlink from issue'
                  )}
                  {linkedIssue?.simple_id && (
                    <>
                      {' '}
                      <code className="rounded bg-muted px-1 py-0.5 text-xs font-mono">
                        {linkedIssue.simple_id}
                      </code>
                    </>
                  )}
                </span>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={handleCancel}>
              {t('buttons.cancel')}
            </Button>
            <Button variant="destructive" onClick={handleConfirm}>
              {t('buttons.delete')}
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

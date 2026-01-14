import { useEffect, useState } from 'react';
import { CaretRightIcon } from '@phosphor-icons/react';
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
import BranchSelector from '@/components/tasks/BranchSelector';
import type { GitBranch, GitOperationError } from 'shared/types';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { defineModal } from '@/lib/modals';
import { GitOperationsProvider } from '@/contexts/GitOperationsContext';
import { useGitOperations } from '@/hooks/useGitOperations';
import { useAttempt } from '@/hooks/useAttempt';
import { attemptsApi, type Result } from '@/lib/api';
import { ResolveConflictsDialog } from './ResolveConflictsDialog';

export interface RebaseDialogProps {
  attemptId: string;
  repoId: string;
  branches: GitBranch[];
  initialTargetBranch?: string;
}

interface RebaseDialogContentProps {
  attemptId: string;
  repoId: string;
  branches: GitBranch[];
  initialTargetBranch?: string;
}

function RebaseDialogContent({
  attemptId,
  repoId,
  branches,
  initialTargetBranch,
}: RebaseDialogContentProps) {
  const modal = useModal();
  const { t } = useTranslation(['tasks', 'common']);
  const [selectedBranch, setSelectedBranch] = useState<string>(
    initialTargetBranch ?? ''
  );
  const [selectedUpstream, setSelectedUpstream] = useState<string>(
    initialTargetBranch ?? ''
  );
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const git = useGitOperations(attemptId, repoId);
  const { data: workspace } = useAttempt(attemptId);

  useEffect(() => {
    if (initialTargetBranch) {
      setSelectedBranch(initialTargetBranch);
      setSelectedUpstream(initialTargetBranch);
    }
  }, [initialTargetBranch]);

  const handleConfirm = async () => {
    if (!selectedBranch) return;

    setError(null);
    try {
      await git.actions.rebase({
        repoId,
        newBaseBranch: selectedBranch,
        oldBaseBranch: selectedUpstream,
      });
      modal.hide();
    } catch (err) {
      // Check if this is a conflict error (Result type with success=false)
      const resultErr = err as Result<void, GitOperationError> | undefined;
      const errorType =
        resultErr && !resultErr.success ? resultErr.error?.type : undefined;

      if (
        errorType === 'merge_conflicts' ||
        errorType === 'rebase_in_progress'
      ) {
        // Hide this dialog and show the resolve conflicts dialog
        modal.hide();

        // Fetch fresh branch status to get conflict details
        const branchStatus = await attemptsApi.getBranchStatus(attemptId);
        const repoStatus = branchStatus?.find((s) => s.repo_id === repoId);

        if (repoStatus) {
          await ResolveConflictsDialog.show({
            workspaceId: attemptId,
            conflictOp: repoStatus.conflict_op ?? 'rebase',
            sourceBranch: workspace?.branch ?? null,
            targetBranch: repoStatus.target_branch_name,
            conflictedFiles: repoStatus.conflicted_files ?? [],
            repoName: repoStatus.repo_name,
          });
        }
        return;
      }

      // Handle other errors
      let message = 'Failed to rebase';
      if (err && typeof err === 'object') {
        // Handle Result<void, GitOperationError> structure
        if (
          'error' in err &&
          err.error &&
          typeof err.error === 'object' &&
          'message' in err.error
        ) {
          message = String(err.error.message);
        } else if ('message' in err && err.message) {
          message = String(err.message);
        }
      }
      setError(message);
    }
  };

  const handleCancel = () => {
    modal.hide();
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      handleCancel();
    }
  };

  const isLoading = git.states.rebasePending;

  return (
    <Dialog open={modal.visible} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('rebase.dialog.title')}</DialogTitle>
          <DialogDescription>
            {t('rebase.dialog.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="target-branch" className="text-sm font-medium">
              {t('rebase.dialog.targetLabel')}
            </label>
            <BranchSelector
              branches={branches}
              selectedBranch={selectedBranch}
              onBranchSelect={setSelectedBranch}
              placeholder={t('rebase.dialog.targetPlaceholder')}
              excludeCurrentBranch={false}
            />
          </div>
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setShowAdvanced((prev) => !prev)}
              className="flex w-full items-center gap-2 text-left text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <CaretRightIcon
                className={`h-3 w-3 transition-transform ${showAdvanced ? 'rotate-90' : ''}`}
              />
              <span>{t('rebase.dialog.advanced')}</span>
            </button>
            {showAdvanced && (
              <div className="space-y-2">
                <label
                  htmlFor="upstream-branch"
                  className="text-sm font-medium"
                >
                  {t('rebase.dialog.upstreamLabel')}
                </label>
                <BranchSelector
                  branches={branches}
                  selectedBranch={selectedUpstream}
                  onBranchSelect={setSelectedUpstream}
                  placeholder={t('rebase.dialog.upstreamPlaceholder')}
                  excludeCurrentBranch={false}
                />
              </div>
            )}
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel} disabled={isLoading}>
            {t('common:buttons.cancel')}
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isLoading || !selectedBranch}
          >
            {isLoading
              ? t('rebase.common.inProgress')
              : t('rebase.common.action')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const RebaseDialogImpl = NiceModal.create<RebaseDialogProps>(
  ({ attemptId, repoId, branches, initialTargetBranch }) => {
    return (
      <GitOperationsProvider attemptId={attemptId}>
        <RebaseDialogContent
          attemptId={attemptId}
          repoId={repoId}
          branches={branches}
          initialTargetBranch={initialTargetBranch}
        />
      </GitOperationsProvider>
    );
  }
);

export const RebaseDialog = defineModal<RebaseDialogProps, void>(
  RebaseDialogImpl
);

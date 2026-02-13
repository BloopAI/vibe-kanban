import { useEffect, useRef, useState } from 'react';
import { CaretRightIcon, SpinnerIcon } from '@phosphor-icons/react';
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
import type { GitOperationError } from 'shared/types';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { defineModal } from '@/lib/modals';
import { GitOperationsProvider } from '@/contexts/GitOperationsContext';
import { useGitOperations } from '@/hooks/useGitOperations';
import { useAttempt } from '@/hooks/useAttempt';
import { useRepoBranches } from '@/hooks/useRepoBranches';
import { useAttemptRepo } from '@/hooks/useAttemptRepo';
import { useBranchStatus } from '@/hooks/useBranchStatus';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { useWorkspaces } from '@/components/ui-new/hooks/useWorkspaces';
import type { Result } from '@/lib/api';
import { ResolveConflictsDialog } from './ResolveConflictsDialog';
import { RebaseInProgressDialog } from './RebaseInProgressDialog';

export interface RebaseDialogProps {
  attemptId: string;
  repoId: string;
}

interface RebaseDialogContentProps {
  attemptId: string;
  repoId: string;
}

function RebaseDialogContent({ attemptId, repoId }: RebaseDialogContentProps) {
  const modal = useModal();
  const { t } = useTranslation(['tasks', 'common']);
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [selectedUpstream, setSelectedUpstream] = useState<string>('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasInitializedBranches, setHasInitializedBranches] = useState(false);

  const git = useGitOperations(attemptId, repoId);
  const { data: workspace } = useAttempt(attemptId);
  const { workspaceId: activeWorkspaceId } = useWorkspaceContext();
  const { workspaces } = useWorkspaces();
  const isWorkspaceRunning =
    workspaces.find((w) => w.id === attemptId)?.isRunning ?? false;

  // Load branches and repo data internally
  const { data: branches = [], isLoading: branchesLoading } =
    useRepoBranches(repoId);
  const { repos, isLoading: reposLoading } = useAttemptRepo(attemptId);
  const { data: branchStatus, isLoading: branchStatusLoading } =
    useBranchStatus(attemptId);

  const repo = repos.find((r) => r.id === repoId);
  const repoStatus = branchStatus?.find((s) => s.repo_id === repoId);
  const initialTargetBranch = repo?.target_branch;

  const isInitialLoading =
    branchesLoading || reposLoading || branchStatusLoading;

  // Check for existing conflicts and rebase state
  const isRebaseInProgress = repoStatus?.is_rebase_in_progress ?? false;
  const hasConflictedFiles = (repoStatus?.conflicted_files?.length ?? 0) > 0;

  // Prevent the redirect useEffect from firing more than once. Without this,
  // every 5-second branchStatus poll that still returns conflicts would
  // re-open the ResolveConflictsDialog (e.g. during long multi-commit rebases).
  const hasRedirectedRef = useRef(false);

  // If rebase is in progress, redirect to the appropriate dialog
  // Only show if the user is still viewing this workspace
  useEffect(() => {
    if (
      !isInitialLoading &&
      (isRebaseInProgress || hasConflictedFiles) &&
      repoStatus &&
      !hasRedirectedRef.current
    ) {
      hasRedirectedRef.current = true;
      modal.hide();

      // Don't show the dialog if the user switched away or if
      // a process is already running (e.g. resolving these conflicts).
      if (activeWorkspaceId !== attemptId || isWorkspaceRunning) return;

      if (hasConflictedFiles) {
        // Rebase in progress WITH conflicts -> show resolve conflicts dialog
        ResolveConflictsDialog.show({
          workspaceId: attemptId,
          conflictOp: repoStatus.conflict_op ?? 'rebase',
          sourceBranch: workspace?.branch ?? null,
          targetBranch: repoStatus.target_branch_name,
          conflictedFiles: repoStatus.conflicted_files ?? [],
          repoName: repoStatus.repo_name,
        });
      } else {
        // Rebase in progress WITHOUT conflicts -> show simpler dialog
        RebaseInProgressDialog.show({
          workspaceId: attemptId,
          repoId,
          targetBranch: repoStatus.target_branch_name,
        });
      }
    }
  }, [
    isInitialLoading,
    isRebaseInProgress,
    hasConflictedFiles,
    repoStatus,
    attemptId,
    repoId,
    workspace?.branch,
    modal,
    activeWorkspaceId,
    isWorkspaceRunning,
  ]);

  // Reset initialization flag when attemptId or repoId changes
  useEffect(() => {
    setHasInitializedBranches(false);
  }, [attemptId, repoId]);

  // Initialize branch selection once data is loaded
  useEffect(() => {
    if (!hasInitializedBranches && initialTargetBranch && !isInitialLoading) {
      setSelectedBranch(initialTargetBranch);
      setSelectedUpstream(initialTargetBranch);
      setHasInitializedBranches(true);
    }
  }, [initialTargetBranch, isInitialLoading, hasInitializedBranches]);

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
      const errorData =
        resultErr && !resultErr.success ? resultErr.error : undefined;

      if (errorData?.type === 'merge_conflicts') {
        // Hide this dialog and show the resolve conflicts dialog
        // Only show if the user is still viewing this workspace
        modal.hide();
        if (activeWorkspaceId === attemptId) {
          await ResolveConflictsDialog.show({
            workspaceId: attemptId,
            conflictOp: errorData.op,
            sourceBranch: workspace?.branch ?? null,
            targetBranch: errorData.target_branch,
            conflictedFiles: errorData.conflicted_files,
            repoName: undefined,
          });
        }
        return;
      }

      if (errorData?.type === 'rebase_in_progress') {
        // Hide this dialog and show the simpler rebase in progress dialog
        modal.hide();
        await RebaseInProgressDialog.show({
          workspaceId: attemptId,
          repoId,
          targetBranch: selectedBranch,
        });
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

  const isRebasePending = git.states.rebasePending;

  // Don't render if we're redirecting to another dialog
  if (!isInitialLoading && (isRebaseInProgress || hasConflictedFiles)) {
    return null;
  }

  return (
    <Dialog open={modal.visible} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('rebase.dialog.title')}</DialogTitle>
          <DialogDescription>
            {t('rebase.dialog.description')}
          </DialogDescription>
        </DialogHeader>

        {isInitialLoading ? (
          <div className="flex items-center justify-center py-8">
            <SpinnerIcon className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
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
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={isRebasePending}
          >
            {t('common:buttons.cancel')}
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isInitialLoading || isRebasePending || !selectedBranch}
          >
            {isRebasePending
              ? t('rebase.common.inProgress')
              : t('rebase.common.action')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const RebaseDialogImpl = NiceModal.create<RebaseDialogProps>(
  ({ attemptId, repoId }) => {
    return (
      <GitOperationsProvider attemptId={attemptId}>
        <RebaseDialogContent attemptId={attemptId} repoId={repoId} />
      </GitOperationsProvider>
    );
  }
);

export const RebaseDialog = defineModal<RebaseDialogProps, void>(
  RebaseDialogImpl
);

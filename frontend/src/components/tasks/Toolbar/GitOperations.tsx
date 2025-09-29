import {
  ArrowRight,
  GitBranch as GitBranchIcon,
  GitPullRequest,
  RefreshCw,
  Settings,
  AlertTriangle,
  CheckCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button.tsx';
import { Card } from '@/components/ui/card';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip.tsx';
import { Dispatch, SetStateAction, useMemo, useState } from 'react';
import type {
  GitBranch,
  TaskAttempt,
  TaskWithAttemptStatus,
} from 'shared/types';
import { useRebase } from '@/hooks/useRebase';
import { useMerge } from '@/hooks/useMerge';
import { usePush } from '@/hooks/usePush';
import { useChangeTargetBranch } from '@/hooks/useChangeTargetBranch';
import NiceModal from '@ebay/nice-modal-react';
import { Err } from '@/lib/api';
import type { GitOperationError } from 'shared/types';
import { showModal } from '@/lib/modals';

interface GitOperationsProps {
  selectedAttempt: TaskAttempt;
  task: TaskWithAttemptStatus;
  projectId: string;
  branchStatus: any; // BranchStatus type from shared/types
  branches: GitBranch[];
  isAttemptRunning: boolean;
  creatingPR: boolean;
  setError: Dispatch<SetStateAction<string | null>>;
  selectedBranch: string | null;
}

function GitOperations({
  selectedAttempt,
  task,
  projectId,
  branchStatus,
  branches,
  isAttemptRunning,
  creatingPR,
  setError,
  selectedBranch,
}: GitOperationsProps) {
  // Git operation hooks
  const rebaseMutation = useRebase(selectedAttempt?.id, projectId);
  const mergeMutation = useMerge(selectedAttempt?.id);
  const pushMutation = usePush(selectedAttempt?.id);
  const changeTargetBranchMutation = useChangeTargetBranch(
    selectedAttempt?.id,
    projectId
  );
  const isChangingTargetBranch = changeTargetBranchMutation.isPending;

  // Git status calculations
  const hasConflictsCalculated = useMemo(
    () => Boolean((branchStatus?.conflicted_files?.length ?? 0) > 0),
    [branchStatus?.conflicted_files]
  );

  // Get display name for selected branch
  const selectedBranchDisplayName = useMemo(() => {
    if (!selectedBranch) return 'current';

    // For remote branches, show just the branch name without the remote prefix
    if (selectedBranch.includes('/')) {
      const parts = selectedBranch.split('/');
      return parts[parts.length - 1];
    }
    return selectedBranch;
  }, [selectedBranch]);

  // Local state for git operations
  const [merging, setMerging] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [rebasing, setRebasing] = useState(false);
  const [mergeSuccess, setMergeSuccess] = useState(false);
  const [pushSuccess, setPushSuccess] = useState(false);

  // Target branch change handlers
  const handleChangeTargetBranchClick = async (newBranch: string) => {
    await changeTargetBranchMutation
      .mutateAsync(newBranch)
      .then(() => setError(null))
      .catch((error) => {
        setError(error.message || 'Failed to change target branch');
      });
  };

  const handleChangeTargetBranchDialogOpen = async () => {
    try {
      const result = await showModal<{
        action: 'confirmed' | 'canceled';
        branchName: string;
      }>('change-target-branch-dialog', {
        branches,
        isChangingTargetBranch: isChangingTargetBranch,
      });

      if (result.action === 'confirmed' && result.branchName) {
        await handleChangeTargetBranchClick(result.branchName);
      }
    } catch (error) {
      // User cancelled - do nothing
    }
  };

  // Memoize merge status information to avoid repeated calculations
  const mergeInfo = useMemo(() => {
    if (!branchStatus?.merges)
      return {
        hasOpenPR: false,
        openPR: null,
        hasMergedPR: false,
        mergedPR: null,
        hasMerged: false,
        latestMerge: null,
      };

    const openPR = branchStatus.merges.find(
      (m: any) => m.type === 'pr' && m.pr_info.status === 'open'
    );

    const mergedPR = branchStatus.merges.find(
      (m: any) => m.type === 'pr' && m.pr_info.status === 'merged'
    );

    const merges = branchStatus.merges.filter(
      (m: any) =>
        m.type === 'direct' ||
        (m.type === 'pr' && m.pr_info.status === 'merged')
    );

    return {
      hasOpenPR: !!openPR,
      openPR,
      hasMergedPR: !!mergedPR,
      mergedPR,
      hasMerged: merges.length > 0,
      latestMerge: branchStatus.merges[0] || null, // Most recent merge
    };
  }, [branchStatus?.merges]);

  const mergeButtonLabel = useMemo(() => {
    if (mergeSuccess) return 'Merged!';
    if (merging) return 'Merging...';
    return 'Merge';
  }, [mergeSuccess, merging]);

  const rebaseButtonLabel = useMemo(() => {
    if (rebasing) return 'Rebasing...';
    return 'Rebase';
  }, [rebasing]);

  const handleMergeClick = async () => {
    if (!projectId || !selectedAttempt?.id || !selectedAttempt?.task_id) return;

    // Directly perform merge without checking branch status
    await performMerge();
  };

  const handlePushClick = async () => {
    try {
      setPushing(true);
      await pushMutation.mutateAsync();
      setError(null); // Clear any previous errors on success
      setPushSuccess(true);
      setTimeout(() => setPushSuccess(false), 2000);
    } catch (error: any) {
      setError(error.message || 'Failed to push changes');
    } finally {
      setPushing(false);
    }
  };

  const performMerge = async () => {
    try {
      setMerging(true);
      await mergeMutation.mutateAsync();
      setError(null); // Clear any previous errors on success
      setMergeSuccess(true);
      setTimeout(() => setMergeSuccess(false), 2000);
    } catch (error) {
      // @ts-expect-error it is type ApiError
      setError(error.message || 'Failed to merge changes');
    } finally {
      setMerging(false);
    }
  };

  const handleRebaseWithNewBranchAndUpstream = async (
    newBaseBranch: string,
    selectedUpstream: string
  ) => {
    setRebasing(true);
    await rebaseMutation
      .mutateAsync({
        newBaseBranch: newBaseBranch,
        oldBaseBranch: selectedUpstream,
      })
      .then(() => setError(null))
      .catch((err: Err<GitOperationError>) => {
        const data = err?.error;
        const isConflict =
          data?.type === 'merge_conflicts' ||
          data?.type === 'rebase_in_progress';
        if (!isConflict) setError(err.message || 'Failed to rebase branch');
      });
    setRebasing(false);
  };

  const handleRebaseDialogOpen = async () => {
    try {
      const defaultTargetBranch = selectedAttempt?.target_branch ?? '';
      const result = await showModal<{
        action: 'confirmed' | 'canceled';
        branchName?: string;
        upstreamBranch?: string;
      }>('rebase-dialog', {
        branches,
        isRebasing: rebasing,
        initialTargetBranch: defaultTargetBranch,
        initialUpstreamBranch: defaultTargetBranch,
      });
      if (
        result.action === 'confirmed' &&
        result.branchName &&
        result.upstreamBranch
      ) {
        await handleRebaseWithNewBranchAndUpstream(
          result.branchName,
          result.upstreamBranch
        );
      }
    } catch (error) {
      // User cancelled - do nothing
    }
  };

  const handlePRButtonClick = async () => {
    if (!projectId || !selectedAttempt?.id || !selectedAttempt?.task_id) return;

    // If PR already exists, push to it
    if (mergeInfo.hasOpenPR) {
      await handlePushClick();
      return;
    }

    NiceModal.show('create-pr', {
      attempt: selectedAttempt,
      task,
      projectId,
    });
  };

  if (!selectedAttempt || !branchStatus || mergeInfo.hasMergedPR) {
    return null;
  }

  return (
    <div>
      <Card className="bg-background p-3 border border-dashed text-sm">
        Git
      </Card>
      <div className="p-3 space-y-3">
        {/* Branch Flow with Status Below */}
        <div className="space-y-1 py-2">
          {/* Labels Row */}
          <div className="grid grid-cols-[1fr_auto_1fr] gap-4">
            {/* Task Branch Label - Left Column */}
            <div className="flex justify-start">
              <span className="text-xs text-muted-foreground">Task Branch</span>
            </div>
            {/* Center Column - Empty */}
            <div></div>
            {/* Target Branch Label - Right Column */}
            <div className="flex justify-end">
              <span className="text-xs text-muted-foreground">Target Branch</span>
            </div>
          </div>
          {/* Branches Row */}
          <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-center">
            {/* Task Branch - Left Column */}
            <div className="flex items-center justify-start gap-1.5 min-w-0">
              <GitBranchIcon className="h-3 w-3 text-muted-foreground" />
              <span className="text-sm font-medium truncate">
                {selectedAttempt.branch}
              </span>
            </div>

            {/* Arrow - Center Column */}
            <div className="flex justify-center">
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </div>

            {/* Target Branch - Right Column */}
            <div className="flex items-center justify-end gap-1.5 min-w-0">
              <GitBranchIcon className="h-3 w-3 text-muted-foreground" />
              <span className="text-sm font-medium truncate">
                {branchStatus?.target_branch_name || selectedBranchDisplayName}
              </span>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={handleChangeTargetBranchDialogOpen}
                      disabled={isAttemptRunning || hasConflictsCalculated}
                      className="h-4 w-4 p-0 hover:bg-muted ml-1"
                    >
                      <Settings className="h-2.5 w-2.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Change target branch</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>

          {/* Bottom Row: Status Information */}
          <div className="grid grid-cols-[1fr_auto_1fr] gap-4">
            {(() => {
              const commitsAhead = branchStatus?.commits_ahead ?? 0;
              const commitsBehind = branchStatus?.commits_behind ?? 0;

              // Handle special states (PR, conflicts, etc.) - center under arrow
              if (hasConflictsCalculated) {
                return (
                  <>
                    <div></div>
                    <div className="flex items-center justify-center gap-1 text-orange-600">
                      <AlertTriangle className="h-3 w-3" />
                      <span className="text-xs font-medium">Conflicts</span>
                    </div>
                    <div></div>
                  </>
                );
              }

              if (branchStatus?.is_rebase_in_progress) {
                return (
                  <>
                    <div></div>
                    <div className="flex items-center justify-center gap-1 text-orange-600">
                      <RefreshCw className="h-3 w-3 animate-spin" />
                      <span className="text-xs font-medium">Rebasing</span>
                    </div>
                    <div></div>
                  </>
                );
              }

              // Check for merged PR
              if (mergeInfo.hasMergedPR) {
                return (
                  <>
                    <div></div>
                    <div className="flex items-center justify-center gap-1 text-green-600">
                      <CheckCircle className="h-3 w-3" />
                      <span className="text-xs font-medium">Merged</span>
                    </div>
                    <div></div>
                  </>
                );
              }

              // Check for open PR - center under arrow
              if (mergeInfo.hasOpenPR && mergeInfo.openPR?.type === 'pr') {
                const prMerge = mergeInfo.openPR;
                return (
                  <>
                    <div></div>
                    <div className="flex justify-center">
                      <button
                        onClick={() =>
                          window.open(prMerge.pr_info.url, '_blank')
                        }
                        className="flex items-center gap-1 text-blue-600 hover:text-blue-700 hover:underline"
                      >
                        <GitPullRequest className="h-3 w-3" />
                        <span className="text-xs font-medium">
                          PR #{prMerge.pr_info.number}
                        </span>
                      </button>
                    </div>
                    <div></div>
                  </>
                );
              }

              // Show commit status - under respective branches
              const showAhead = commitsAhead > 0;
              const showBehind = commitsBehind > 0;

              if (showAhead || showBehind) {
                return (
                  <>
                    {/* Under task branch - Left Column */}
                    <div className="flex justify-start">
                      {showAhead && (
                        <span className="text-xs font-medium text-green-600">
                          {commitsAhead} commit{commitsAhead === 1 ? '' : 's'}{' '}
                          ahead
                        </span>
                      )}
                    </div>
                    {/* Center Column - Empty */}
                    <div></div>
                    {/* Under target branch - Right Column */}
                    <div className="flex justify-end">
                      {showBehind && (
                        <span className="text-xs font-medium text-orange-600">
                          {commitsBehind} commit{commitsBehind === 1 ? '' : 's'}{' '}
                          behind
                        </span>
                      )}
                    </div>
                  </>
                );
              }

              // Default: up to date - center under arrow
              return (
                <>
                  <div></div>
                  <div className="flex justify-center">
                    <span className="text-xs text-muted-foreground">
                      Up to date
                    </span>
                  </div>
                  <div></div>
                </>
              );
            })()}
          </div>
        </div>

        {/* Git Operations */}
        <div className="flex gap-2">
          <Button
            onClick={handleMergeClick}
            disabled={
              mergeInfo.hasOpenPR ||
              merging ||
              hasConflictsCalculated ||
              Boolean((branchStatus.commits_behind ?? 0) > 0) ||
              isAttemptRunning ||
              ((branchStatus.commits_ahead ?? 0) === 0 &&
                !pushSuccess &&
                !mergeSuccess)
            }
            size="xs"
            className="bg-green-600 hover:bg-green-700 dark:bg-green-900 dark:hover:bg-green-700 gap-1 flex-1"
          >
            <GitBranchIcon className="h-3 w-3" />
            {mergeButtonLabel}
          </Button>
          <Button
            onClick={handlePRButtonClick}
            disabled={
              creatingPR ||
              pushing ||
              Boolean((branchStatus.commits_behind ?? 0) > 0) ||
              isAttemptRunning ||
              hasConflictsCalculated ||
              (mergeInfo.hasOpenPR &&
                branchStatus.remote_commits_ahead === 0) ||
              ((branchStatus.commits_ahead ?? 0) === 0 &&
                (branchStatus.remote_commits_ahead ?? 0) === 0 &&
                !pushSuccess &&
                !mergeSuccess)
            }
            variant="outline"
            size="xs"
            className="border-blue-300  dark:border-blue-700 text-blue-700 dark:text-blue-500 hover:bg-blue-50 dark:hover:bg-transparent dark:hover:text-blue-400 dark:hover:border-blue-400 gap-1 flex-1"
          >
            <GitPullRequest className="h-3 w-3" />
            {mergeInfo.hasOpenPR
              ? pushSuccess
                ? 'Pushed!'
                : pushing
                  ? 'Pushing...'
                  : 'Push'
              : creatingPR
                ? 'Creating...'
                : 'Create PR'}
          </Button>
          <Button
            onClick={handleRebaseDialogOpen}
            disabled={
              rebasing ||
              isAttemptRunning ||
              hasConflictsCalculated ||
              (branchStatus.commits_behind ?? 0) === 0
            }
            variant="outline"
            size="xs"
            className="border-orange-300 text-orange-700 hover:bg-orange-50 gap-1 flex-1"
          >
            <RefreshCw
              className={`h-3 w-3 ${rebasing ? 'animate-spin' : ''}`}
            />
            {rebaseButtonLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default GitOperations;

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
import { useMemo, useState } from 'react';
import type {
  BranchStatus,
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
import { useTranslation } from 'react-i18next';

interface GitOperationsProps {
  selectedAttempt: TaskAttempt;
  task: TaskWithAttemptStatus;
  projectId: string;
  branchStatus: BranchStatus | null;
  branches: GitBranch[];
  isAttemptRunning: boolean;
  setError: (error: string | null) => void;
  selectedBranch: string | null;
}

function GitOperations({
  selectedAttempt,
  task,
  projectId,
  branchStatus,
  branches,
  isAttemptRunning,
  setError,
  selectedBranch,
}: GitOperationsProps) {
  const { t } = useTranslation('tasks');

  // Git operation hooks
  const rebaseMutation = useRebase(selectedAttempt.id, projectId);
  const mergeMutation = useMerge(selectedAttempt.id);
  const pushMutation = usePush(selectedAttempt.id);
  const changeTargetBranchMutation = useChangeTargetBranch(
    selectedAttempt.id,
    projectId
  );
  const isChangingTargetBranch = changeTargetBranchMutation.isPending;

  // Git status calculations
  const hasConflictsCalculated = useMemo(
    () => Boolean((branchStatus?.conflicted_files?.length ?? 0) > 0),
    [branchStatus?.conflicted_files]
  );

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
        setError(error.message || t('git.errors.changeTargetBranch'));
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
    if (mergeSuccess) return t('git.states.merged');
    if (merging) return t('git.states.merging');
    return t('git.states.merge');
  }, [mergeSuccess, merging, t]);

  const rebaseButtonLabel = useMemo(() => {
    if (rebasing) return t('git.states.rebasing');
    return t('git.states.rebase');
  }, [rebasing, t]);

  const handleMergeClick = async () => {
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
      setError(error.message || t('git.errors.pushChanges'));
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
      setError(error.message || t('git.errors.mergeChanges'));
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
        if (!isConflict) setError(err.message || t('git.errors.rebaseBranch'));
      });
    setRebasing(false);
  };

  const handleRebaseDialogOpen = async () => {
    try {
      const defaultTargetBranch = selectedAttempt.target_branch;
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

  if (!branchStatus || mergeInfo.hasMergedPR) {
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
          <div className="flex gap-4">
            {/* Task Branch Label - Left Column */}
            <div className="flex flex-1 justify-start">
              <span className="text-xs text-muted-foreground">
                {t('git.labels.taskBranch')}
              </span>
            </div>
            {/* Center Column - Empty */}
            {/* Target Branch Label - Right Column */}
            <div className="flex flex-1 justify-end">
              <span className="text-xs text-muted-foreground">
                {t('rebase.dialog.targetLabel')}
              </span>
            </div>
          </div>
          {/* Branches Row */}
          <div className="flex flex-1 gap-4 items-center">
            {/* Task Branch - Left Column */}
            <div className="flex flex-1 items-center justify-start gap-1.5 min-w-0">
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
            <div className="flex flex-1 items-center justify-end gap-1.5 min-w-0">
              <GitBranchIcon className="h-3 w-3 text-muted-foreground" />
              <span className="text-sm font-medium truncate">
                {branchStatus?.target_branch_name ||
                  selectedBranch ||
                  t('git.branch.current')}
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
                      <Settings className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{t('branches.changeTarget.dialog.title')}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>

          {/* Bottom Row: Status Information */}
          <div className="flex gap-4">
            <div className="flex-1 flex justify-start">
              {(() => {
                const commitsAhead = branchStatus?.commits_ahead ?? 0;
                const showAhead = commitsAhead > 0;

                if (showAhead) {
                  return (
                    <span className="text-xs font-medium text-success">
                      {commitsAhead}{' '}
                      {t('git.status.commits', { count: commitsAhead })}{' '}
                      {t('git.status.ahead')}
                    </span>
                  );
                }
                return null;
              })()}
            </div>

            <div className="flex justify-center">
              {(() => {
                const commitsAhead = branchStatus?.commits_ahead ?? 0;
                const commitsBehind = branchStatus?.commits_behind ?? 0;
                const showAhead = commitsAhead > 0;
                const showBehind = commitsBehind > 0;

                // Handle special states (PR, conflicts, etc.) - center under arrow
                if (hasConflictsCalculated) {
                  return (
                    <div className="flex items-center gap-1 text-warning">
                      <AlertTriangle className="h-3 w-3" />
                      <span className="text-xs font-medium">
                        {t('git.status.conflicts')}
                      </span>
                    </div>
                  );
                }

                if (branchStatus?.is_rebase_in_progress) {
                  return (
                    <div className="flex items-center gap-1 text-warning">
                      <RefreshCw className="h-3 w-3 animate-spin" />
                      <span className="text-xs font-medium">
                        {t('git.states.rebasing')}
                      </span>
                    </div>
                  );
                }

                // Check for merged PR
                if (mergeInfo.hasMergedPR) {
                  return (
                    <div className="flex items-center gap-1 text-success">
                      <CheckCircle className="h-3 w-3" />
                      <span className="text-xs font-medium">
                        {t('git.states.merged')}
                      </span>
                    </div>
                  );
                }

                // Check for open PR - center under arrow
                if (mergeInfo.hasOpenPR && mergeInfo.openPR?.type === 'pr') {
                  const prMerge = mergeInfo.openPR;
                  return (
                    <button
                      onClick={() => window.open(prMerge.pr_info.url, '_blank')}
                      className="flex items-center gap-1 text-info hover:text-info hover:underline"
                    >
                      <GitPullRequest className="h-3 w-3" />
                      <span className="text-xs font-medium">
                        PR #{Number(prMerge.pr_info.number)}
                      </span>
                    </button>
                  );
                }

                // If showing ahead/behind, don't show anything in center
                if (showAhead || showBehind) {
                  return null;
                }

                // Default: up to date - center under arrow
                return (
                  <span className="text-xs text-muted-foreground">
                    {t('git.status.upToDate')}
                  </span>
                );
              })()}
            </div>

            <div className="flex-1 flex justify-end">
              {(() => {
                const commitsBehind = branchStatus?.commits_behind ?? 0;
                const showBehind = commitsBehind > 0;

                if (showBehind) {
                  return (
                    <span className="text-xs font-medium text-warning">
                      {commitsBehind}{' '}
                      {t('git.status.commits', { count: commitsBehind })}{' '}
                      {t('git.status.behind')}
                    </span>
                  );
                }
                return null;
              })()}
            </div>
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
            variant="outline"
            size="xs"
            className="border-success text-success hover:bg-success gap-1 flex-1"
          >
            <GitBranchIcon className="h-3 w-3" />
            {mergeButtonLabel}
          </Button>
          <Button
            onClick={handlePRButtonClick}
            disabled={
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
            className="border-info text-info hover:bg-info gap-1 flex-1"
          >
            <GitPullRequest className="h-3 w-3" />
            {mergeInfo.hasOpenPR
              ? pushSuccess
                ? t('git.states.pushed')
                : pushing
                  ? t('git.states.pushing')
                  : t('git.states.push')
              : t('git.states.createPr')}
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
            className="border-warning text-warning hover:bg-warning gap-1 flex-1"
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

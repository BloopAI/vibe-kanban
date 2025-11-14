import {
  ArrowRight,
  GitBranch as GitBranchIcon,
  GitPullRequest,
  RefreshCw,
  Settings,
  AlertTriangle,
  CheckCircle,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button.tsx';
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
import NiceModal from '@ebay/nice-modal-react';
import { showModal } from '@/lib/modals';
import { useTranslation } from 'react-i18next';
import { useGitOperations } from '@/hooks/useGitOperations';

interface GitOperationsProps {
  selectedAttempt: TaskAttempt;
  task: TaskWithAttemptStatus;
  projectId: string;
  branchStatus: BranchStatus | null;
  branches: GitBranch[];
  isAttemptRunning: boolean;
  selectedBranch: string | null;
  layout?: 'horizontal' | 'vertical';
}

export type GitOperationsInputs = Omit<GitOperationsProps, 'selectedAttempt'>;

function GitOperations({
  selectedAttempt,
  task,
  projectId,
  branchStatus,
  branches,
  isAttemptRunning,
  selectedBranch,
  layout = 'horizontal',
}: GitOperationsProps) {
  const { t } = useTranslation('tasks');

  const git = useGitOperations(selectedAttempt.id, projectId);
  const isChangingTargetBranch = git.states.changeTargetBranchPending;

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
    await git.actions.changeTargetBranch(newBranch);
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

  const prButtonLabel = useMemo(() => {
    if (mergeInfo.hasOpenPR) {
      return pushSuccess
        ? t('git.states.pushed')
        : pushing
          ? t('git.states.pushing')
          : t('git.states.push');
    }
    return t('git.states.createPr');
  }, [mergeInfo.hasOpenPR, pushSuccess, pushing, t]);

  const handleMergeClick = async () => {
    // Directly perform merge without checking branch status
    await performMerge();
  };

  const handlePushClick = async () => {
    try {
      setPushing(true);
      await git.actions.push();
      setPushSuccess(true);
      setTimeout(() => setPushSuccess(false), 2000);
    } finally {
      setPushing(false);
    }
  };

  const performMerge = async () => {
    try {
      setMerging(true);
      await git.actions.merge();
      setMergeSuccess(true);
      setTimeout(() => setMergeSuccess(false), 2000);
    } finally {
      setMerging(false);
    }
  };

  const handleRebaseWithNewBranchAndUpstream = async (
    newBaseBranch: string,
    selectedUpstream: string
  ) => {
    setRebasing(true);
    try {
      await git.actions.rebase({
        newBaseBranch: newBaseBranch,
        oldBaseBranch: selectedUpstream,
      });
    } finally {
      setRebasing(false);
    }
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

  const isVertical = layout === 'vertical';

  const containerClasses = isVertical
    ? 'grid grid-cols-1 items-start gap-3 overflow-hidden'
    : 'grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 overflow-hidden';

  const settingsBtnClasses = isVertical
    ? 'inline-flex h-5 w-5 p-0 hover:bg-muted'
    : 'hidden md:inline-flex h-5 w-5 p-0 hover:bg-muted';

  const actionsClasses = isVertical
    ? 'flex flex-wrap items-center gap-2'
    : 'shrink-0 flex flex-wrap items-center gap-2 overflow-y-hidden overflow-x-visible max-h-8';

  return (
    <div className="w-full border-b py-2">
      <div className={containerClasses}>
        {/* Left: Branch flow */}
        <div className="flex items-center gap-2 min-w-0 shrink-0 overflow-hidden">
          {/* Task branch chip */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="hidden sm:inline-flex items-center gap-1.5 max-w-[280px] px-2 py-0.5 rounded-full bg-muted text-xs font-medium min-w-0">
                  <GitBranchIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="truncate">{selectedAttempt.branch}</span>
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {t('git.labels.taskBranch')}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <ArrowRight className="hidden sm:inline h-4 w-4 text-muted-foreground" />

          {/* Target branch chip + change button */}
          <div className="flex items-center gap-1 min-w-0">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center gap-1.5 max-w-[280px] px-2 py-0.5 rounded-full bg-muted text-xs font-medium min-w-0">
                    <GitBranchIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="truncate">
                      {branchStatus?.target_branch_name ||
                        selectedAttempt.target_branch ||
                        selectedBranch ||
                        t('git.branch.current')}
                    </span>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {t('rebase.dialog.targetLabel')}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={handleChangeTargetBranchDialogOpen}
                    disabled={isAttemptRunning || hasConflictsCalculated}
                    className={settingsBtnClasses}
                    aria-label={t('branches.changeTarget.dialog.title')}
                  >
                    <Settings className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {t('branches.changeTarget.dialog.title')}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        {/* Center: Status chips */}
        <div className="flex items-center gap-2 text-xs min-w-0 overflow-hidden whitespace-nowrap">
          {(() => {
            const commitsAhead = branchStatus?.commits_ahead ?? 0;
            const commitsBehind = branchStatus?.commits_behind ?? 0;

            if (hasConflictsCalculated) {
              return (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100/60 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {t('git.status.conflicts')}
                </span>
              );
            }

            if (branchStatus?.is_rebase_in_progress) {
              return (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100/60 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  {t('git.states.rebasing')}
                </span>
              );
            }

            if (mergeInfo.hasMergedPR) {
              return (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100/70 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300">
                  <CheckCircle className="h-3.5 w-3.5" />
                  {t('git.states.merged')}
                </span>
              );
            }

            if (mergeInfo.hasOpenPR && mergeInfo.openPR?.type === 'pr') {
              const prMerge = mergeInfo.openPR;
              return (
                <button
                  onClick={() => window.open(prMerge.pr_info.url, '_blank')}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-100/60 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 hover:underline truncate max-w-[180px] sm:max-w-none"
                  aria-label={t('git.pr.open', {
                    number: Number(prMerge.pr_info.number),
                  })}
                >
                  <GitPullRequest className="h-3.5 w-3.5" />
                  {t('git.pr.number', {
                    number: Number(prMerge.pr_info.number),
                  })}
                  <ExternalLink className="h-3.5 w-3.5" />
                </button>
              );
            }

            const chips: React.ReactNode[] = [];
            if (commitsAhead > 0) {
              chips.push(
                <span
                  key="ahead"
                  className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100/70 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300"
                >
                  +{commitsAhead}{' '}
                  {t('git.status.commits', { count: commitsAhead })}{' '}
                  {t('git.status.ahead')}
                </span>
              );
            }
            if (commitsBehind > 0) {
              chips.push(
                <span
                  key="behind"
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100/60 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300"
                >
                  {commitsBehind}{' '}
                  {t('git.status.commits', { count: commitsBehind })}{' '}
                  {t('git.status.behind')}
                </span>
              );
            }
            if (chips.length > 0)
              return <div className="flex items-center gap-2">{chips}</div>;

            return (
              <span className="text-muted-foreground hidden sm:inline">
                {t('git.status.upToDate')}
              </span>
            );
          })()}
        </div>

        {/* Right: Actions */}
        {branchStatus && (
          <div className={actionsClasses}>
            <Button
              onClick={handleMergeClick}
              disabled={
                mergeInfo.hasMergedPR ||
                mergeInfo.hasOpenPR ||
                merging ||
                hasConflictsCalculated ||
                isAttemptRunning ||
                ((branchStatus.commits_ahead ?? 0) === 0 &&
                  !pushSuccess &&
                  !mergeSuccess)
              }
              variant="outline"
              size="xs"
              className="border-success text-success hover:bg-success gap-1 shrink-0"
              aria-label={mergeButtonLabel}
            >
              <GitBranchIcon className="h-3.5 w-3.5" />
              <span className="truncate max-w-[10ch]">{mergeButtonLabel}</span>
            </Button>

            <Button
              onClick={handlePRButtonClick}
              disabled={
                mergeInfo.hasMergedPR ||
                pushing ||
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
              className="border-info text-info hover:bg-info gap-1 shrink-0"
              aria-label={prButtonLabel}
            >
              <GitPullRequest className="h-3.5 w-3.5" />
              <span className="truncate max-w-[10ch]">{prButtonLabel}</span>
            </Button>

            <Button
              onClick={handleRebaseDialogOpen}
              disabled={
                mergeInfo.hasMergedPR ||
                rebasing ||
                isAttemptRunning ||
                hasConflictsCalculated
              }
              variant="outline"
              size="xs"
              className="border-warning text-warning hover:bg-warning gap-1 shrink-0"
              aria-label={rebaseButtonLabel}
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${rebasing ? 'animate-spin' : ''}`}
              />
              <span className="truncate max-w-[10ch]">{rebaseButtonLabel}</span>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export default GitOperations;

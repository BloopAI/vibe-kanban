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
import { useMemo } from 'react';
import type { RepoBranchStatus, Merge, Workspace, Repo } from 'shared/types';
import { useTranslation } from 'react-i18next';
import RepoSelector from '@/components/tasks/RepoSelector';

interface BranchStatusInfoProps {
  selectedAttempt: Workspace;
  branchStatus: RepoBranchStatus[] | null | undefined;
  selectedRepoStatus: RepoBranchStatus | null;
  isAttemptRunning: boolean;
  selectedBranch: string | null;
  layout?: 'horizontal' | 'vertical' | 'compact';
  repos?: Repo[];
  selectedRepoId?: string | null;
  onRepoSelect?: (repoId: string) => void;
  onChangeTargetBranch?: () => void;
  hasConflicts?: boolean;
}

export function BranchStatusInfo({
  selectedAttempt,
  selectedRepoStatus,
  isAttemptRunning,
  selectedBranch,
  layout = 'horizontal',
  repos = [],
  selectedRepoId,
  onRepoSelect,
  onChangeTargetBranch,
  hasConflicts = false,
}: BranchStatusInfoProps) {
  const { t } = useTranslation('tasks');

  // Memoize merge status information to avoid repeated calculations
  const mergeInfo = useMemo(() => {
    if (!selectedRepoStatus?.merges)
      return {
        hasOpenPR: false,
        openPR: null,
        hasMergedPR: false,
        mergedPR: null,
        hasMerged: false,
        latestMerge: null,
      };

    const openPR = selectedRepoStatus.merges.find(
      (m: Merge) => m.type === 'pr' && m.pr_info.status === 'open'
    );

    const mergedPR = selectedRepoStatus.merges.find(
      (m: Merge) => m.type === 'pr' && m.pr_info.status === 'merged'
    );

    const merges = selectedRepoStatus.merges.filter(
      (m: Merge) =>
        m.type === 'direct' ||
        (m.type === 'pr' && m.pr_info.status === 'merged')
    );

    return {
      hasOpenPR: !!openPR,
      openPR,
      hasMergedPR: !!mergedPR,
      mergedPR,
      hasMerged: merges.length > 0,
      latestMerge: selectedRepoStatus.merges[0] || null,
    };
  }, [selectedRepoStatus]);

  const isVertical = layout === 'vertical';
  const isCompact = layout === 'compact';

  const containerClasses = isVertical
    ? 'grid grid-cols-1 items-start gap-3 overflow-hidden'
    : isCompact
      ? 'flex flex-col gap-2 p-3 border-b bg-muted/30'
      : 'flex items-center gap-2 overflow-hidden';

  const settingsBtnClasses = isVertical
    ? 'inline-flex h-5 w-5 p-0 hover:bg-muted'
    : 'hidden md:inline-flex h-5 w-5 p-0 hover:bg-muted';

  const statusChips = (
    <div className="flex items-center gap-2 text-xs min-w-0 overflow-hidden whitespace-nowrap">
      {(() => {
        const commitsAhead = selectedRepoStatus?.commits_ahead ?? 0;
        const commitsBehind = selectedRepoStatus?.commits_behind ?? 0;

        if (hasConflicts) {
          return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100/60 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
              <AlertTriangle className="h-3.5 w-3.5" />
              {t('git.status.conflicts')}
            </span>
          );
        }

        if (selectedRepoStatus?.is_rebase_in_progress) {
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
              +{commitsAhead} {t('git.status.commits', { count: commitsAhead })}{' '}
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
  );

  const branchChips = (
    <>
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
                  {selectedRepoStatus?.target_branch_name ||
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

        {onChangeTargetBranch && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={onChangeTargetBranch}
                  disabled={isAttemptRunning || hasConflicts}
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
        )}
      </div>
    </>
  );

  if (isCompact) {
    return (
      <div className={containerClasses}>
        {repos.length > 1 && onRepoSelect && (
          <RepoSelector
            repos={repos}
            selectedRepoId={selectedRepoId ?? null}
            onRepoSelect={onRepoSelect}
            disabled={isAttemptRunning}
            placeholder={t('repos.selector.placeholder', 'Select repo')}
            className="w-full"
          />
        )}
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          {branchChips}
        </div>
        {statusChips}
      </div>
    );
  }

  return (
    <div className={containerClasses}>
      {isVertical ? (
        <>
          {repos.length > 1 && onRepoSelect && (
            <RepoSelector
              repos={repos}
              selectedRepoId={selectedRepoId ?? null}
              onRepoSelect={onRepoSelect}
              disabled={isAttemptRunning}
              placeholder={t('repos.selector.placeholder', 'Select repo')}
            />
          )}
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            {branchChips}
            {statusChips}
          </div>
        </>
      ) : (
        <>
          {repos.length > 1 && onRepoSelect && (
            <RepoSelector
              repos={repos}
              selectedRepoId={selectedRepoId ?? null}
              onRepoSelect={onRepoSelect}
              disabled={isAttemptRunning}
              placeholder={t('repos.selector.placeholder', 'Select repo')}
              className="w-auto max-w-[200px] rounded-full bg-muted border-0 h-6 px-2 py-0.5 text-xs font-medium"
            />
          )}
          <div className="flex flex-1 items-center justify-center gap-2 min-w-0 overflow-hidden">
            <div className="flex items-center gap-2 min-w-0 overflow-hidden">
              {branchChips}
            </div>
            {statusChips}
          </div>
        </>
      )}
    </div>
  );
}

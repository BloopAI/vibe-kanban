import type React from 'react';
import {
  AlertTriangle,
  CheckCircle,
  ExternalLink,
  GitPullRequest,
  RefreshCw,
} from 'lucide-react';
import type { TFunction } from 'i18next';
import type { BranchStatus, Merge } from 'shared/types';
import type { OperationStatusState } from '@/hooks/git/useGitOperationStatus';

interface GitStatusChipProps {
  operationStatus: OperationStatusState;
  branchStatus: BranchStatus | null;
  mergeInfo: {
    hasMergedPR: boolean;
    mergedPR: Merge | null;
    hasOpenPR: boolean;
    openPR: Merge | null;
  };
  hasConflictsCalculated: boolean;
  t: TFunction<'tasks'>;
}

export function GitStatusChip({
  operationStatus,
  branchStatus,
  mergeInfo,
  hasConflictsCalculated,
  t,
}: GitStatusChipProps) {
  // Always prioritize showing conflicts to avoid transient states masking the true status
  if (hasConflictsCalculated) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100/60 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
        <AlertTriangle className="h-3.5 w-3.5" />
        {t('git.status.conflicts')}
      </span>
    );
  }

  if (operationStatus.phase !== 'idle') {
    const baseClasses =
      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full';
    const intentClasses =
      operationStatus.phase === 'success'
        ? 'bg-emerald-100/70 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
        : operationStatus.phase === 'error'
          ? 'bg-red-100/70 dark:bg-red-900/30 text-red-700 dark:text-red-300'
          : operationStatus.phase === 'conflicts'
            ? 'bg-amber-100/60 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
            : 'bg-amber-100/60 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300';

    const fallbackMessage = (() => {
      if (operationStatus.message) return operationStatus.message;
      if (operationStatus.phase === 'conflicts')
        return t('git.status.conflicts');
      if (operationStatus.phase === 'in-progress') {
        return operationStatus.kind === 'rebase'
          ? t('rebase.common.inProgress')
          : t('git.states.merging');
      }
      if (operationStatus.phase === 'success') {
        return operationStatus.kind === 'rebase'
          ? t('rebase.common.completed')
          : t('git.states.merged');
      }
      return undefined;
    })();

    return (
      <span
        className={`${baseClasses} ${intentClasses}`}
        role="status"
        aria-live="polite"
      >
        {operationStatus.phase === 'success' && (
          <CheckCircle className="h-3.5 w-3.5" />
        )}
        {operationStatus.phase === 'error' && (
          <AlertTriangle className="h-3.5 w-3.5" />
        )}
        {operationStatus.phase === 'in-progress' && (
          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
        )}
        {operationStatus.phase === 'conflicts' && (
          <AlertTriangle className="h-3.5 w-3.5" />
        )}
        {fallbackMessage && (
          <span className="truncate max-w-[160px] sm:max-w-none">
            {fallbackMessage}
          </span>
        )}
      </span>
    );
  }

  const commitsAhead = branchStatus?.commits_ahead ?? 0;
  const commitsBehind = branchStatus?.commits_behind ?? 0;

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
        {commitsBehind} {t('git.status.commits', { count: commitsBehind })}{' '}
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
}

import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { MoreHorizontal } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import type { TaskAttempt, TaskWithAttemptStatus } from 'shared/types';
import { useDevServer } from '@/hooks/useDevServer';
import { useRebase } from '@/hooks/useRebase';
import { useMerge } from '@/hooks/useMerge';
import { useOpenInEditor } from '@/hooks/useOpenInEditor';
import { useDiffSummary } from '@/hooks/useDiffSummary';
import { useBranchStatus } from '@/hooks';
import { useAttemptExecution } from '@/hooks/useAttemptExecution';
import { useMemo, useState } from 'react';
import NiceModal from '@ebay/nice-modal-react';
import { OpenInIdeButton } from '@/components/ide/OpenInIdeButton';
import { useTranslation } from 'react-i18next';

interface AttemptHeaderCardProps {
  attemptNumber: number;
  totalAttempts: number;
  selectedAttempt: TaskAttempt | null;
  task: TaskWithAttemptStatus;
  projectId: string;
  // onCreateNewAttempt?: () => void;
  onJumpToDiffFullScreen?: () => void;
}

export function AttemptHeaderCard({
  attemptNumber,
  totalAttempts,
  selectedAttempt,
  task,
  projectId,
  onJumpToDiffFullScreen,
}: AttemptHeaderCardProps) {
  const { t } = useTranslation('tasks');
  const {
    start: startDevServer,
    stop: stopDevServer,
    runningDevServer,
  } = useDevServer(selectedAttempt?.id);
  const rebaseMutation = useRebase(selectedAttempt?.id, projectId);
  const mergeMutation = useMerge(selectedAttempt?.id);
  const openInEditor = useOpenInEditor(selectedAttempt?.id);
  const { fileCount, added, deleted } = useDiffSummary(
    selectedAttempt?.id ?? null
  );

  // Branch status and execution state
  const { data: branchStatus } = useBranchStatus(selectedAttempt?.id);
  const { isAttemptRunning } = useAttemptExecution(
    selectedAttempt?.id,
    task.id
  );

  // Loading states
  const [rebasing, setRebasing] = useState(false);
  const [merging, setMerging] = useState(false);

  // Check for conflicts
  const hasConflicts = useMemo(
    () => Boolean((branchStatus?.conflicted_files?.length ?? 0) > 0),
    [branchStatus?.conflicted_files]
  );

  // Merge status information
  const mergeInfo = useMemo(() => {
    if (!branchStatus?.merges)
      return {
        hasOpenPR: false,
        openPR: null,
        hasMergedPR: false,
        mergedPR: null,
        hasMerged: false,
      };

    const openPR = branchStatus.merges.find(
      (m) => m.type === 'pr' && m.pr_info.status === 'open'
    );

    const mergedPR = branchStatus.merges.find(
      (m) => m.type === 'pr' && m.pr_info.status === 'merged'
    );

    const merges = branchStatus.merges.filter(
      (m) =>
        m.type === 'direct' ||
        (m.type === 'pr' && m.pr_info.status === 'merged')
    );

    return {
      hasOpenPR: !!openPR,
      openPR,
      hasMergedPR: !!mergedPR,
      mergedPR,
      hasMerged: merges.length > 0,
    };
  }, [branchStatus?.merges]);

  const handleCreatePR = () => {
    if (selectedAttempt) {
      NiceModal.show('create-pr', {
        attempt: selectedAttempt,
        task,
        projectId,
      });
    }
  };

  const handleRebaseClick = async () => {
    setRebasing(true);
    try {
      await rebaseMutation.mutateAsync({});
    } catch (error) {
      // Error handling is done by the mutation
    } finally {
      setRebasing(false);
    }
  };

  const handleMergeClick = async () => {
    setMerging(true);
    try {
      await mergeMutation.mutateAsync();
    } catch (error) {
      // Error handling is done by the mutation
    } finally {
      setMerging(false);
    }
  };

  return (
    <Card className="border-b border-dashed bg-background flex items-center text-sm">
      <div className="flex-1 min-w-0 flex items-center gap-3 p-3 flex-nowrap">
        <p className="shrink-0 whitespace-nowrap">
          <span className="text-secondary-foreground">
            {t('attempt.labels.attempt')} &middot;{' '}
          </span>
          {attemptNumber}/{totalAttempts}
        </p>
        <p className="shrink-0 whitespace-nowrap">
          <span className="text-secondary-foreground">
            {t('attempt.labels.agent')} &middot;{' '}
          </span>
          {selectedAttempt?.executor}
        </p>
        {selectedAttempt?.branch && (
          <p className="flex-1 min-w-0 truncate">
            <span className="text-secondary-foreground">
              {t('attempt.labels.branch')} &middot;{' '}
            </span>
            {selectedAttempt.branch}
          </p>
        )}
        {fileCount > 0 && (
          <p className="shrink-0 text-secondary-foreground whitespace-nowrap">
            <Button
              variant="ghost"
              size="sm"
              className="h-4 p-0"
              onClick={onJumpToDiffFullScreen}
            >
              {t('attempt.labels.diffs')}
            </Button>{' '}
            &middot; <span className="text-console-success">+{added}</span>{' '}
            <span className="text-console-error">-{deleted}</span>
          </p>
        )}
      </div>

      <div className="flex items-center gap-1 px-3 flex-none">
        <OpenInIdeButton
          onClick={() => openInEditor()}
          disabled={!selectedAttempt}
          className="h-10 w-10 p-0 shrink-0"
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-10 w-10 p-0 shrink-0"
            >
              <MoreHorizontal className="h-4 w-4" />
              <span className="sr-only">{t('attempt.actions.openMenu')}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() => openInEditor()}
              disabled={!selectedAttempt}
            >
              {t('attempt.actions.openInIde')}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() =>
                runningDevServer ? stopDevServer() : startDevServer()
              }
              disabled={!selectedAttempt}
              className={runningDevServer ? 'text-destructive' : ''}
            >
              {runningDevServer
                ? t('attempt.actions.stopDevServer')
                : t('attempt.actions.startDevServer')}
            </DropdownMenuItem>
            {selectedAttempt &&
              branchStatus &&
              !mergeInfo.hasMergedPR &&
              (branchStatus.commits_behind ?? 0) > 0 && (
                <DropdownMenuItem
                  onClick={handleRebaseClick}
                  disabled={rebasing || isAttemptRunning || hasConflicts}
                >
                  {rebasing
                    ? t('rebase.common.inProgress')
                    : t('rebase.common.action')}
                </DropdownMenuItem>
              )}
            <DropdownMenuItem
              onClick={handleCreatePR}
              disabled={!selectedAttempt}
            >
              {t('git.states.createPr')}
            </DropdownMenuItem>
            {selectedAttempt && branchStatus && !mergeInfo.hasMergedPR && (
              <DropdownMenuItem
                onClick={handleMergeClick}
                disabled={
                  mergeInfo.hasOpenPR ||
                  merging ||
                  hasConflicts ||
                  Boolean((branchStatus.commits_behind ?? 0) > 0) ||
                  isAttemptRunning ||
                  (branchStatus.commits_ahead ?? 0) === 0
                }
              >
                {merging ? t('git.states.merging') : t('git.states.merge')}
              </DropdownMenuItem>
            )}
            {/* <DropdownMenuItem
            onClick={onCreateNewAttempt}
            disabled={!onCreateNewAttempt}
          >
            Create new attempt
          </DropdownMenuItem> */}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </Card>
  );
}

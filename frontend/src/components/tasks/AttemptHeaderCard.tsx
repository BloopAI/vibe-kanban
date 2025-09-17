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
  const {
    start: startDevServer,
    stop: stopDevServer,
    runningDevServer,
  } = useDevServer(selectedAttempt?.id);
  const rebaseMutation = useRebase(selectedAttempt?.id, projectId);
  const mergeMutation = useMerge(selectedAttempt?.id);
  const openInEditor = useOpenInEditor(selectedAttempt);
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
      await rebaseMutation.mutateAsync(undefined);
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
      <div className="flex-1 flex gap-6 p-3 flex-wrap md:flex-nowrap">
        <p>
          <span className="text-secondary-foreground">Attempt &middot; </span>
          {attemptNumber}/{totalAttempts}
        </p>
        <p>
          <span className="text-secondary-foreground">Agent &middot; </span>
          {selectedAttempt?.executor}
        </p>
        {selectedAttempt?.branch && (
          <p className="max-w-30 truncate">
            <span className="text-secondary-foreground">Branch &middot; </span>
            {selectedAttempt.branch}
          </p>
        )}
        {fileCount > 0 && (
          <p className="text-secondary-foreground">
            <Button
              variant="ghost"
              size="sm"
              className="h-4 p-0"
              onClick={onJumpToDiffFullScreen}
            >
              Diffs
            </Button>{' '}
            &middot; <span className="text-success">+{added}</span>{' '}
            <span className="text-destructive">-{deleted}</span>
          </p>
        )}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-10 w-10 p-0 mr-3">
            <MoreHorizontal className="h-4 w-4" />
            <span className="sr-only">Open menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={() => openInEditor()}
            disabled={!selectedAttempt}
          >
            Open in IDE
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() =>
              runningDevServer ? stopDevServer() : startDevServer()
            }
            disabled={!selectedAttempt}
            className={runningDevServer ? 'text-destructive' : ''}
          >
            {runningDevServer ? 'Stop dev server' : 'Start dev server'}
          </DropdownMenuItem>
          {selectedAttempt &&
            branchStatus &&
            !mergeInfo.hasMergedPR &&
            (branchStatus.commits_behind ?? 0) > 0 && (
              <DropdownMenuItem
                onClick={handleRebaseClick}
                disabled={rebasing || isAttemptRunning || hasConflicts}
              >
                {rebasing ? 'Rebasing...' : 'Rebase'}
              </DropdownMenuItem>
            )}
          <DropdownMenuItem
            onClick={handleCreatePR}
            disabled={!selectedAttempt}
          >
            Create PR
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
              {merging ? 'Merging...' : 'Merge'}
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
    </Card>
  );
}

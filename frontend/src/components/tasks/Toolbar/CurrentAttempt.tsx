import {
  ExternalLink,
  GitBranch as GitBranchIcon,
  GitPullRequest,
  History,
  Play,
  Plus,
  RefreshCw,
  Settings,
  StopCircle,
  ScrollText,
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip.tsx';
import { Button } from '@/components/ui/button.tsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu.tsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.tsx';
import BranchSelector from '@/components/tasks/BranchSelector.tsx';
import {
  Dispatch,
  SetStateAction,
  useCallback,
  useMemo,
  useState,
} from 'react';
import type {
  GitBranch,
  TaskAttempt,
  TaskWithAttemptStatus,
} from 'shared/types';
import { useBranchStatus, useOpenInEditor } from '@/hooks';
import { useAttemptExecution } from '@/hooks/useAttemptExecution';
import { useDevServer } from '@/hooks/useDevServer';
import { useRebase } from '@/hooks/useRebase';
import { useMerge } from '@/hooks/useMerge';
import { useCreatePRDialog } from '@/contexts/create-pr-dialog-context';
import { usePush } from '@/hooks/usePush';
import { useConfig } from '@/components/config-provider.tsx';
import { useKeyboardShortcuts } from '@/lib/keyboard-shortcuts.ts';
import { writeClipboardViaBridge } from '@/vscode/bridge';
import { useProcessSelection } from '@/contexts/ProcessSelectionContext';

// Helper function to get the display name for different editor types
function getEditorDisplayName(editorType: string): string {
  switch (editorType) {
    case 'VS_CODE':
      return 'Visual Studio Code';
    case 'CURSOR':
      return 'Cursor';
    case 'WINDSURF':
      return 'Windsurf';
    case 'INTELLI_J':
      return 'IntelliJ IDEA';
    case 'ZED':
      return 'Zed';
    case 'XCODE':
      return 'Xcode';
    case 'CUSTOM':
      return 'Editor';
    default:
      return 'Editor';
  }
}

type Props = {
  task: TaskWithAttemptStatus;
  projectId: string;
  projectHasDevScript: boolean;
  setError: Dispatch<SetStateAction<string | null>>;

  selectedBranch: string | null;
  selectedAttempt: TaskAttempt;
  taskAttempts: TaskAttempt[];
  creatingPR: boolean;
  handleEnterCreateAttemptMode: () => void;
  branches: GitBranch[];
  setSelectedAttempt: (attempt: TaskAttempt | null) => void;
};

function CurrentAttempt({
  task,
  projectId,
  projectHasDevScript,
  setError,
  selectedBranch,
  selectedAttempt,
  taskAttempts,
  creatingPR,
  handleEnterCreateAttemptMode,
  branches,
  setSelectedAttempt,
}: Props) {
  const { config } = useConfig();
  const { isAttemptRunning, stopExecution, isStopping } = useAttemptExecution(
    selectedAttempt?.id,
    task.id
  );
  const { data: branchStatus } = useBranchStatus(selectedAttempt?.id);
  const handleOpenInEditor = useOpenInEditor(selectedAttempt);
  const { jumpToProcess } = useProcessSelection();

  // Attempt action hooks
  const {
    start: startDevServer,
    stop: stopDevServer,
    isStarting: isStartingDevServer,
    runningDevServer,
    latestDevServerProcess,
  } = useDevServer(selectedAttempt?.id);
  const rebaseMutation = useRebase(selectedAttempt?.id, projectId);
  const mergeMutation = useMerge(selectedAttempt?.id);
  const pushMutation = usePush(selectedAttempt?.id);
  const { showCreatePRDialog } = useCreatePRDialog();

  const [merging, setMerging] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [rebasing, setRebasing] = useState(false);
  const [showRebaseDialog, setShowRebaseDialog] = useState(false);
  const [selectedRebaseBranch, setSelectedRebaseBranch] = useState<string>('');
  const [showStopConfirmation, setShowStopConfirmation] = useState(false);
  const [copied, setCopied] = useState(false);
  const [mergeSuccess, setMergeSuccess] = useState(false);
  const [pushSuccess, setPushSuccess] = useState(false);

  const handleViewDevServerLogs = () => {
    if (latestDevServerProcess) {
      jumpToProcess(latestDevServerProcess.id);
    }
  };

  // Use the stopExecution function from the hook

  useKeyboardShortcuts({
    stopExecution: () => setShowStopConfirmation(true),
    newAttempt: !isAttemptRunning ? handleEnterCreateAttemptMode : () => {},
    hasOpenDialog: showStopConfirmation,
    closeDialog: () => setShowStopConfirmation(false),
    onEnter: () => {
      setShowStopConfirmation(false);
      stopExecution();
    },
  });

  const handleAttemptChange = useCallback(
    (attempt: TaskAttempt) => {
      setSelectedAttempt(attempt);
      // React Query will handle refetching when attemptId changes
    },
    [setSelectedAttempt]
  );

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

  const handleRebaseClick = async () => {
    try {
      setRebasing(true);
      await rebaseMutation.mutateAsync(undefined);
      setError(null); // Clear any previous errors on success
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rebase branch');
    } finally {
      setRebasing(false);
    }
  };

  const handleRebaseWithNewBranch = async (newBaseBranch: string) => {
    try {
      setRebasing(true);
      await rebaseMutation.mutateAsync(newBaseBranch);
      setError(null); // Clear any previous errors on success
      setShowRebaseDialog(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rebase branch');
    } finally {
      setRebasing(false);
    }
  };

  const handleRebaseDialogConfirm = () => {
    if (selectedRebaseBranch) {
      handleRebaseWithNewBranch(selectedRebaseBranch);
    }
  };

  const handleRebaseDialogOpen = () => {
    setSelectedRebaseBranch('');
    setShowRebaseDialog(true);
  };

  const handlePRButtonClick = async () => {
    if (!projectId || !selectedAttempt?.id || !selectedAttempt?.task_id) return;

    // If PR already exists, push to it
    if (mergeInfo.hasOpenPR) {
      await handlePushClick();
      return;
    }

    showCreatePRDialog({
      attempt: selectedAttempt,
      task,
      projectId,
    });
  };

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

  // Get display name for the configured editor
  const editorDisplayName = useMemo(() => {
    if (!config?.editor?.editor_type) return 'Editor';
    return getEditorDisplayName(config.editor.editor_type);
  }, [config?.editor?.editor_type]);

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
      latestMerge: branchStatus.merges[0] || null, // Most recent merge
    };
  }, [branchStatus?.merges]);

  const handleCopyWorktreePath = useCallback(async () => {
    try {
      await writeClipboardViaBridge(selectedAttempt.container_ref || '');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy worktree path:', err);
    }
  }, [selectedAttempt.container_ref]);

  // Get status information for display
  const getStatusInfo = useCallback(() => {
    if (mergeInfo.hasMergedPR && mergeInfo.mergedPR?.type === 'pr') {
      const prMerge = mergeInfo.mergedPR;
      return {
        dotColor: 'bg-green-500',
        textColor: 'text-green-700',
        text: `PR #${prMerge.pr_info.number} merged`,
        isClickable: true,
        onClick: () => window.open(prMerge.pr_info.url, '_blank'),
      };
    }
    if (
      mergeInfo.hasMerged &&
      mergeInfo.latestMerge?.type === 'direct' &&
      (branchStatus?.commits_ahead ?? 0) === 0
    ) {
      return {
        dotColor: 'bg-green-500',
        textColor: 'text-green-700',
        text: `Merged`,
        isClickable: false,
      };
    }

    if (mergeInfo.hasOpenPR && mergeInfo.openPR?.type === 'pr') {
      const prMerge = mergeInfo.openPR;
      return {
        dotColor: 'bg-blue-500',
        textColor: 'text-blue-700',
        text: `PR #${prMerge.pr_info.number}`,
        isClickable: true,
        onClick: () => window.open(prMerge.pr_info.url, '_blank'),
      };
    }

    if ((branchStatus?.commits_behind ?? 0) > 0) {
      return {
        dotColor: 'bg-orange-500',
        textColor: 'text-orange-700',
        text: `Rebase needed${branchStatus?.has_uncommitted_changes ? ' (dirty)' : ''}`,
        isClickable: false,
      };
    }

    if ((branchStatus?.commits_ahead ?? 0) > 0) {
      return {
        dotColor: 'bg-yellow-500',
        textColor: 'text-yellow-700',
        text:
          branchStatus?.commits_ahead === 1
            ? `1 commit ahead${branchStatus?.has_uncommitted_changes ? ' (dirty)' : ''}`
            : `${branchStatus?.commits_ahead} commits ahead${branchStatus?.has_uncommitted_changes ? ' (dirty)' : ''}`,
        isClickable: false,
      };
    }

    return {
      dotColor: 'bg-gray-500',
      textColor: 'text-gray-700',
      text: `Up to date${branchStatus?.has_uncommitted_changes ? ' (dirty)' : ''}`,
      isClickable: false,
    };
  }, [mergeInfo, branchStatus]);

  return (
    <div className="space-y-2 @container">
      {/* <div className="flex gap-6 items-start"> */}
      <div className="grid grid-cols-2 gap-3 items-start @md:flex @md:items-start">
        <div className="min-w-0">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
            Profile
          </div>
          <div className="text-sm font-medium">{selectedAttempt.executor}</div>
        </div>

        <div className="min-w-0">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
            Task Branch
          </div>
          <div className="flex items-center gap-1.5">
            <GitBranchIcon className="h-3 w-3 text-muted-foreground" />
            <span className="text-sm font-medium truncate">
              {selectedAttempt.branch}
            </span>
          </div>
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
            <span className="truncate">Base Branch</span>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={handleRebaseDialogOpen}
                    disabled={rebasing || isAttemptRunning}
                    className="h-4 w-4 p-0 hover:bg-muted"
                  >
                    <Settings className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Change base branch</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <div className="flex items-center gap-1.5">
            <GitBranchIcon className="h-3 w-3 text-muted-foreground" />
            <span className="text-sm font-medium truncate">
              {branchStatus?.base_branch_name || selectedBranchDisplayName}
            </span>
          </div>
        </div>

        <div className="min-w-0">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
            Status
          </div>
          <div className="flex items-center gap-1.5">
            {(() => {
              const statusInfo = getStatusInfo();
              return (
                <>
                  <div
                    className={`h-2 w-2 ${statusInfo.dotColor} rounded-full`}
                  />
                  {statusInfo.isClickable ? (
                    <button
                      onClick={statusInfo.onClick}
                      className={`text-sm font-medium ${statusInfo.textColor} hover:underline cursor-pointer`}
                    >
                      {statusInfo.text}
                    </button>
                  ) : (
                    <span
                      className={`text-sm font-medium ${statusInfo.textColor} truncate`}
                    >
                      {statusInfo.text}
                    </span>
                  )}
                </>
              );
            })()}
          </div>
        </div>
      </div>

      <div>
        <div className="flex items-center gap-1.5 mb-1">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1 pt-1">
            Path
          </div>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => handleOpenInEditor()}
            className="h-6 px-2 text-xs hover:bg-muted gap-1"
          >
            <ExternalLink className="h-3 w-3" />
            Open in {editorDisplayName}
          </Button>
        </div>
        <div
          className={`text-xs font-mono px-2 py-1 break-all cursor-pointer transition-all duration-300 flex items-center gap-2 ${
            copied
              ? 'bg-green-100 text-green-800 border border-green-300'
              : 'text-muted-foreground bg-muted hover:bg-muted/80'
          }`}
          onClick={handleCopyWorktreePath}
          title={copied ? 'Copied!' : 'Click to copy worktree path'}
        >
          <span
            className={`truncate ${copied ? 'text-green-800' : ''}`}
            dir="rtl"
          >
            {selectedAttempt.container_ref}
          </span>
          {copied && (
            <span className="text-green-700 font-medium whitespace-nowrap">
              Copied!
            </span>
          )}
        </div>
      </div>

      <div>
        <div className="grid grid-cols-2 gap-3 @md:flex @md:flex-wrap @md:items-center">
          <div className="flex gap-2 @md:flex-none">
            <Button
              variant={runningDevServer ? 'destructive' : 'outline'}
              size="xs"
              onClick={() =>
                runningDevServer ? stopDevServer() : startDevServer()
              }
              disabled={isStartingDevServer || !projectHasDevScript}
              className="gap-1 flex-1"
            >
              {runningDevServer ? (
                <>
                  <StopCircle className="h-3 w-3" />
                  Stop Dev
                </>
              ) : (
                <>
                  <Play className="h-3 w-3" />
                  Dev
                </>
              )}
            </Button>

            {/* View Dev Server Logs Button */}
            {latestDevServerProcess && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={handleViewDevServerLogs}
                      className="gap-1"
                    >
                      <ScrollText className="h-3 w-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>View dev server logs</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
          {/* Git Operations */}
          {selectedAttempt && branchStatus && !mergeInfo.hasMergedPR && (
            <>
              {(branchStatus.commits_behind ?? 0) > 0 && (
                <Button
                  onClick={handleRebaseClick}
                  disabled={rebasing || isAttemptRunning}
                  variant="outline"
                  size="xs"
                  className="border-orange-300 text-orange-700 hover:bg-orange-50 gap-1"
                >
                  <RefreshCw
                    className={`h-3 w-3 ${rebasing ? 'animate-spin' : ''}`}
                  />
                  {rebasing ? 'Rebasing...' : `Rebase`}
                </Button>
              )}
              <>
                <Button
                  onClick={handlePRButtonClick}
                  disabled={
                    creatingPR ||
                    pushing ||
                    Boolean((branchStatus.commits_behind ?? 0) > 0) ||
                    isAttemptRunning ||
                    (mergeInfo.hasOpenPR &&
                      branchStatus.remote_commits_ahead === 0) ||
                    ((branchStatus.commits_ahead ?? 0) === 0 &&
                      (branchStatus.remote_commits_ahead ?? 0) === 0 &&
                      !pushSuccess &&
                      !mergeSuccess)
                  }
                  variant="outline"
                  size="xs"
                  className="border-blue-300 text-blue-700 hover:bg-blue-50 gap-1 min-w-[120px]"
                >
                  <GitPullRequest className="h-3 w-3" />
                  {mergeInfo.hasOpenPR
                    ? pushSuccess
                      ? 'Pushed!'
                      : pushing
                        ? 'Pushing...'
                        : branchStatus.remote_commits_ahead === 0
                          ? 'Push to PR'
                          : branchStatus.remote_commits_ahead === 1
                            ? 'Push 1 commit'
                            : `Push ${branchStatus.remote_commits_ahead || 0} commits`
                    : creatingPR
                      ? 'Creating...'
                      : 'Create PR'}
                </Button>
                <Button
                  onClick={handleMergeClick}
                  disabled={
                    mergeInfo.hasOpenPR ||
                    merging ||
                    Boolean((branchStatus.commits_behind ?? 0) > 0) ||
                    isAttemptRunning ||
                    ((branchStatus.commits_ahead ?? 0) === 0 &&
                      !pushSuccess &&
                      !mergeSuccess)
                  }
                  size="xs"
                  className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 gap-1 min-w-[120px]"
                >
                  <GitBranchIcon className="h-3 w-3" />
                  {mergeSuccess ? 'Merged!' : merging ? 'Merging...' : 'Merge'}
                </Button>
              </>
            </>
          )}

          <div className="flex gap-2 @md:flex-none">
            {isStopping || isAttemptRunning ? (
              <Button
                variant="destructive"
                size="xs"
                onClick={stopExecution}
                disabled={isStopping}
                className="gap-1 flex-1"
              >
                <StopCircle className="h-4 w-4" />
                {isStopping ? 'Stopping...' : 'Stop Attempt'}
              </Button>
            ) : (
              <Button
                variant="outline"
                size="xs"
                onClick={handleEnterCreateAttemptMode}
                className="gap-1 flex-1"
              >
                <Plus className="h-4 w-4" />
                New Attempt
              </Button>
            )}
            {taskAttempts.length > 1 && (
              <DropdownMenu>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="xs" className="gap-1">
                          <History className="h-3 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>View attempt history</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <DropdownMenuContent align="start" className="w-64">
                  {taskAttempts.map((attempt) => (
                    <DropdownMenuItem
                      key={attempt.id}
                      onClick={() => handleAttemptChange(attempt)}
                      className={
                        selectedAttempt?.id === attempt.id ? 'bg-accent' : ''
                      }
                    >
                      <div className="flex flex-col w-full">
                        <span className="font-medium text-sm">
                          {new Date(attempt.created_at).toLocaleDateString()}{' '}
                          {new Date(attempt.created_at).toLocaleTimeString()}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {attempt.executor || 'Base Agent'}
                        </span>
                      </div>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </div>

      {/* Rebase Dialog */}
      <Dialog open={showRebaseDialog} onOpenChange={setShowRebaseDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rebase Task Attempt</DialogTitle>
            <DialogDescription>
              Choose a new base branch to rebase this task attempt onto.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="base-branch" className="text-sm font-medium">
                Base Branch
              </label>
              <BranchSelector
                branches={branches}
                selectedBranch={selectedRebaseBranch}
                onBranchSelect={setSelectedRebaseBranch}
                placeholder="Select a base branch"
                excludeCurrentBranch={false}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowRebaseDialog(false)}
              disabled={rebasing}
            >
              Cancel
            </Button>
            <Button
              onClick={handleRebaseDialogConfirm}
              disabled={rebasing || !selectedRebaseBranch}
            >
              {rebasing ? 'Rebasing...' : 'Rebase'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Stop Execution Confirmation Dialog */}
      <Dialog
        open={showStopConfirmation}
        onOpenChange={setShowStopConfirmation}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Stop Current Attempt?</DialogTitle>
            <DialogDescription>
              Are you sure you want to stop the current execution? This action
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowStopConfirmation(false)}
              disabled={isStopping}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                setShowStopConfirmation(false);
                await stopExecution();
              }}
              disabled={isStopping}
            >
              {isStopping ? 'Stopping...' : 'Stop'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default CurrentAttempt;

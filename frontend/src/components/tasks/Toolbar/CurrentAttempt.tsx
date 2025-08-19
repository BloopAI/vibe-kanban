import {
  ExternalLink,
  GitBranch as GitBranchIcon,
  GitPullRequest,
  History,
  Upload,
  Play,
  Plus,
  RefreshCw,
  Settings,
  StopCircle,
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
import { attemptsApi, executionProcessesApi } from '@/lib/api.ts';
import {
  Dispatch,
  SetStateAction,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { ExecutionProcess } from 'shared/types';
import type { BranchStatus, GitBranch, TaskAttempt } from 'shared/types';
import {
  TaskAttemptDataContext,
  TaskAttemptStoppingContext,
  TaskDetailsContext,
} from '@/components/context/taskDetailsContext.ts';
import { useConfig } from '@/components/config-provider.tsx';
import { useKeyboardShortcuts } from '@/lib/keyboard-shortcuts.ts';

// Helper function to get the display name for different editor types
function getEditorDisplayName(editorType: string): string {
  switch (editorType) {
    case 'VS_CODE':
      return 'Visual Studio Code';
    case 'CURSOR':
      return 'Cursor';
    case 'WINDSURF':
      return 'Windsurf';
    case 'INTELLIJ':
      return 'IntelliJ IDEA';
    case 'ZED':
      return 'Zed';
    case 'CUSTOM':
      return 'Editor';
    default:
      return 'Editor';
  }
}

type Props = {
  setError: Dispatch<SetStateAction<string | null>>;
  setShowCreatePRDialog: Dispatch<SetStateAction<boolean>>;
  selectedBranch: string | null;
  selectedAttempt: TaskAttempt;
  taskAttempts: TaskAttempt[];
  creatingPR: boolean;
  handleEnterCreateAttemptMode: () => void;
  handleAttemptSelect: (attempt: TaskAttempt) => void;
  branches: GitBranch[];
};

function CurrentAttempt({
  setError,
  setShowCreatePRDialog,
  selectedBranch,
  selectedAttempt,
  taskAttempts,
  creatingPR,
  handleEnterCreateAttemptMode,
  handleAttemptSelect,
  branches,
}: Props) {
  const { task, projectId, handleOpenInEditor, projectHasDevScript } =
    useContext(TaskDetailsContext);
  const { config } = useConfig();
  const { isStopping, setIsStopping } = useContext(TaskAttemptStoppingContext);
  const { attemptData, fetchAttemptData, isAttemptRunning } = useContext(
    TaskAttemptDataContext
  );

  const [isStartingDevServer, setIsStartingDevServer] = useState(false);
  const [merging, setMerging] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [rebasing, setRebasing] = useState(false);
  const [devServerDetails, setDevServerDetails] =
    useState<ExecutionProcess | null>(null);
  const [isHoveringDevServer, setIsHoveringDevServer] = useState(false);
  const [branchStatus, setBranchStatus] = useState<BranchStatus | null>(null);
  const [branchStatusLoading, setBranchStatusLoading] = useState(false);
  const [showRebaseDialog, setShowRebaseDialog] = useState(false);
  const [selectedRebaseBranch, setSelectedRebaseBranch] = useState<string>('');
  const [showStopConfirmation, setShowStopConfirmation] = useState(false);
  const [copied, setCopied] = useState(false);

  const processedDevServerLogs = useMemo(() => {
    if (!devServerDetails) return 'No output yet...';

    // TODO: stdout/stderr fields need to be restored to ExecutionProcess type
    // For now, show basic status information
    return `Status: ${devServerDetails.status}\nStarted: ${devServerDetails.started_at}`;
  }, [devServerDetails]);

  // Find running dev server in current project
  const runningDevServer = useMemo(() => {
    return attemptData.processes.find(
      (process) =>
        process.run_reason === 'devserver' && process.status === 'running'
    );
  }, [attemptData.processes]);

  const fetchDevServerDetails = useCallback(async () => {
    if (!runningDevServer || !task || !selectedAttempt) return;

    try {
      const result = await executionProcessesApi.getDetails(
        runningDevServer.id
      );
      setDevServerDetails(result);
    } catch (err) {
      console.error('Failed to fetch dev server details:', err);
    }
  }, [runningDevServer, task, selectedAttempt, projectId]);

  useEffect(() => {
    if (!isHoveringDevServer || !runningDevServer) {
      setDevServerDetails(null);
      return;
    }

    fetchDevServerDetails();
    const interval = setInterval(fetchDevServerDetails, 2000);
    return () => clearInterval(interval);
  }, [isHoveringDevServer, runningDevServer, fetchDevServerDetails]);

  const startDevServer = async () => {
    if (!task || !selectedAttempt) return;

    setIsStartingDevServer(true);

    try {
      await attemptsApi.startDevServer(selectedAttempt.id);
      fetchAttemptData(selectedAttempt.id);
    } catch (err) {
      console.error('Failed to start dev server:', err);
    } finally {
      setIsStartingDevServer(false);
    }
  };

  const stopDevServer = async () => {
    if (!task || !selectedAttempt || !runningDevServer) return;

    setIsStartingDevServer(true);

    try {
      await executionProcessesApi.stopExecutionProcess(runningDevServer.id);
      fetchAttemptData(selectedAttempt.id);
    } catch (err) {
      console.error('Failed to stop dev server:', err);
    } finally {
      setIsStartingDevServer(false);
    }
  };

  const stopAllExecutions = useCallback(async () => {
    if (!task || !selectedAttempt || !isAttemptRunning) return;

    try {
      setIsStopping(true);
      await attemptsApi.stop(selectedAttempt.id);
      await fetchAttemptData(selectedAttempt.id);
      setTimeout(() => {
        fetchAttemptData(selectedAttempt.id);
      }, 1000);
    } catch (err) {
      console.error('Failed to stop executions:', err);
    } finally {
      setIsStopping(false);
    }
  }, [
    task,
    selectedAttempt,
    projectId,
    fetchAttemptData,
    setIsStopping,
    isAttemptRunning,
  ]);

  useKeyboardShortcuts({
    stopExecution: () => setShowStopConfirmation(true),
    newAttempt: !isAttemptRunning ? handleEnterCreateAttemptMode : () => {},
    hasOpenDialog: showStopConfirmation,
    closeDialog: () => setShowStopConfirmation(false),
    onEnter: () => {
      setShowStopConfirmation(false);
      stopAllExecutions();
    },
  });

  const handleAttemptChange = useCallback(
    (attempt: TaskAttempt) => {
      handleAttemptSelect(attempt);
      fetchAttemptData(attempt.id);
    },
    [fetchAttemptData, handleAttemptSelect]
  );

  const handleMergeClick = async () => {
    if (!projectId || !selectedAttempt?.id || !selectedAttempt?.task_id) return;

    // Directly perform merge without checking branch status
    await performMerge();
  };

  const handlePushClick = async () => {
    if (!selectedAttempt?.id) return;
    try {
      setPushing(true);
      await attemptsApi.push(selectedAttempt.id);
      fetchBranchStatus();
    } catch (error: any) {
      console.error('Failed to push changes:', error);
      setError(error.message || 'Failed to push changes');
    } finally {
      setPushing(false);
    }
  };

  const fetchBranchStatus = useCallback(async () => {
    if (!selectedAttempt?.id) return;

    try {
      setBranchStatusLoading(true);
      const result = await attemptsApi.getBranchStatus(selectedAttempt.id);
      setBranchStatus((prev) => {
        if (JSON.stringify(prev) === JSON.stringify(result)) return prev;
        return result;
      });
    } catch (err) {
      setError('Failed to load branch status');
    } finally {
      setBranchStatusLoading(false);
    }
  }, [projectId, selectedAttempt?.id, selectedAttempt?.task_id, setError]);

  // Fetch branch status when selected attempt changes
  useEffect(() => {
    if (selectedAttempt) {
      fetchBranchStatus();
    }
  }, [selectedAttempt, fetchBranchStatus]);

  const performMerge = async () => {
    if (!projectId || !selectedAttempt?.id || !selectedAttempt?.task_id) return;

    try {
      setMerging(true);
      await attemptsApi.merge(selectedAttempt.id);
      // Refetch branch status to show updated state
      fetchBranchStatus();
    } catch (error) {
      console.error('Failed to merge changes:', error);
      // @ts-expect-error it is type ApiError
      setError(error.message || 'Failed to merge changes');
    } finally {
      setMerging(false);
    }
  };

  const handleRebaseClick = async () => {
    if (!projectId || !selectedAttempt?.id || !selectedAttempt?.task_id) return;

    try {
      setRebasing(true);
      await attemptsApi.rebase(selectedAttempt.id, { new_base_branch: null });
      // Refresh branch status after rebase
      fetchBranchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rebase branch');
    } finally {
      setRebasing(false);
    }
  };

  const handleRebaseWithNewBranch = async (newBaseBranch: string) => {
    if (!projectId || !selectedAttempt?.id || !selectedAttempt?.task_id) return;

    try {
      setRebasing(true);
      await attemptsApi.rebase(selectedAttempt.id, {
        new_base_branch: newBaseBranch,
      });
      // Refresh branch status after rebase
      fetchBranchStatus();
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

    // If PR already exists, view it in a new tab
    if (selectedAttempt.pr_url) {
      window.open(selectedAttempt.pr_url, '_blank');
      return;
    }

    setShowCreatePRDialog(true);
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

  const handleCopyWorktreePath = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(selectedAttempt.container_ref || '');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy worktree path:', err);
    }
  }, [selectedAttempt.container_ref]);

  return (
    <div className="space-y-2">
      <div className="flex gap-6 items-start">
        <div className="min-w-0">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
            Profile
          </div>
          <div className="text-sm font-medium">{selectedAttempt.profile}</div>
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
                    disabled={
                      rebasing || branchStatusLoading || isAttemptRunning
                    }
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
            {selectedAttempt.merge_commit ? (
              <div className="flex items-center gap-1.5 overflow-hidden">
                <div className="h-2 w-2 bg-green-500 rounded-full" />
                <span className="text-sm font-medium text-green-700 truncate">
                  Merged
                </span>
                <span className="text-xs font-mono text-muted-foreground truncate">
                  ({selectedAttempt.merge_commit.slice(0, 8)})
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 overflow-hidden">
                <div className="h-2 w-2 bg-yellow-500 rounded-full" />
                <span className="text-sm font-medium text-yellow-700">
                  Not merged
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="col-span-4">
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
          className={`text-xs font-mono px-2 py-1 rounded cursor-pointer transition-all duration-300 flex items-center gap-2 ${
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

      <div className="col-span-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className={!projectHasDevScript ? 'cursor-not-allowed' : ''}
                  onMouseEnter={() => setIsHoveringDevServer(true)}
                  onMouseLeave={() => setIsHoveringDevServer(false)}
                >
                  <Button
                    variant={runningDevServer ? 'destructive' : 'outline'}
                    size="xs"
                    onClick={runningDevServer ? stopDevServer : startDevServer}
                    disabled={isStartingDevServer || !projectHasDevScript}
                    className="gap-1"
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
                </div>
              </TooltipTrigger>
              <TooltipContent
                className={runningDevServer ? 'max-w-2xl p-4' : ''}
                side="top"
                align="center"
                avoidCollisions={true}
              >
                {!projectHasDevScript ? (
                  <p>
                    Add a dev server script in project settings to enable this
                    feature
                  </p>
                ) : runningDevServer && devServerDetails ? (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">
                      Dev Server Logs (Last 10 lines):
                    </p>
                    <pre className="text-xs bg-muted p-2 rounded max-h-64 overflow-y-auto whitespace-pre-wrap">
                      {processedDevServerLogs}
                    </pre>
                  </div>
                ) : runningDevServer ? (
                  <p>Stop the running dev server</p>
                ) : (
                  <p>Start the dev server</p>
                )}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Git Operations */}
          {selectedAttempt && branchStatus && (
            <>
              {(branchStatus.commits_behind ?? 0) > 0 &&
                !branchStatus.merged && (
                  <Button
                    onClick={handleRebaseClick}
                    disabled={
                      rebasing || branchStatusLoading || isAttemptRunning
                    }
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
              {
                // Normal merge and PR buttons for regular tasks
                !branchStatus.merged && (
                  <>
                    <Button
                      onClick={handlePRButtonClick}
                      disabled={
                        creatingPR ||
                        Boolean((branchStatus.commits_behind ?? 0) > 0) ||
                        isAttemptRunning
                      }
                      variant="outline"
                      size="xs"
                      className="border-blue-300 text-blue-700 hover:bg-blue-50 gap-1"
                    >
                      <GitPullRequest className="h-3 w-3" />
                      {selectedAttempt.pr_url
                        ? 'View PR'
                        : creatingPR
                          ? 'Creating...'
                          : 'Create PR'}
                    </Button>
                    <Button
                      onClick={
                        selectedAttempt.pr_status === 'open'
                          ? handlePushClick
                          : handleMergeClick
                      }
                      disabled={
                        selectedAttempt.pr_status === 'open'
                          ? pushing ||
                            isAttemptRunning ||
                            (branchStatus.remote_up_to_date ?? true)
                          : merging ||
                            Boolean((branchStatus.commits_behind ?? 0) > 0) ||
                            isAttemptRunning
                      }
                      size="xs"
                      className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 gap-1"
                    >
                      {selectedAttempt.pr_status === 'open' ? (
                        <>
                          <Upload className="h-3 w-3" />
                          {pushing
                            ? 'Pushing...'
                            : branchStatus.remote_commits_behind === null
                              ? 'Disconnected'
                              : branchStatus.remote_commits_behind === 0
                                ? 'Push to remote'
                                : branchStatus.remote_commits_behind === 1
                                  ? 'Push 1 commit'
                                  : `Push ${branchStatus.remote_commits_behind} commits`}
                        </>
                      ) : (
                        <>
                          <GitBranchIcon className="h-3 w-3" />
                          {merging ? 'Merging...' : 'Merge'}
                        </>
                      )}
                    </Button>
                  </>
                )
              }
            </>
          )}

          {isStopping || isAttemptRunning ? (
            <Button
              variant="destructive"
              size="xs"
              onClick={stopAllExecutions}
              disabled={isStopping}
              className="gap-2"
            >
              <StopCircle className="h-4 w-4" />
              {isStopping ? 'Stopping...' : 'Stop Attempt'}
            </Button>
          ) : (
            <Button
              variant="outline"
              size="xs"
              onClick={handleEnterCreateAttemptMode}
              className="gap-2"
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
                      <Button variant="outline" size="xs" className="gap-2">
                        <History className="h-4 w-4" />
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
                        {attempt.profile || 'Base Agent'}
                      </span>
                    </div>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
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
                await stopAllExecutions();
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

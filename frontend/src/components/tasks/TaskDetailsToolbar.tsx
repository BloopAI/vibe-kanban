import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  ExternalLink,
  GitBranch as GitBranchIcon,
  GitPullRequest,
  History,
  Play,
  Plus,
  RefreshCw,
  StopCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useConfig } from '@/components/config-provider';
import { makeRequest } from '@/lib/api';
import type {
  BranchStatus,
  ExecutionProcess,
  GitBranch,
  TaskAttempt,
} from 'shared/types';
import { TaskDetailsContext } from '@/components/context/taskDetailsContext.ts';
import CreatePRDialog from '@/components/tasks/Toolbar/CreatePRDialog.tsx';
import CreateAttempt from '@/components/tasks/Toolbar/CreateAttempt.tsx';

interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  message: string | null;
}

interface TaskDetailsToolbarProps {
  projectHasDevScript?: boolean;
}

export const availableExecutors = [
  { id: 'echo', name: 'Echo' },
  { id: 'claude', name: 'Claude' },
  { id: 'amp', name: 'Amp' },
  { id: 'gemini', name: 'Gemini' },
  { id: 'opencode', name: 'OpenCode' },
];

export function TaskDetailsToolbar({
  projectHasDevScript,
}: TaskDetailsToolbarProps) {
  const {
    task,
    projectId,
    setLoading,
    setSelectedAttempt,
    isStopping,
    handleOpenInEditor,
    isAttemptRunning,
    setAttemptData,
    fetchAttemptData,
    fetchExecutionState,
    selectedAttempt,
    setIsStopping,
    attemptData,
  } = useContext(TaskDetailsContext);
  const [taskAttempts, setTaskAttempts] = useState<TaskAttempt[]>([]);

  const { config } = useConfig();

  const [branches, setBranches] = useState<GitBranch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);

  const [selectedExecutor, setSelectedExecutor] = useState<string>(
    config?.executor.type || 'claude'
  );

  // State for create attempt mode
  const [isInCreateAttemptMode, setIsInCreateAttemptMode] = useState(false);
  const [createAttemptBranch, setCreateAttemptBranch] = useState<string | null>(
    selectedBranch
  );
  const [createAttemptExecutor, setCreateAttemptExecutor] =
    useState<string>(selectedExecutor);

  // Branch status and git operations state
  const [branchStatus, setBranchStatus] = useState<BranchStatus | null>(null);
  const [branchStatusLoading, setBranchStatusLoading] = useState(false);
  const [merging, setMerging] = useState(false);
  const [rebasing, setRebasing] = useState(false);
  const [creatingPR, setCreatingPR] = useState(false);
  const [showCreatePRDialog, setShowCreatePRDialog] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [devServerDetails, setDevServerDetails] =
    useState<ExecutionProcess | null>(null);
  const [isHoveringDevServer, setIsHoveringDevServer] = useState(false);

  // Find running dev server in current project
  const runningDevServer = useMemo(() => {
    return attemptData.processes.find(
      (process) =>
        process.process_type === 'devserver' && process.status === 'running'
    );
  }, [attemptData.processes]);

  const fetchDevServerDetails = useCallback(async () => {
    if (!runningDevServer || !task || !selectedAttempt) return;

    try {
      const response = await makeRequest(
        `/api/projects/${projectId}/execution-processes/${runningDevServer.id}`
      );
      if (response.ok) {
        const result: ApiResponse<ExecutionProcess> = await response.json();
        if (result.success && result.data) {
          setDevServerDetails(result.data);
        }
      }
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

  const processedDevServerLogs = useMemo(() => {
    if (!devServerDetails) return 'No output yet...';

    const stdout = devServerDetails.stdout || '';
    const stderr = devServerDetails.stderr || '';
    const allOutput = stdout + (stderr ? '\n' + stderr : '');
    const lines = allOutput.split('\n').filter((line) => line.trim());
    const lastLines = lines.slice(-10);
    return lastLines.length > 0 ? lastLines.join('\n') : 'No output yet...';
  }, [devServerDetails]);

  const fetchProjectBranches = useCallback(async () => {
    try {
      const response = await makeRequest(`/api/projects/${projectId}/branches`);
      if (response.ok) {
        const result: ApiResponse<GitBranch[]> = await response.json();
        if (result.success && result.data) {
          setBranches(result.data);
          // Set current branch as default
          const currentBranch = result.data.find((b) => b.is_current);
          if (currentBranch && !selectedBranch) {
            setSelectedBranch(currentBranch.name);
          }
        }
      }
    } catch (err) {
      console.error('Failed to fetch project branches:', err);
    }
  }, [projectId, selectedBranch]);

  useEffect(() => {
    fetchProjectBranches();
  }, [fetchProjectBranches]);

  // Set default executor from config
  useEffect(() => {
    if (config && config.executor.type !== selectedExecutor) {
      setSelectedExecutor(config.executor.type);
    }
  }, [config, selectedExecutor]);

  // Set create attempt mode when there are no attempts
  useEffect(() => {
    setIsInCreateAttemptMode(taskAttempts.length === 0);
  }, [taskAttempts.length]);

  // Update default values from latest attempt when taskAttempts change
  useEffect(() => {
    if (taskAttempts.length > 0) {
      const latestAttempt = taskAttempts.reduce((latest, current) =>
        new Date(current.created_at) > new Date(latest.created_at)
          ? current
          : latest
      );

      // Only update if branch still exists in available branches
      if (
        latestAttempt.base_branch &&
        branches.some((b: GitBranch) => b.name === latestAttempt.base_branch)
      ) {
        setCreateAttemptBranch(latestAttempt.base_branch);
      }

      // Only update executor if it's different from default and exists in available executors
      if (
        latestAttempt.executor &&
        availableExecutors.some((e) => e.id === latestAttempt.executor)
      ) {
        setCreateAttemptExecutor(latestAttempt.executor);
      }
    }
  }, [taskAttempts, branches, availableExecutors]);

  const fetchTaskAttempts = useCallback(async () => {
    if (!task) return;

    try {
      setLoading(true);
      const response = await makeRequest(
        `/api/projects/${projectId}/tasks/${task.id}/attempts`
      );

      if (response.ok) {
        const result: ApiResponse<TaskAttempt[]> = await response.json();
        if (result.success && result.data) {
          setTaskAttempts(result.data);

          if (result.data.length > 0) {
            const latestAttempt = result.data.reduce((latest, current) =>
              new Date(current.created_at) > new Date(latest.created_at)
                ? current
                : latest
            );
            setSelectedAttempt(latestAttempt);
            fetchAttemptData(latestAttempt.id, latestAttempt.task_id);
            fetchExecutionState(latestAttempt.id, latestAttempt.task_id);
          } else {
            setSelectedAttempt(null);
            setAttemptData({
              activities: [],
              processes: [],
              runningProcessDetails: {},
            });
          }
        }
      }
    } catch (err) {
      console.error('Failed to fetch task attempts:', err);
    } finally {
      setLoading(false);
    }
  }, [task, projectId, fetchAttemptData, fetchExecutionState]);

  useEffect(() => {
    fetchTaskAttempts();
  }, [fetchTaskAttempts]);

  const [isStartingDevServer, setIsStartingDevServer] = useState(false);

  const startDevServer = async () => {
    if (!task || !selectedAttempt) return;

    setIsStartingDevServer(true);

    try {
      const response = await makeRequest(
        `/api/projects/${projectId}/tasks/${selectedAttempt.task_id}/attempts/${selectedAttempt.id}/start-dev-server`,
        {
          method: 'POST',
        }
      );

      if (!response.ok) {
        throw new Error('Failed to start dev server');
      }

      const data: ApiResponse<null> = await response.json();

      if (!data.success) {
        throw new Error(data.message || 'Failed to start dev server');
      }

      fetchAttemptData(selectedAttempt.id, selectedAttempt.task_id);
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
      const response = await makeRequest(
        `/api/projects/${projectId}/tasks/${selectedAttempt.task_id}/attempts/${selectedAttempt.id}/execution-processes/${runningDevServer.id}/stop`,
        {
          method: 'POST',
        }
      );

      if (!response.ok) {
        throw new Error('Failed to stop dev server');
      }

      fetchAttemptData(selectedAttempt.id, selectedAttempt.task_id);
    } catch (err) {
      console.error('Failed to stop dev server:', err);
    } finally {
      setIsStartingDevServer(false);
    }
  };

  const stopAllExecutions = async () => {
    if (!task || !selectedAttempt) return;

    try {
      setIsStopping(true);
      const response = await makeRequest(
        `/api/projects/${projectId}/tasks/${selectedAttempt.task_id}/attempts/${selectedAttempt.id}/stop`,
        {
          method: 'POST',
        }
      );

      if (response.ok) {
        await fetchAttemptData(selectedAttempt.id, selectedAttempt.task_id);
        setTimeout(() => {
          fetchAttemptData(selectedAttempt.id, selectedAttempt.task_id);
        }, 1000);
      }
    } catch (err) {
      console.error('Failed to stop executions:', err);
    } finally {
      setIsStopping(false);
    }
  };

  const handleAttemptChange = useCallback(
    (attempt: TaskAttempt) => {
      setSelectedAttempt(attempt);
      fetchAttemptData(attempt.id, attempt.task_id);
      fetchExecutionState(attempt.id, attempt.task_id);
    },
    [fetchAttemptData, fetchExecutionState, setSelectedAttempt]
  );

  // Branch status fetching
  const fetchBranchStatus = useCallback(async () => {
    if (!projectId || !selectedAttempt?.id || !selectedAttempt?.task_id) return;

    try {
      setBranchStatusLoading(true);
      const response = await makeRequest(
        `/api/projects/${projectId}/tasks/${selectedAttempt.task_id}/attempts/${selectedAttempt.id}/branch-status`
      );

      if (response.ok) {
        const result: ApiResponse<BranchStatus> = await response.json();
        if (result.success && result.data) {
          setBranchStatus(result.data);
        } else {
          setError('Failed to load branch status');
        }
      } else {
        setError('Failed to load branch status');
      }
    } catch (err) {
      setError('Failed to load branch status');
    } finally {
      setBranchStatusLoading(false);
    }
  }, [projectId, selectedAttempt?.id, selectedAttempt?.task_id]);

  // Fetch branch status when selected attempt changes
  useEffect(() => {
    if (selectedAttempt) {
      fetchBranchStatus();
    }
  }, [selectedAttempt, fetchBranchStatus]);

  // Git operations
  const handleMergeClick = async () => {
    if (!projectId || !selectedAttempt?.id || !selectedAttempt?.task_id) return;

    // Directly perform merge without checking branch status
    await performMerge();
  };

  const performMerge = async () => {
    if (!projectId || !selectedAttempt?.id || !selectedAttempt?.task_id) return;

    try {
      setMerging(true);
      const response = await makeRequest(
        `/api/projects/${projectId}/tasks/${selectedAttempt.task_id}/attempts/${selectedAttempt.id}/merge`,
        {
          method: 'POST',
        }
      );

      if (response.ok) {
        const result: ApiResponse<string> = await response.json();
        if (result.success) {
          // Refetch branch status to show updated state
          fetchBranchStatus();
        } else {
          setError(result.message || 'Failed to merge changes');
        }
      } else {
        setError('Failed to merge changes');
      }
    } catch (err) {
      setError('Failed to merge changes');
    } finally {
      setMerging(false);
    }
  };

  const handleRebaseClick = async () => {
    if (!projectId || !selectedAttempt?.id || !selectedAttempt?.task_id) return;

    try {
      setRebasing(true);
      const response = await makeRequest(
        `/api/projects/${projectId}/tasks/${selectedAttempt.task_id}/attempts/${selectedAttempt.id}/rebase`,
        {
          method: 'POST',
        }
      );

      if (response.ok) {
        const result: ApiResponse<string> = await response.json();
        if (result.success) {
          // Refresh branch status after rebase
          fetchBranchStatus();
        } else {
          setError(result.message || 'Failed to rebase branch');
        }
      } else {
        setError('Failed to rebase branch');
      }
    } catch (err) {
      setError('Failed to rebase branch');
    } finally {
      setRebasing(false);
    }
  };

  const handleCreatePRClick = async () => {
    if (!projectId || !selectedAttempt?.id || !selectedAttempt?.task_id) return;

    // If PR already exists, open it
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

  // Handle entering create attempt mode
  const handleEnterCreateAttemptMode = () => {
    setIsInCreateAttemptMode(true);

    // Use latest attempt's settings as defaults if available
    if (taskAttempts.length > 0) {
      const latestAttempt = taskAttempts.reduce((latest, current) =>
        new Date(current.created_at) > new Date(latest.created_at)
          ? current
          : latest
      );

      // Use latest attempt's branch if it still exists, otherwise use current selected branch
      if (
        latestAttempt.base_branch &&
        branches.some((b: GitBranch) => b.name === latestAttempt.base_branch)
      ) {
        setCreateAttemptBranch(latestAttempt.base_branch);
      } else {
        setCreateAttemptBranch(selectedBranch);
      }

      // Use latest attempt's executor if it exists, otherwise use current selected executor
      if (
        latestAttempt.executor &&
        availableExecutors.some((e) => e.id === latestAttempt.executor)
      ) {
        setCreateAttemptExecutor(latestAttempt.executor);
      } else {
        setCreateAttemptExecutor(selectedExecutor);
      }
    } else {
      // Fallback to current selected values if no attempts exist
      setCreateAttemptBranch(selectedBranch);
      setCreateAttemptExecutor(selectedExecutor);
    }
  };

  return (
    <>
      <div className="px-6 pb-4 border-b">
        {/* Error Display */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <div className="text-red-600 text-sm">{error}</div>
          </div>
        )}

        {isInCreateAttemptMode ? (
          <CreateAttempt
            fetchTaskAttempts={fetchTaskAttempts}
            createAttemptBranch={createAttemptBranch}
            selectedBranch={selectedBranch}
            createAttemptExecutor={createAttemptExecutor}
            selectedExecutor={selectedExecutor}
            taskAttempts={taskAttempts}
            branches={branches}
            setCreateAttemptBranch={setCreateAttemptBranch}
            setIsInCreateAttemptMode={setIsInCreateAttemptMode}
            setCreateAttemptExecutor={setCreateAttemptExecutor}
          />
        ) : (
          <div className="space-y-3 p-3 bg-muted/20 rounded-lg border">
            {/* Current Attempt Info */}
            <div className="space-y-2">
              {selectedAttempt ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-4 gap-3 items-start">
                    <div>
                      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                        Started
                      </div>
                      <div className="text-sm font-medium">
                        {new Date(
                          selectedAttempt.created_at
                        ).toLocaleDateString()}{' '}
                        {new Date(
                          selectedAttempt.created_at
                        ).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                        Agent
                      </div>
                      <div className="text-sm font-medium">
                        {availableExecutors.find(
                          (e) => e.id === selectedAttempt.executor
                        )?.name ||
                          selectedAttempt.executor ||
                          'Unknown'}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                        Base Branch
                      </div>
                      <div className="flex items-center gap-1.5">
                        <GitBranchIcon className="h-3 w-3 text-muted-foreground" />
                        <span className="text-sm font-medium">
                          {branchStatus?.base_branch_name ||
                            selectedBranchDisplayName}
                        </span>
                      </div>
                    </div>

                    <div>
                      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                        Merge Status
                      </div>
                      <div className="flex items-center gap-1.5">
                        {selectedAttempt.merge_commit ? (
                          <div className="flex items-center gap-1.5">
                            <div className="h-2 w-2 bg-green-500 rounded-full" />
                            <span className="text-sm font-medium text-green-700">
                              Merged
                            </span>
                            <span className="text-xs font-mono text-muted-foreground">
                              ({selectedAttempt.merge_commit.slice(0, 8)})
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
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
                      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Worktree Path
                      </div>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleOpenInEditor()}
                              className="h-4 w-4 p-0 hover:bg-muted"
                            >
                              <ExternalLink className="h-3 w-3" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Open in editor</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <div className="text-xs font-mono text-muted-foreground bg-muted px-2 py-1 rounded break-all">
                      {selectedAttempt.worktree_path}
                    </div>
                  </div>

                  <div className="col-span-4 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div
                        className={
                          !projectHasDevScript ? 'cursor-not-allowed' : ''
                        }
                        onMouseEnter={() => setIsHoveringDevServer(true)}
                        onMouseLeave={() => setIsHoveringDevServer(false)}
                      >
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant={
                                  runningDevServer ? 'destructive' : 'outline'
                                }
                                size="sm"
                                onClick={
                                  runningDevServer
                                    ? stopDevServer
                                    : startDevServer
                                }
                                disabled={
                                  isStartingDevServer || !projectHasDevScript
                                }
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
                                    Dev Server
                                  </>
                                )}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent
                              className={
                                runningDevServer ? 'max-w-2xl p-4' : ''
                              }
                              side="top"
                              align="center"
                              avoidCollisions={true}
                            >
                              {!projectHasDevScript ? (
                                <p>
                                  Configure a dev server command in project
                                  settings
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
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      {taskAttempts.length > 1 && (
                        <DropdownMenu>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="gap-2"
                                  >
                                    <History className="h-4 w-4" />
                                    History
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
                                  selectedAttempt?.id === attempt.id
                                    ? 'bg-accent'
                                    : ''
                                }
                              >
                                <div className="flex flex-col w-full">
                                  <span className="font-medium text-sm">
                                    {new Date(
                                      attempt.created_at
                                    ).toLocaleDateString()}{' '}
                                    {new Date(
                                      attempt.created_at
                                    ).toLocaleTimeString()}
                                  </span>
                                  <span className="text-xs text-muted-foreground">
                                    {attempt.executor || 'executor'}
                                  </span>
                                </div>
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}

                      {/* Git Operations */}
                      {selectedAttempt && branchStatus && (
                        <>
                          {branchStatus.is_behind === true &&
                            !branchStatus.merged && (
                              <Button
                                onClick={handleRebaseClick}
                                disabled={
                                  rebasing ||
                                  branchStatusLoading ||
                                  isAttemptRunning
                                }
                                variant="outline"
                                size="sm"
                                className="border-orange-300 text-orange-700 hover:bg-orange-50 gap-1"
                              >
                                <RefreshCw
                                  className={`h-3 w-3 ${rebasing ? 'animate-spin' : ''}`}
                                />
                                {rebasing ? 'Rebasing...' : `Rebase`}
                              </Button>
                            )}
                          {!branchStatus.merged && (
                            <>
                              <Button
                                onClick={handleCreatePRClick}
                                disabled={
                                  creatingPR ||
                                  Boolean(branchStatus.is_behind) ||
                                  isAttemptRunning
                                }
                                variant="outline"
                                size="sm"
                                className="border-blue-300 text-blue-700 hover:bg-blue-50 gap-1"
                              >
                                <GitPullRequest className="h-3 w-3" />
                                {selectedAttempt.pr_url
                                  ? 'Open PR'
                                  : creatingPR
                                    ? 'Creating...'
                                    : 'Create PR'}
                              </Button>
                              <Button
                                onClick={handleMergeClick}
                                disabled={
                                  merging ||
                                  Boolean(branchStatus.is_behind) ||
                                  isAttemptRunning
                                }
                                size="sm"
                                className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 gap-1"
                              >
                                <GitBranchIcon className="h-3 w-3" />
                                {merging ? 'Merging...' : 'Merge'}
                              </Button>
                            </>
                          )}
                        </>
                      )}

                      {isStopping || isAttemptRunning ? (
                        <Button
                          variant="destructive"
                          size="sm"
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
                          size="sm"
                          onClick={handleEnterCreateAttemptMode}
                          className="gap-2"
                        >
                          <Plus className="h-4 w-4" />
                          New Attempt
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 flex-1">
                  <div className="text-lg font-medium text-muted-foreground">
                    No attempts yet
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">
                    Start your first attempt to begin working on this task
                  </div>
                </div>
              )}
            </div>

            {/* Special Actions */}
            {!selectedAttempt && !isAttemptRunning && !isStopping && (
              <div className="space-y-2 pt-3 border-t">
                <Button
                  onClick={handleEnterCreateAttemptMode}
                  size="sm"
                  className="w-full gap-2"
                >
                  <Play className="h-4 w-4" />
                  Start Attempt
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      <CreatePRDialog
        creatingPR={creatingPR}
        setShowCreatePRDialog={setShowCreatePRDialog}
        showCreatePRDialog={showCreatePRDialog}
        setCreatingPR={setCreatingPR}
        setError={setError}
        branches={branches}
      />
    </>
  );
}

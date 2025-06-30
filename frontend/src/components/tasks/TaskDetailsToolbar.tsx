import { Link } from 'react-router-dom';
import { useState, useMemo, useEffect } from 'react';
import {
  History,
  Settings2,
  StopCircle,
  Play,
  GitCompare,
  ExternalLink,
  GitBranch as GitBranchIcon,
  Search,
  X,
  ArrowDown,
  Plus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useConfig } from '@/components/config-provider';
import type {
  TaskAttempt,
  TaskWithAttemptStatus,
  ExecutionProcessSummary,
  ExecutionProcess,
  Project,
  GitBranch,
} from 'shared/types';

interface TaskDetailsToolbarProps {
  task: TaskWithAttemptStatus;
  project: Project | null;
  projectId: string;
  selectedAttempt: TaskAttempt | null;
  taskAttempts: TaskAttempt[];
  isAttemptRunning: boolean;
  isStopping: boolean;
  selectedExecutor: string;
  runningDevServer: ExecutionProcessSummary | undefined;
  isStartingDevServer: boolean;
  devServerDetails: ExecutionProcess | null;
  processedDevServerLogs: string;
  branches: GitBranch[];
  selectedBranch: string | null;
  onAttemptChange: (attemptId: string) => void;
  onCreateNewAttempt: (executor?: string, baseBranch?: string) => void;
  onStopAllExecutions: () => void;
  onStartDevServer: () => void;
  onStopDevServer: () => void;
  onOpenInEditor: () => void;
  onSetIsHoveringDevServer: (hovering: boolean) => void;
}

const availableExecutors = [
  { id: 'echo', name: 'Echo' },
  { id: 'claude', name: 'Claude' },
  { id: 'amp', name: 'Amp' },
  { id: 'gemini', name: 'Gemini' },
  { id: 'opencode', name: 'OpenCode' },
];

export function TaskDetailsToolbar({
  task,
  project,
  projectId,
  selectedAttempt,
  taskAttempts,
  isAttemptRunning,
  isStopping,
  selectedExecutor,
  runningDevServer,
  isStartingDevServer,
  devServerDetails,
  processedDevServerLogs,
  branches,
  selectedBranch,
  onAttemptChange,
  onCreateNewAttempt,
  onStopAllExecutions,
  onStartDevServer,
  onStopDevServer,
  onOpenInEditor,
  onSetIsHoveringDevServer,
}: TaskDetailsToolbarProps) {
  const { config } = useConfig();
  const [branchSearchTerm, setBranchSearchTerm] = useState('');

  // State for create attempt mode
  const [isInCreateAttemptMode, setIsInCreateAttemptMode] = useState(false);
  const [createAttemptBranch, setCreateAttemptBranch] = useState<string | null>(
    selectedBranch
  );
  const [createAttemptExecutor, setCreateAttemptExecutor] =
    useState<string>(selectedExecutor);

  // Set create attempt mode when there are no attempts
  useEffect(() => {
    setIsInCreateAttemptMode(taskAttempts.length === 0);
  }, [taskAttempts.length]);

  // Filter branches based on search term
  const filteredBranches = useMemo(() => {
    if (!branchSearchTerm.trim()) {
      return branches;
    }
    return branches.filter((branch) =>
      branch.name.toLowerCase().includes(branchSearchTerm.toLowerCase())
    );
  }, [branches, branchSearchTerm]);

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
    setCreateAttemptBranch(selectedBranch);
    setCreateAttemptExecutor(selectedExecutor);
  };

  // Handle exiting create attempt mode
  const handleExitCreateAttemptMode = () => {
    setIsInCreateAttemptMode(false);
  };

  // Handle creating the attempt
  const handleCreateAttempt = () => {
    onCreateNewAttempt(createAttemptExecutor, createAttemptBranch || undefined);
    handleExitCreateAttemptMode();
  };

  // Render create attempt UI
  const renderCreateAttemptUI = () => (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold">Create Attempt</h3>
        {taskAttempts.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleExitCreateAttemptMode}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
      <div className="flex items-center w-4/5">
        <label className="text-xs font-medium text-muted-foreground">
          Each time you start an attempt, a new session is initiated with your
          selected coding agent, and a git worktree and corresponding task
          branch are created.
        </label>
      </div>

      <div className="grid grid-cols-3 gap-3 items-end">
        {/* Step 1: Choose Base Branch */}
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Base branch
            </label>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-between text-xs"
              >
                <div className="flex items-center gap-1.5">
                  <GitBranchIcon className="h-3 w-3" />
                  <span className="truncate">
                    {createAttemptBranch
                      ? createAttemptBranch.includes('/')
                        ? createAttemptBranch.split('/').pop()
                        : createAttemptBranch
                      : 'current'}
                  </span>
                </div>
                <ArrowDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-80">
              <div className="p-2">
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search branches..."
                    value={branchSearchTerm}
                    onChange={(e) => setBranchSearchTerm(e.target.value)}
                    className="pl-8"
                  />
                </div>
              </div>
              <DropdownMenuSeparator />
              <div className="max-h-64 overflow-y-auto">
                {filteredBranches.length === 0 ? (
                  <div className="p-2 text-sm text-muted-foreground text-center">
                    No branches found
                  </div>
                ) : (
                  filteredBranches.map((branch) => (
                    <DropdownMenuItem
                      key={branch.name}
                      onClick={() => {
                        setCreateAttemptBranch(branch.name);
                        setBranchSearchTerm('');
                      }}
                      className={
                        createAttemptBranch === branch.name ? 'bg-accent' : ''
                      }
                    >
                      <div className="flex items-center justify-between w-full">
                        <span
                          className={branch.is_current ? 'font-medium' : ''}
                        >
                          {branch.name}
                        </span>
                        <div className="flex gap-1">
                          {branch.is_current && (
                            <span className="text-xs bg-green-100 text-green-800 px-1 rounded">
                              current
                            </span>
                          )}
                          {branch.is_remote && (
                            <span className="text-xs bg-blue-100 text-blue-800 px-1 rounded">
                              remote
                            </span>
                          )}
                        </div>
                      </div>
                    </DropdownMenuItem>
                  ))
                )}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Step 2: Choose Coding Agent */}
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Coding agent
            </label>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-between text-xs"
              >
                <div className="flex items-center gap-1.5">
                  <Settings2 className="h-3 w-3" />
                  <span className="truncate">
                    {availableExecutors.find(
                      (e) => e.id === createAttemptExecutor
                    )?.name || 'Select agent'}
                  </span>
                </div>
                <ArrowDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-full">
              {availableExecutors.map((executor) => (
                <DropdownMenuItem
                  key={executor.id}
                  onClick={() => setCreateAttemptExecutor(executor.id)}
                  className={
                    createAttemptExecutor === executor.id ? 'bg-accent' : ''
                  }
                >
                  {executor.name}
                  {config?.executor.type === executor.id && ' (Default)'}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Step 3: Start Attempt */}
        <div className="space-y-1">
          <Button
            onClick={handleCreateAttempt}
            disabled={!createAttemptExecutor || isAttemptRunning}
            size="sm"
            className="w-full text-xs"
          >
            <Play className="h-3 w-3 mr-1.5" />
            Start
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="px-6 pb-4 border-b">
      {isInCreateAttemptMode ? (
        <div className="p-4 bg-muted/20 rounded-lg border">
          {renderCreateAttemptUI()}
        </div>
      ) : (
        <div className="space-y-3 p-3 bg-muted/20 rounded-lg border">
          {/* Current Attempt Info */}
          <div className="space-y-2">
            {selectedAttempt ? (
              <>
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
                          {selectedBranchDisplayName}
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
                              onClick={() => onOpenInEditor()}
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
                          !project?.dev_script ? 'cursor-not-allowed' : ''
                        }
                        onMouseEnter={() => onSetIsHoveringDevServer(true)}
                        onMouseLeave={() => onSetIsHoveringDevServer(false)}
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
                                    ? onStopDevServer
                                    : onStartDevServer
                                }
                                disabled={
                                  isStartingDevServer || !project?.dev_script
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
                              {!project?.dev_script ? (
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

                      <Button
                        variant="outline"
                        size="sm"
                        asChild
                        className="gap-1"
                      >
                        <Link
                          to={`/projects/${projectId}/tasks/${task.id}/attempts/${selectedAttempt.id}/compare`}
                        >
                          <GitCompare className="h-3 w-3" />
                          Changes
                        </Link>
                      </Button>
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
                                onClick={() => onAttemptChange(attempt.id)}
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

                      {isStopping || isAttemptRunning ? (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={onStopAllExecutions}
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
              </>
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
  );
}

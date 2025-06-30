import { Link } from 'react-router-dom';
import {
  History,
  Settings2,
  StopCircle,
  Play,
  GitCompare,
  ExternalLink,
  GitBranch as GitBranchIcon,
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
  onSetSelectedExecutor: (executor: string) => void;
  onSetSelectedBranch: (branch: string) => void;
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
  onSetSelectedExecutor,
  onSetSelectedBranch,
  onStartDevServer,
  onStopDevServer,
  onOpenInEditor,
  onSetIsHoveringDevServer,
}: TaskDetailsToolbarProps) {
  const { config } = useConfig();

  return (
    <div className="px-6 pb-4">
      <div className="flex items-center justify-between gap-4 p-3 bg-muted/20 rounded-lg border">
        {/* Current Attempt Info */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {selectedAttempt ? (
            <>
              <div className="text-sm">
                <span className="font-medium">
                  {new Date(selectedAttempt.created_at).toLocaleDateString()}{' '}
                  {new Date(selectedAttempt.created_at).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
                <span className="text-muted-foreground ml-2">
                  ({selectedAttempt.executor || 'executor'})
                </span>
              </div>
              <div className="h-4 w-px bg-border" />
            </>
          ) : (
            <div className="text-sm text-muted-foreground">No attempts yet</div>
          )}
        </div>

        {/* Action Button Groups */}
        <div className="flex items-center gap-2">
          {/* Attempt Management Group */}
          <div className="flex items-center gap-1">
            {taskAttempts.length > 1 && (
              <DropdownMenu>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm">
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
                      onClick={() => onAttemptChange(attempt.id)}
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
                          {attempt.executor || 'executor'}
                        </span>
                      </div>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {isAttemptRunning || isStopping ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={onStopAllExecutions}
                      disabled={isStopping}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      <StopCircle className="h-4 w-4 mr-2" />
                      {isStopping ? 'Stopping...' : 'Stop Attempt'}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>
                      {isStopping ? 'Stopping execution...' : 'Stop execution'}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : (
              <div className="flex">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          onCreateNewAttempt(
                            selectedExecutor,
                            selectedBranch || undefined
                          )
                        }
                        className="rounded-r-none border-r-0"
                      >
                        {selectedAttempt ? 'New Attempt' : 'Start Attempt'}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>
                        {selectedAttempt
                          ? 'Create new attempt with current settings'
                          : 'Start new attempt with current settings'}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <DropdownMenu>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="rounded-none border-x-0 px-2"
                          >
                            <GitBranchIcon className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Choose base branch: {selectedBranch || 'current'}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <DropdownMenuContent align="center" className="w-56">
                    {branches.map((branch) => (
                      <DropdownMenuItem
                        key={branch.name}
                        onClick={() => onSetSelectedBranch(branch.name)}
                        className={
                          selectedBranch === branch.name ? 'bg-accent' : ''
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
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <DropdownMenu>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="rounded-l-none px-2"
                          >
                            <Settings2 className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Choose executor: {selectedExecutor}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <DropdownMenuContent align="end">
                    {availableExecutors.map((executor) => (
                      <DropdownMenuItem
                        key={executor.id}
                        onClick={() => onSetSelectedExecutor(executor.id)}
                        className={
                          selectedExecutor === executor.id ? 'bg-accent' : ''
                        }
                      >
                        {executor.name}
                        {config?.executor.type === executor.id && ' (Default)'}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          </div>

          {selectedAttempt && (
            <>
              <div className="h-4 w-px bg-border" />

              {/* Dev Server Control Group */}
              <div className="flex items-center gap-1">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span
                        className={
                          !project?.dev_script ? 'cursor-not-allowed' : ''
                        }
                        onMouseEnter={() => onSetIsHoveringDevServer(true)}
                        onMouseLeave={() => onSetIsHoveringDevServer(false)}
                      >
                        <Button
                          variant={runningDevServer ? 'destructive' : 'outline'}
                          size="sm"
                          onClick={
                            runningDevServer
                              ? onStopDevServer
                              : onStartDevServer
                          }
                          disabled={isStartingDevServer || !project?.dev_script}
                        >
                          {runningDevServer ? (
                            <StopCircle className="h-4 w-4" />
                          ) : (
                            <Play className="h-4 w-4" />
                          )}
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent
                      className={runningDevServer ? 'max-w-2xl p-4' : ''}
                      side="top"
                      align="center"
                      avoidCollisions={true}
                    >
                      {!project?.dev_script ? (
                        <p>
                          Configure a dev server command in project settings
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

              <div className="h-4 w-px bg-border" />

              {/* Code Actions Group */}
              <div className="flex items-center gap-1">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onOpenInEditor()}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Open in editor</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="outline" size="sm" asChild>
                        <Link
                          to={`/projects/${projectId}/tasks/${task.id}/attempts/${selectedAttempt.id}/compare`}
                        >
                          <GitCompare className="h-4 w-4" />
                        </Link>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>View code changes</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

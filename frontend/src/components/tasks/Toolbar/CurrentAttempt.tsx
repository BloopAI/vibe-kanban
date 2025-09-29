import {
  ExternalLink,
  GitFork,
  History,
  Play,
  Plus,
  ScrollText,
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
import { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import type { TaskAttempt, TaskWithAttemptStatus } from 'shared/types';
import { useBranchStatus, useOpenInEditor } from '@/hooks';
import { useAttemptExecution } from '@/hooks/useAttemptExecution';
import { useDevServer } from '@/hooks/useDevServer';
import { useUserSystem } from '@/components/config-provider.tsx';

import { writeClipboardViaBridge } from '@/vscode/bridge';
import { useProcessSelection } from '@/contexts/ProcessSelectionContext';
import { openTaskForm } from '@/lib/openTaskForm';

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
  selectedAttempt: TaskAttempt;
  taskAttempts: TaskAttempt[];
  handleEnterCreateAttemptMode: () => void;
  setSelectedAttempt: (attempt: TaskAttempt | null) => void;
};

function CurrentAttempt({
  task,
  projectId,
  projectHasDevScript,
  selectedAttempt,
  taskAttempts,
  handleEnterCreateAttemptMode,
  setSelectedAttempt,
}: Props) {
  const { config } = useUserSystem();
  const { isAttemptRunning, stopExecution, isStopping } = useAttemptExecution(
    selectedAttempt?.id,
    task.id
  );
  const { data: branchStatus, refetch: refetchBranchStatus } = useBranchStatus(
    selectedAttempt?.id
  );
  const hasConflicts = useMemo(
    () => Boolean((branchStatus?.conflicted_files?.length ?? 0) > 0),
    [branchStatus?.conflicted_files]
  );
  const handleOpenInEditor = useOpenInEditor(selectedAttempt?.id);
  const { jumpToProcess } = useProcessSelection();

  // Attempt action hooks
  const {
    start: startDevServer,
    stop: stopDevServer,
    isStarting: isStartingDevServer,
    runningDevServer,
    latestDevServerProcess,
  } = useDevServer(selectedAttempt?.id);

  const [copied, setCopied] = useState(false);

  const handleViewDevServerLogs = () => {
    if (latestDevServerProcess) {
      jumpToProcess(latestDevServerProcess.id);
    }
  };

  const handleCreateSubtaskClick = () => {
    openTaskForm({
      projectId,
      initialBaseBranch:
        selectedAttempt.branch || selectedAttempt.target_branch,
      parentTaskAttemptId: selectedAttempt.id,
    });
  };

  // Use the stopExecution function from the hook

  const handleAttemptChange = useCallback(
    (attempt: TaskAttempt) => {
      setSelectedAttempt(attempt);
      // React Query will handle refetching when attemptId changes
    },
    [setSelectedAttempt]
  );

  // Refresh branch status when a process completes (e.g., rebase resolved by agent)
  const prevRunningRef = useRef<boolean>(isAttemptRunning);
  useEffect(() => {
    if (prevRunningRef.current && !isAttemptRunning && selectedAttempt?.id) {
      refetchBranchStatus();
    }
    prevRunningRef.current = isAttemptRunning;
  }, [isAttemptRunning, selectedAttempt?.id, refetchBranchStatus]);

  // Get display name for the configured editor
  const editorDisplayName = useMemo(() => {
    if (!config?.editor?.editor_type) return 'Editor';
    return getEditorDisplayName(config.editor.editor_type);
  }, [config?.editor?.editor_type]);

  const handleCopyWorktreePath = useCallback(async () => {
    try {
      await writeClipboardViaBridge(selectedAttempt.container_ref || '');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy worktree path:', err);
    }
  }, [selectedAttempt.container_ref]);

  return (
    <div className="space-y-2 @container">
      {/* <div className="flex gap-6 items-start"> */}
      <div className="flex items-start">
        <div className="min-w-0">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
            Agent
          </div>
          <div className="text-sm font-medium">{selectedAttempt.executor}</div>
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

      <div className="space-y-3">
        <div className="flex gap-2">
          {/* Column 1: Start Dev / View Logs */}
          <div className="flex gap-1 flex-1">
            <Button
              variant={runningDevServer ? 'destructive' : 'outline'}
              size="xs"
              onClick={() =>
                runningDevServer ? stopDevServer() : startDevServer()
              }
              disabled={
                isStartingDevServer || !projectHasDevScript || hasConflicts
              }
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
                  Start Dev
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
                      className="gap-1 px-2"
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

          {/* Column 2: New Attempt + History (shared flex-1) */}
          <div className="flex gap-1 flex-1">
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
                className={`gap-1 ${taskAttempts.length > 1 ? 'flex-1' : 'flex-1'}`}
              >
                <Plus className="h-4 w-4" />
                New Attempt
              </Button>
            )}

            {taskAttempts.length > 1 && !isStopping && !isAttemptRunning && (
              <DropdownMenu>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="outline"
                          size="xs"
                          className="gap-1 px-2"
                        >
                          <History className="h-3 w-3" />
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

          {/* Column 3: Create Subtask */}
          <Button
            onClick={handleCreateSubtaskClick}
            variant="outline"
            size="xs"
            className="gap-1 flex-1"
          >
            <GitFork className="h-3 w-3" />
            Create Subtask
          </Button>
        </div>
      </div>
    </div>
  );
}

export default CurrentAttempt;

import {
  ExternalLink,
  GitBranch as GitBranchIcon,
  History,
  Settings,
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
import { attemptsApi } from '@/lib/api.ts';
import {
  Dispatch,
  SetStateAction,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import type { GitBranch, TaskAttempt } from 'shared/types';
import {
  TaskAttemptDataContext,
  TaskAttemptStoppingContext,
  TaskDetailsContext,
} from '@/components/context/taskDetailsContext.ts';
import { useConfig } from '@/components/config-provider.tsx';
import { useKeyboardShortcuts } from '@/lib/keyboard-shortcuts.ts';
import { writeClipboardViaBridge } from '@/vscode/bridge';

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
  setError: Dispatch<SetStateAction<string | null>>;
  setShowCreatePRDialog: Dispatch<SetStateAction<boolean>>;
  selectedBranch: string | null;
  selectedAttempt: TaskAttempt;
  taskAttempts: TaskAttempt[];
  creatingPR: boolean;
  handleEnterCreateAttemptMode: () => void;
  handleAttemptSelect: (attempt: TaskAttempt) => void;
  branches: GitBranch[];
  layout?: 'default' | 'sidebar';
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
  layout = 'default',
}: Props) {
  const { task, projectId, handleOpenInEditor } =
    useContext(TaskDetailsContext);
  const { config } = useConfig();
  const { isStopping, setIsStopping } = useContext(TaskAttemptStoppingContext);
  const { fetchAttemptData, isAttemptRunning, branchStatus } = useContext(
    TaskAttemptDataContext
  );

  const [rebasing, setRebasing] = useState(false);
  const [showRebaseDialog, setShowRebaseDialog] = useState(false);
  const [selectedRebaseBranch, setSelectedRebaseBranch] = useState<string>('');
  const [showStopConfirmation, setShowStopConfirmation] = useState(false);
  const [copied, setCopied] = useState(false);

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
    newAttempt: !isAttemptRunning ? handleEnterCreateAttemptMode : () => { },
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

  const handleRebaseWithNewBranch = async (newBaseBranch: string) => {
    if (!projectId || !selectedAttempt?.id || !selectedAttempt?.task_id) return;

    try {
      setRebasing(true);
      await attemptsApi.rebase(selectedAttempt.id, {
        new_base_branch: newBaseBranch,
      });
      setError(null); // Clear any previous errors on success
      fetchAttemptData(selectedAttempt.id);
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
    <div className="space-y-3">
      <div
        className={
          layout === 'sidebar'
            ? 'grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3'
            : 'flex gap-6 items-start flex-wrap'
        }
      >
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
                <div className="flex items-center gap-1.5">
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
                      className={`text-sm font-medium ${statusInfo.textColor}`}
                    >
                      {statusInfo.text}
                    </span>
                  )}
                </div>
              );
            })()}
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
          className={`text-xs font-mono px-2 py-1 rounded break-all cursor-pointer transition-all duration-300 flex items-center gap-2 ${copied
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

      <div className="col-span-4 flex items-center justify-between gap-2 flex-wrap">
        {/* <TaskAttemptActions
          creatingPR={creatingPR}
          setShowCreatePRDialog={setShowCreatePRDialog}
          setError={setError}
          onNewAttempt={handleEnterCreateAttemptMode}
          variant="card"
        /> */}

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

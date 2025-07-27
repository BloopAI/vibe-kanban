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
import type { GitBranch, TaskAttempt } from 'shared/types';
import {
  TaskAttemptDataContext,
  TaskAttemptStoppingContext,
  TaskDetailsContext,
} from '@/components/context/taskDetailsContext.ts';
import { useConfig } from '@/components/config-provider.tsx';
import { useKeyboardShortcuts } from '@/lib/keyboard-shortcuts.ts';
<<<<<<< HEAD
import { writeClipboardViaBridge } from '@/vscode/bridge';
import { useProcessSelection } from '@/contexts/ProcessSelectionContext';
=======
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '@/lib/i18n';
>>>>>>> 6ddf031 (feat(i18n): add internationalization support with Traditional Chinese translation)

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
  const { t } = useTranslation();
  const { task, projectId, handleOpenInEditor, projectHasDevScript } =
    useContext(TaskDetailsContext);
  const { config } = useConfig();
  const { isStopping, setIsStopping } = useContext(TaskAttemptStoppingContext);
  const { attemptData, fetchAttemptData, isAttemptRunning, branchStatus } =
    useContext(TaskAttemptDataContext);
  const { jumpToProcess } = useProcessSelection();

  const [isStartingDevServer, setIsStartingDevServer] = useState(false);
  const [merging, setMerging] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [rebasing, setRebasing] = useState(false);
  const [devServerDetails, setDevServerDetails] =
    useState<ExecutionProcess | null>(null);
  const [isHoveringDevServer, setIsHoveringDevServer] = useState(false);
  const [showRebaseDialog, setShowRebaseDialog] = useState(false);
  const [selectedRebaseBranch, setSelectedRebaseBranch] = useState<string>('');
  const [showStopConfirmation, setShowStopConfirmation] = useState(false);
  const [copied, setCopied] = useState(false);
  const [mergeSuccess, setMergeSuccess] = useState(false);
  const [pushSuccess, setPushSuccess] = useState(false);

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

  // Find latest dev server process (for logs viewing)
  const latestDevServerProcess = useMemo(() => {
    return [...attemptData.processes]
      .filter((process) => process.run_reason === 'devserver')
      .sort(
        (a, b) =>
          new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
      )[0];
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

  const handleViewDevServerLogs = () => {
    if (latestDevServerProcess) {
      jumpToProcess(latestDevServerProcess.id);
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
      setError(null); // Clear any previous errors on success
      setPushSuccess(true);
      setTimeout(() => setPushSuccess(false), 2000);
      fetchAttemptData(selectedAttempt.id);
    } catch (error: any) {
      console.error('Failed to push changes:', error);
      setError(error.message || 'Failed to push changes');
    } finally {
      setPushing(false);
    }
  };

  const performMerge = async () => {
    if (!projectId || !selectedAttempt?.id || !selectedAttempt?.task_id) return;

    try {
      setMerging(true);
      await attemptsApi.merge(selectedAttempt.id);
      setError(null); // Clear any previous errors on success
      setMergeSuccess(true);
      setTimeout(() => setMergeSuccess(false), 2000);
      fetchAttemptData(selectedAttempt.id);
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
      setError(null); // Clear any previous errors on success
      fetchAttemptData(selectedAttempt.id);
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

  const handlePRButtonClick = async () => {
    if (!projectId || !selectedAttempt?.id || !selectedAttempt?.task_id) return;

    // If PR already exists, push to it
    if (mergeInfo.hasOpenPR) {
      await handlePushClick();
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
    <div className="space-y-2">
      <div className="flex gap-6 items-start">
        <div className="min-w-0">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
<<<<<<< HEAD
            Profile
=======
            {t('createAttempt.started')}
>>>>>>> 6ddf031 (feat(i18n): add internationalization support with Traditional Chinese translation)
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

<<<<<<< HEAD
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
            <span className="truncate">Base Branch</span>
=======
        <div>
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
            {t('createAttempt.agent')}
          </div>
          <div className="text-sm font-medium">
            {availableExecutors.find((e) => e.id === selectedAttempt.executor)
              ?.name ||
              selectedAttempt.executor ||
              'Unknown'}
          </div>
        </div>

        <div>
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
            <span>{t('createAttempt.baseBranch')}</span>
>>>>>>> 6ddf031 (feat(i18n): add internationalization support with Traditional Chinese translation)
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
                  <p>{t('createAttempt.changeBaseBranch')}</p>
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
<<<<<<< HEAD
            Status
=======
            {isPlanTask ? t('createAttempt.planStatus') : t('createAttempt.mergeStatus')}
>>>>>>> 6ddf031 (feat(i18n): add internationalization support with Traditional Chinese translation)
          </div>
          <div className="flex items-center gap-1.5">
            {(() => {
              const statusInfo = getStatusInfo();
              return (
                <div className="flex items-center gap-1.5">
<<<<<<< HEAD
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
=======
                  <div className="h-2 w-2 bg-green-500 rounded-full" />
                  <span className="text-sm font-medium text-green-700">
                    {t('createAttempt.taskCreated')}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <div className="h-2 w-2 bg-gray-500 rounded-full" />
                  <span className="text-sm font-medium text-gray-700">
                    {t('createAttempt.draft')}
                  </span>
                </div>
              )
            ) : // Merge status for regular tasks
            selectedAttempt.merge_commit ? (
              <div className="flex items-center gap-1.5">
                <div className="h-2 w-2 bg-green-500 rounded-full" />
                <span className="text-sm font-medium text-green-700">
                  {t('createAttempt.merged')}
                </span>
                <span className="text-xs font-mono text-muted-foreground">
                  ({selectedAttempt.merge_commit.slice(0, 8)})
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <div className="h-2 w-2 bg-yellow-500 rounded-full" />
                <span className="text-sm font-medium text-yellow-700">
                  {t('createAttempt.notMerged')}
                </span>
              </div>
            )}
>>>>>>> 6ddf031 (feat(i18n): add internationalization support with Traditional Chinese translation)
          </div>
        </div>
      </div>

      <div className="col-span-4">
        <div className="flex items-center gap-1.5 mb-1">
<<<<<<< HEAD
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1 pt-1">
            Path
=======
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
            {t('createAttempt.worktreePath')}
>>>>>>> 6ddf031 (feat(i18n): add internationalization support with Traditional Chinese translation)
          </div>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => handleOpenInEditor()}
            className="h-6 px-2 text-xs hover:bg-muted gap-1"
          >
            <ExternalLink className="h-3 w-3" />
            {t('createAttempt.openInEditor', { editor: editorDisplayName })}
          </Button>
        </div>
        <div
          className={`text-xs font-mono px-2 py-1 rounded break-all cursor-pointer transition-all duration-300 flex items-center gap-2 ${
            copied
              ? 'bg-green-100 text-green-800 border border-green-300'
              : 'text-muted-foreground bg-muted hover:bg-muted/80'
          }`}
          onClick={handleCopyWorktreePath}
          title={copied ? t('createAttempt.copied') : t('createAttempt.clickToCopyPath')}
        >
          <span
            className={`truncate ${copied ? 'text-green-800' : ''}`}
            dir="rtl"
          >
            {selectedAttempt.container_ref}
          </span>
          {copied && (
<<<<<<< HEAD
            <span className="text-green-700 font-medium whitespace-nowrap">
              Copied!
            </span>
=======
            <span className="text-green-700 font-medium">{t('createAttempt.copied')}</span>
>>>>>>> 6ddf031 (feat(i18n): add internationalization support with Traditional Chinese translation)
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
                        {t('createAttempt.stopDev')}
                      </>
                    ) : (
                      <>
                        <Play className="h-3 w-3" />
<<<<<<< HEAD
                        Dev
=======
                        {t('createAttempt.devServer')}
>>>>>>> 6ddf031 (feat(i18n): add internationalization support with Traditional Chinese translation)
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
                    {t('createAttempt.addDevScriptToEnable')}
                  </p>
                ) : runningDevServer && devServerDetails ? (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">
                      {t('createAttempt.devServerLogs')}
                    </p>
                    <pre className="text-xs bg-muted p-2 rounded max-h-64 overflow-y-auto whitespace-pre-wrap">
                      {processedDevServerLogs}
                    </pre>
                  </div>
                ) : runningDevServer ? (
                  <p>{t('createAttempt.stopRunningDevServer')}</p>
                ) : (
                  <p>{t('createAttempt.startDevServer')}</p>
                )}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

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

        <div className="flex items-center gap-2 flex-wrap">
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
<<<<<<< HEAD
=======
                        {t('createAttempt.history')}
>>>>>>> 6ddf031 (feat(i18n): add internationalization support with Traditional Chinese translation)
                      </Button>
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{t('createAttempt.viewAttemptHistory')}</p>
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
<<<<<<< HEAD
=======

          {/* Git Operations */}
          {selectedAttempt && branchStatus && (
            <>
              {branchStatus.is_behind &&
                !branchStatus.merged &&
                !isPlanTask && (
                  <Button
                    onClick={handleRebaseClick}
                    disabled={
                      rebasing || branchStatusLoading || isAttemptRunning
                    }
                    variant="outline"
                    size="sm"
                    className="border-orange-300 text-orange-700 hover:bg-orange-50 gap-1"
                  >
                    <RefreshCw
                      className={`h-3 w-3 ${rebasing ? 'animate-spin' : ''}`}
                    />
                    {rebasing ? t('createAttempt.rebasing') : t('createAttempt.rebase')}
                  </Button>
                )}
              {isPlanTask ? (
                // Plan tasks: show approval button
                <Button
                  onClick={handlePlanApproval}
                  disabled={
                    isAttemptRunning ||
                    executionState?.execution_state === 'CodingAgentFailed' ||
                    executionState?.execution_state === 'SetupFailed' ||
                    (isPlanningMode && !canCreateTask)
                  }
                  size="sm"
                  className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 gap-1"
                >
                  <GitBranchIcon className="h-3 w-3" />
                  {isApprovingPlan ? t('createAttempt.approving') : t('createAttempt.createTask')}
                </Button>
              ) : (
                // Normal merge and PR buttons for regular tasks
                !branchStatus.merged && (
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
                        ? t('createAttempt.openPR')
                        : creatingPR
                          ? t('createAttempt.creating')
                          : t('createAttempt.createPR')}
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
                      {merging ? t('createAttempt.merging') : t('createAttempt.merge')}
                    </Button>
                  </>
                )
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
              {isStopping ? t('createAttempt.stopping') : t('createAttempt.stopAttempt')}
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={handleEnterCreateAttemptMode}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              {t('createAttempt.newAttempt')}
            </Button>
          )}
>>>>>>> 6ddf031 (feat(i18n): add internationalization support with Traditional Chinese translation)
        </div>
      </div>

      {/* Rebase Dialog */}
      <Dialog open={showRebaseDialog} onOpenChange={setShowRebaseDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('createAttempt.rebaseTaskAttempt')}</DialogTitle>
            <DialogDescription>
              {t('createAttempt.chooseNewBaseBranch')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="base-branch" className="text-sm font-medium">
                {t('createAttempt.baseBranch')}
              </label>
              <BranchSelector
                branches={branches}
                selectedBranch={selectedRebaseBranch}
                onBranchSelect={setSelectedRebaseBranch}
                placeholder={t('createAttempt.selectBaseBranch')}
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
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleRebaseDialogConfirm}
              disabled={rebasing || !selectedRebaseBranch}
            >
              {rebasing ? t('createAttempt.rebasing') : t('createAttempt.rebase')}
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
            <DialogTitle>{t('createAttempt.stopCurrentAttempt')}</DialogTitle>
            <DialogDescription>
              {t('createAttempt.confirmStopExecution')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowStopConfirmation(false)}
              disabled={isStopping}
            >
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                setShowStopConfirmation(false);
                await stopAllExecutions();
              }}
              disabled={isStopping}
            >
              {isStopping ? t('createAttempt.stopping') : t('createAttempt.stop')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default CurrentAttempt;

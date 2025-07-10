import { useEffect, useRef, useCallback, useState } from 'react';
import { TaskDetailsHeader } from './TaskDetailsHeader';
import { TaskDetailsToolbar } from './TaskDetailsToolbar';
import { NormalizedConversationViewer } from './NormalizedConversationViewer';
import { TaskFollowUpSection } from './TaskFollowUpSection';
import { EditorSelectionDialog } from './EditorSelectionDialog';
import { useTaskDetails } from '@/hooks/useTaskDetails';
import {
  getTaskPanelClasses,
  getBackdropClasses,
} from '@/lib/responsive-config';
import { makeRequest } from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  ChevronDown,
  ChevronUp,
  MessageSquare,
  GitCompare,
} from 'lucide-react';
import { DiffCard } from './DiffCard';
import type {
  TaskWithAttemptStatus,
  EditorType,
  Project,
  WorktreeDiff,
} from 'shared/types';

interface TaskDetailsPanelProps {
  task: TaskWithAttemptStatus | null;
  project: Project | null;
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
  onEditTask?: (task: TaskWithAttemptStatus) => void;
  onDeleteTask?: (taskId: string) => void;
  isDialogOpen?: boolean;
}

interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  message: string | null;
}

export function TaskDetailsPanel({
  task,
  project,
  projectId,
  isOpen,
  onClose,
  onEditTask,
  onDeleteTask,
  isDialogOpen = false,
}: TaskDetailsPanelProps) {
  const [showEditorDialog, setShowEditorDialog] = useState(false);
  const [shouldAutoScrollLogs, setShouldAutoScrollLogs] = useState(true);
  const [conversationUpdateTrigger, setConversationUpdateTrigger] = useState(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const setupScrollRef = useRef<HTMLDivElement>(null);

  // Tab and collapsible state
  const [activeTab, setActiveTab] = useState<'logs' | 'diffs'>('logs');
  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState(false);
  const [userSelectedTab, setUserSelectedTab] = useState<boolean>(false);

  // Diff-related state
  const [diff, setDiff] = useState<WorktreeDiff | null>(null);
  const [diffLoading, setDiffLoading] = useState(true);
  const [diffError, setDiffError] = useState<string | null>(null);
  const [isBackgroundRefreshing, setIsBackgroundRefreshing] = useState(false);
  const [deletingFiles, setDeletingFiles] = useState<Set<string>>(new Set());
  const [fileToDelete, setFileToDelete] = useState<string | null>(null);

  // Use the custom hook for all task details logic
  const {
    taskAttempts,
    selectedAttempt,
    attemptData,
    loading,
    selectedExecutor,
    isStopping,
    followUpMessage,
    isSendingFollowUp,
    followUpError,
    isStartingDevServer,
    devServerDetails,
    branches,
    selectedBranch,
    runningDevServer,
    isAttemptRunning,
    canSendFollowUp,
    processedDevServerLogs,
    executionState,
    setFollowUpMessage,
    setFollowUpError,
    setIsHoveringDevServer,
    handleAttemptChange,
    createNewAttempt,
    stopAllExecutions,
    startDevServer,
    stopDevServer,
    openInEditor,
    handleSendFollowUp,
  } = useTaskDetails(task, projectId, isOpen);

  // Use ref to track loading state to prevent dependency cycles
  const diffLoadingRef = useRef(false);

  // Reset to logs tab when task changes
  useEffect(() => {
    if (task) {
      setActiveTab('logs');
      setUserSelectedTab(true); // Treat this as a user selection to prevent auto-switching
    }
  }, [task?.id]);

  // Fetch diff when attempt changes
  const fetchDiff = useCallback(
    async (isBackgroundRefresh = false) => {
      if (!projectId || !selectedAttempt?.id || !selectedAttempt?.task_id) {
        setDiff(null);
        setDiffLoading(false);
        return;
      }

      // Prevent multiple concurrent requests
      if (diffLoadingRef.current) {
        return;
      }

      try {
        diffLoadingRef.current = true;
        if (isBackgroundRefresh) {
          setIsBackgroundRefreshing(true);
        } else {
          setDiffLoading(true);
        }
        setDiffError(null);
        const response = await makeRequest(
          `/api/projects/${projectId}/tasks/${selectedAttempt.task_id}/attempts/${selectedAttempt.id}/diff`
        );

        if (response.ok) {
          const result: ApiResponse<WorktreeDiff> = await response.json();
          if (result.success && result.data) {
            setDiff(result.data);
          } else {
            setDiffError('Failed to load diff');
          }
        } else {
          setDiffError('Failed to load diff');
        }
      } catch (err) {
        setDiffError('Failed to load diff');
      } finally {
        diffLoadingRef.current = false;
        if (isBackgroundRefresh) {
          setIsBackgroundRefreshing(false);
        } else {
          setDiffLoading(false);
        }
      }
    },
    [projectId, selectedAttempt?.id, selectedAttempt?.task_id]
  );

  useEffect(() => {
    if (isOpen) {
      fetchDiff();
    }
  }, [isOpen, fetchDiff]);

  // Refresh diff when coding agent is running and making changes
  useEffect(() => {
    if (!executionState || !isOpen || !selectedAttempt) return;

    const isCodingAgentRunning =
      executionState.execution_state === 'CodingAgentRunning';

    if (isCodingAgentRunning) {
      // Immediately refresh diff when coding agent starts running
      fetchDiff(true);

      // Then refresh diff every 2 seconds while coding agent is active
      const interval = setInterval(() => {
        fetchDiff(true);
      }, 2000);

      return () => {
        clearInterval(interval);
      };
    }
  }, [executionState, isOpen, selectedAttempt, fetchDiff]);

  // Refresh diff when coding agent completes or changes state
  useEffect(() => {
    if (!executionState || !isOpen || !selectedAttempt) return;

    const isCodingAgentComplete =
      executionState.execution_state === 'CodingAgentComplete';
    const isCodingAgentFailed =
      executionState.execution_state === 'CodingAgentFailed';
    const isComplete = executionState.execution_state === 'Complete';
    const hasChanges = executionState.has_changes;

    // Fetch diff when coding agent completes, fails, or task is complete and has changes
    if (
      (isCodingAgentComplete || isCodingAgentFailed || isComplete) &&
      hasChanges
    ) {
      fetchDiff();
      // Auto-switch to diffs tab when changes are detected, but only if user hasn't manually selected a tab
      if (activeTab === 'logs' && !userSelectedTab) {
        setActiveTab('diffs');
      }
    }
  }, [
    executionState?.execution_state,
    executionState?.has_changes,
    isOpen,
    selectedAttempt,
    fetchDiff,
    activeTab,
    userSelectedTab,
  ]);

  // Handle ESC key locally to prevent global navigation
  useEffect(() => {
    if (!isOpen || isDialogOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, onClose, isDialogOpen]);

  // Callback to trigger auto-scroll when conversation updates
  const handleConversationUpdate = useCallback(() => {
    setConversationUpdateTrigger((prev) => prev + 1);
  }, []);

  // Auto-scroll to bottom when activities, execution processes, or conversation changes (for logs section)
  useEffect(() => {
    if (
      shouldAutoScrollLogs &&
      scrollContainerRef.current &&
      activeTab === 'logs'
    ) {
      scrollContainerRef.current.scrollTop =
        scrollContainerRef.current.scrollHeight;
    }
  }, [
    attemptData.activities,
    attemptData.processes,
    conversationUpdateTrigger,
    shouldAutoScrollLogs,
    activeTab,
  ]);

  // Auto-scroll setup script logs to bottom
  useEffect(() => {
    if (setupScrollRef.current) {
      setupScrollRef.current.scrollTop = setupScrollRef.current.scrollHeight;
    }
  }, [attemptData.runningProcessDetails]);

  // Handle scroll events to detect manual scrolling (for logs section)
  const handleLogsScroll = useCallback(() => {
    if (scrollContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } =
        scrollContainerRef.current;
      const isAtBottom = scrollTop + clientHeight >= scrollHeight - 5;

      if (isAtBottom && !shouldAutoScrollLogs) {
        setShouldAutoScrollLogs(true);
      } else if (!isAtBottom && shouldAutoScrollLogs) {
        setShouldAutoScrollLogs(false);
      }
    }
  }, [shouldAutoScrollLogs]);

  const handleOpenInEditor = async (editorType?: EditorType) => {
    try {
      await openInEditor(editorType);
    } catch (err) {
      if (!editorType) {
        setShowEditorDialog(true);
      }
    }
  };

  const handleDeleteFileClick = (filePath: string) => {
    setFileToDelete(filePath);
  };

  const handleConfirmDelete = async () => {
    if (!fileToDelete || !projectId || !task?.id || !selectedAttempt?.id)
      return;

    try {
      setDeletingFiles((prev) => new Set(prev).add(fileToDelete));
      const response = await makeRequest(
        `/api/projects/${projectId}/tasks/${selectedAttempt.task_id}/attempts/${selectedAttempt.id}/delete-file?file_path=${encodeURIComponent(
          fileToDelete
        )}`,
        {
          method: 'POST',
        }
      );

      if (response.ok) {
        const result: ApiResponse<null> = await response.json();
        if (result.success) {
          fetchDiff();
        } else {
          setDiffError(result.message || 'Failed to delete file');
        }
      } else {
        setDiffError('Failed to delete file');
      }
    } catch (err) {
      setDiffError('Failed to delete file');
    } finally {
      setDeletingFiles((prev) => {
        const newSet = new Set(prev);
        newSet.delete(fileToDelete);
        return newSet;
      });
      setFileToDelete(null);
    }
  };

  const handleCancelDelete = () => {
    setFileToDelete(null);
  };

  // Render tab content based on active tab
  const renderTabContent = (): JSX.Element => {
    console.log('renderTabContent called with activeTab:', activeTab);
    if (activeTab === 'diffs') {
      return renderDiffsContent();
    }
    return renderLogsContent();
  };

  // Render diffs content
  const renderDiffsContent = (): JSX.Element => {
    if (diffLoading) {
      return (
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-foreground mx-auto mb-4"></div>
          <p className="text-muted-foreground ml-4">Loading changes...</p>
        </div>
      );
    }

    if (diffError) {
      return (
        <div className="text-center py-8 text-destructive">
          <p>{diffError}</p>
        </div>
      );
    }

    return (
      <div className="h-full px-4 pb-4">
        <DiffCard
          diff={diff}
          isBackgroundRefreshing={isBackgroundRefreshing}
          onDeleteFile={handleDeleteFileClick}
          deletingFiles={deletingFiles}
          compact={false}
          className="h-full"
        />
      </div>
    );
  };

  // Render logs content
  const renderLogsContent = (): JSX.Element => {
    // Debug logging to help identify the issue
    console.log('renderLogsContent called with state:', {
      loading,
      selectedAttempt: selectedAttempt?.id,
      executionState: executionState?.execution_state,
      activeTab,
    });

    // Show loading spinner only when we're actually loading data
    if (loading) {
      return (
        <div className="flex items-center justify-center h-full">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-foreground mx-auto mb-4"></div>
          <p className="text-muted-foreground ml-4">Loading...</p>
        </div>
      );
    }

    // If no attempt is selected, show message
    if (!selectedAttempt) {
      return (
        <div className="text-center py-8 text-muted-foreground">
          <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p className="text-lg font-medium mb-2">No attempt selected</p>
          <p className="text-sm">Select an attempt to view its logs</p>
        </div>
      );
    }

    // If no execution state, execution hasn't started yet
    if (!executionState) {
      return (
        <div className="text-center py-8 text-muted-foreground">
          <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p className="text-lg font-medium mb-2">
            Task execution not started yet
          </p>
          <p className="text-sm">
            Logs will appear here once the task execution begins
          </p>
        </div>
      );
    }

    const isSetupRunning = executionState.execution_state === 'SetupRunning';
    const isSetupComplete = executionState.execution_state === 'SetupComplete';
    const isSetupFailed = executionState.execution_state === 'SetupFailed';
    const isCodingAgentRunning =
      executionState.execution_state === 'CodingAgentRunning';
    const isCodingAgentComplete =
      executionState.execution_state === 'CodingAgentComplete';
    const isCodingAgentFailed =
      executionState.execution_state === 'CodingAgentFailed';
    const isComplete = executionState.execution_state === 'Complete';
    const hasChanges = executionState.has_changes;

    // When setup script is running, show setup execution stdio
    if (isSetupRunning) {
      // Find the setup script process in runningProcessDetails first, then fallback to processes
      const setupProcess = executionState.setup_process_id
        ? attemptData.runningProcessDetails[executionState.setup_process_id]
        : Object.values(attemptData.runningProcessDetails).find(
            (process) => process.process_type === 'setupscript'
          );

      return (
        <div ref={setupScrollRef} className="h-full overflow-y-auto">
          <div className="mb-4">
            <p className="text-lg font-semibold mb-2">Setup Script Running</p>
            <p className="text-muted-foreground mb-4">
              Preparing the environment for the coding agent...
            </p>
          </div>

          {setupProcess && (
            <div className="font-mono text-sm whitespace-pre-wrap text-muted-foreground">
              {(() => {
                const stdout = setupProcess.stdout || '';
                const stderr = setupProcess.stderr || '';
                const combined = [stdout, stderr].filter(Boolean).join('\n');
                return combined || 'Waiting for setup script output...';
              })()}
            </div>
          )}
        </div>
      );
    }

    // When setup failed, show error message and conversation
    if (isSetupFailed) {
      const setupProcess = executionState.setup_process_id
        ? attemptData.runningProcessDetails[executionState.setup_process_id]
        : Object.values(attemptData.runningProcessDetails).find(
            (process) => process.process_type === 'setupscript'
          );

      return (
        <div className="h-full overflow-y-auto">
          <div className="mb-4">
            <p className="text-lg font-semibold mb-2 text-destructive">
              Setup Script Failed
            </p>
            <p className="text-muted-foreground mb-4">
              The setup script encountered an error. Error details below:
            </p>
          </div>

          {setupProcess && (
            <NormalizedConversationViewer
              executionProcess={setupProcess}
              projectId={projectId}
              onConversationUpdate={handleConversationUpdate}
            />
          )}
        </div>
      );
    }

    // When coding agent failed, show error message and conversation
    if (isCodingAgentFailed) {
      const codingAgentProcess = executionState.coding_agent_process_id
        ? attemptData.runningProcessDetails[
            executionState.coding_agent_process_id
          ]
        : Object.values(attemptData.runningProcessDetails).find(
            (process) => process.process_type === 'codingagent'
          );

      return (
        <div className="h-full overflow-y-auto">
          <div className="mb-4">
            <p className="text-lg font-semibold mb-2 text-destructive">
              Coding Agent Failed
            </p>
            <p className="text-muted-foreground mb-4">
              The coding agent encountered an error. Error details below:
            </p>
          </div>

          {codingAgentProcess && (
            <NormalizedConversationViewer
              executionProcess={codingAgentProcess}
              projectId={projectId}
              onConversationUpdate={handleConversationUpdate}
            />
          )}
        </div>
      );
    }

    // When setup is complete but coding agent hasn't started, show waiting state
    if (
      isSetupComplete &&
      !isCodingAgentRunning &&
      !isCodingAgentComplete &&
      !isCodingAgentFailed &&
      !hasChanges
    ) {
      return (
        <div className="text-center py-8 text-muted-foreground">
          <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p className="text-lg font-semibold mb-2">Setup Complete</p>
          <p>Waiting for coding agent to start...</p>
        </div>
      );
    }

    // When task is complete, show completion message
    if (isComplete) {
      return (
        <div className="text-center py-8 text-green-600">
          <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p className="text-lg font-semibold mb-2">Task Complete</p>
          <p className="text-muted-foreground">
            The task has been completed successfully.
          </p>
        </div>
      );
    }

    // When coding agent is running or complete, show conversation
    if (isCodingAgentRunning || isCodingAgentComplete || hasChanges) {
      return (
        <div
          ref={scrollContainerRef}
          onScroll={handleLogsScroll}
          className="h-full overflow-y-auto"
        >
          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-foreground mx-auto mb-4"></div>
              <p className="text-muted-foreground">Loading...</p>
            </div>
          ) : (
            (() => {
              // Find main coding agent process (command: "executor")
              let mainCodingAgentProcess = Object.values(
                attemptData.runningProcessDetails
              ).find(
                (process) =>
                  process.process_type === 'codingagent' &&
                  process.command === 'executor'
              );

              if (!mainCodingAgentProcess) {
                const mainCodingAgentSummary = attemptData.processes.find(
                  (process) =>
                    process.process_type === 'codingagent' &&
                    process.command === 'executor'
                );

                if (mainCodingAgentSummary) {
                  mainCodingAgentProcess = Object.values(
                    attemptData.runningProcessDetails
                  ).find((process) => process.id === mainCodingAgentSummary.id);

                  if (!mainCodingAgentProcess) {
                    mainCodingAgentProcess = {
                      ...mainCodingAgentSummary,
                      stdout: null,
                      stderr: null,
                    } as any;
                  }
                }
              }

              // Find follow up executor processes (command: "followup_executor")
              const followUpProcesses = attemptData.processes
                .filter(
                  (process) =>
                    process.process_type === 'codingagent' &&
                    process.command === 'followup_executor'
                )
                .map((summary) => {
                  const detailedProcess = Object.values(
                    attemptData.runningProcessDetails
                  ).find((process) => process.id === summary.id);
                  return (
                    detailedProcess ||
                    ({
                      ...summary,
                      stdout: null,
                      stderr: null,
                    } as any)
                  );
                });

              if (mainCodingAgentProcess || followUpProcesses.length > 0) {
                return (
                  <div className="space-y-8">
                    {mainCodingAgentProcess && (
                      <div className="space-y-6">
                        <NormalizedConversationViewer
                          executionProcess={mainCodingAgentProcess}
                          projectId={projectId}
                          onConversationUpdate={handleConversationUpdate}
                          diff={diff}
                          isBackgroundRefreshing={isBackgroundRefreshing}
                          onDeleteFile={handleDeleteFileClick}
                          deletingFiles={deletingFiles}
                        />
                      </div>
                    )}
                    {followUpProcesses.map((followUpProcess) => (
                      <div key={followUpProcess.id}>
                        <div className="border-t border-border mb-8"></div>
                        <NormalizedConversationViewer
                          executionProcess={followUpProcess}
                          projectId={projectId}
                          onConversationUpdate={handleConversationUpdate}
                          diff={diff}
                          isBackgroundRefreshing={isBackgroundRefreshing}
                          onDeleteFile={handleDeleteFileClick}
                          deletingFiles={deletingFiles}
                        />
                      </div>
                    ))}
                  </div>
                );
              }

              return (
                <div className="text-center py-8 text-muted-foreground">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
                  <p className="text-lg font-semibold mb-2">
                    Coding Agent Starting
                  </p>
                  <p>Initializing conversation...</p>
                </div>
              );
            })()
          )}
        </div>
      );
    }

    // Default case - unexpected state
    return (
      <div className="text-center py-8 text-muted-foreground">
        <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p>Unknown execution state</p>
      </div>
    );
  };

  if (!task) return null;

  return (
    <>
      {isOpen && (
        <>
          {/* Backdrop - only on smaller screens (overlay mode) */}
          <div className={getBackdropClasses()} onClick={onClose} />

          {/* Panel */}
          <div className={getTaskPanelClasses()}>
            <div className="flex flex-col h-full">
              {/* Header */}
              <TaskDetailsHeader
                task={task}
                onClose={onClose}
                onEditTask={onEditTask}
                onDeleteTask={onDeleteTask}
              />

              {/* Collapsible Toolbar */}
              <div className="border-b">
                <div className="px-4 pb-2 flex items-center justify-between">
                  <h3 className="text-sm font-medium text-muted-foreground">
                    Task Details
                  </h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsHeaderCollapsed(!isHeaderCollapsed)}
                    className="h-6 w-6 p-0"
                  >
                    {isHeaderCollapsed ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronUp className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                {!isHeaderCollapsed && (
                  <TaskDetailsToolbar
                    task={task}
                    project={project}
                    projectId={projectId}
                    selectedAttempt={selectedAttempt}
                    taskAttempts={taskAttempts}
                    isAttemptRunning={isAttemptRunning}
                    isStopping={isStopping}
                    selectedExecutor={selectedExecutor}
                    runningDevServer={runningDevServer}
                    isStartingDevServer={isStartingDevServer}
                    devServerDetails={devServerDetails}
                    processedDevServerLogs={processedDevServerLogs}
                    branches={branches}
                    selectedBranch={selectedBranch}
                    onAttemptChange={handleAttemptChange}
                    onCreateNewAttempt={createNewAttempt}
                    onStopAllExecutions={stopAllExecutions}
                    onStartDevServer={startDevServer}
                    onStopDevServer={stopDevServer}
                    onOpenInEditor={handleOpenInEditor}
                    onSetIsHoveringDevServer={setIsHoveringDevServer}
                  />
                )}
              </div>

              {/* Tab Navigation */}
              <div className="border-b bg-muted/30">
                <div className="flex px-4">
                  <button
                    onClick={() => {
                      console.log(
                        'Logs tab clicked - setting activeTab to logs'
                      );
                      setActiveTab('logs');
                      setUserSelectedTab(true);
                    }}
                    className={`flex items-center px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === 'logs'
                        ? 'border-primary text-primary bg-background'
                        : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50'
                    }`}
                  >
                    <MessageSquare className="h-4 w-4 mr-2" />
                    Logs
                  </button>
                  <button
                    onClick={() => {
                      console.log(
                        'Diffs tab clicked - setting activeTab to diffs'
                      );
                      setActiveTab('diffs');
                      setUserSelectedTab(true);
                    }}
                    className={`flex items-center px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === 'diffs'
                        ? 'border-primary text-primary bg-background'
                        : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50'
                    }`}
                  >
                    <GitCompare className="h-4 w-4 mr-2" />
                    Diffs
                    {diff && diff.files.length > 0 && (
                      <span className="ml-2 px-1.5 py-0.5 text-xs bg-primary/10 text-primary rounded-full">
                        {diff.files.length}
                      </span>
                    )}
                  </button>
                </div>
              </div>

              {/* Tab Content */}
              <div
                className={`flex-1 flex flex-col min-h-0 ${activeTab === 'logs' ? 'p-4' : 'pt-4'}`}
              >
                {renderTabContent()}
              </div>

              {/* Footer - Follow-up section */}
              {selectedAttempt && (
                <TaskFollowUpSection
                  followUpMessage={followUpMessage}
                  setFollowUpMessage={setFollowUpMessage}
                  isSendingFollowUp={isSendingFollowUp}
                  followUpError={followUpError}
                  setFollowUpError={setFollowUpError}
                  canSendFollowUp={canSendFollowUp}
                  projectId={projectId}
                  onSendFollowUp={handleSendFollowUp}
                />
              )}
            </div>
          </div>

          {/* Editor Selection Dialog */}
          <EditorSelectionDialog
            isOpen={showEditorDialog}
            onClose={() => setShowEditorDialog(false)}
            onSelectEditor={handleOpenInEditor}
          />

          {/* Delete File Confirmation Dialog */}
          <Dialog
            open={!!fileToDelete}
            onOpenChange={() => handleCancelDelete()}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete File</DialogTitle>
                <DialogDescription>
                  Are you sure you want to delete the file{' '}
                  <span className="font-mono font-medium">
                    "{fileToDelete}"
                  </span>
                  ?
                </DialogDescription>
              </DialogHeader>
              <div className="py-4">
                <div className="bg-red-50 border border-red-200 rounded-md p-3">
                  <p className="text-sm text-red-800">
                    <strong>Warning:</strong> This action will permanently
                    remove the entire file from the worktree. This cannot be
                    undone.
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={handleCancelDelete}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleConfirmDelete}
                  disabled={deletingFiles.has(fileToDelete || '')}
                >
                  {deletingFiles.has(fileToDelete || '')
                    ? 'Deleting...'
                    : 'Delete File'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </>
  );
}

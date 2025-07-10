import { useCallback, useEffect, useRef, useState } from 'react';
import { TaskDetailsHeader } from './TaskDetailsHeader';
import { TaskFollowUpSection } from './TaskFollowUpSection';
import { EditorSelectionDialog } from './EditorSelectionDialog';
import { useTaskDetails } from '@/hooks/useTaskDetails';
import {
  getBackdropClasses,
  getTaskPanelClasses,
} from '@/lib/responsive-config';
import { makeRequest } from '@/lib/api';
import type {
  EditorType,
  TaskWithAttemptStatus,
  WorktreeDiff,
} from 'shared/types';
import DiffTab from '@/components/tasks/TaskDetails/DiffTab.tsx';
import LogsTab from '@/components/tasks/TaskDetails/LogsTab.tsx';
import DeleteFileConfirmationDialog from '@/components/tasks/DeleteFileConfirmationDialog.tsx';
import TabNavigation from '@/components/tasks/TaskDetails/TabNavigation.tsx';
import CollapsibleToolbar from '@/components/tasks/TaskDetails/CollapsibleToolbar.tsx';

interface TaskDetailsPanelProps {
  task: TaskWithAttemptStatus | null;
  projectHasDevScript?: boolean;
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
  projectHasDevScript,
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

  return (
    <>
      {!task || !isOpen ? null : (
        <>
          {/* Backdrop - only on smaller screens (overlay mode) */}
          <div className={getBackdropClasses()} onClick={onClose} />

          {/* Panel */}
          <div className={getTaskPanelClasses()}>
            <div className="flex flex-col h-full">
              <TaskDetailsHeader
                task={task}
                onClose={onClose}
                onEditTask={onEditTask}
                onDeleteTask={onDeleteTask}
              />

              <CollapsibleToolbar
                task={task}
                taskAttempts={taskAttempts}
                projectId={projectId}
                projectHasDevScript={projectHasDevScript}
                selectedAttempt={selectedAttempt}
                selectedExecutor={selectedExecutor}
                isStopping={isStopping}
                isStartingDevServer={isStartingDevServer}
                runningDevServer={runningDevServer}
                isAttemptRunning={isAttemptRunning}
                startDevServer={startDevServer}
                stopDevServer={stopDevServer}
                stopAllExecutions={stopAllExecutions}
                devServerDetails={devServerDetails}
                branches={branches}
                selectedBranch={selectedBranch}
                processedDevServerLogs={processedDevServerLogs}
                setIsHoveringDevServer={setIsHoveringDevServer}
                handleAttemptChange={handleAttemptChange}
                createNewAttempt={createNewAttempt}
                handleOpenInEditor={handleOpenInEditor}
              />

              <TabNavigation
                activeTab={activeTab}
                setActiveTab={setActiveTab}
                diff={diff}
                setUserSelectedTab={setUserSelectedTab}
              />

              {/* Tab Content */}
              <div
                className={`flex-1 flex flex-col min-h-0 ${activeTab === 'logs' ? 'p-4' : 'pt-4'}`}
              >
                {activeTab === 'diffs' ? (
                  <DiffTab
                    diffLoading={diffLoading}
                    diffError={diffError}
                    diff={diff}
                    isBackgroundRefreshing={isBackgroundRefreshing}
                    handleDeleteFileClick={handleDeleteFileClick}
                    deletingFiles={deletingFiles}
                  />
                ) : (
                  <LogsTab
                    loading={loading}
                    diff={diff}
                    isBackgroundRefreshing={isBackgroundRefreshing}
                    deletingFiles={deletingFiles}
                    attemptData={attemptData}
                    selectedAttempt={selectedAttempt}
                    executionState={executionState}
                    handleDeleteFileClick={handleDeleteFileClick}
                    handleConversationUpdate={handleConversationUpdate}
                    projectId={projectId}
                    handleLogsScroll={handleLogsScroll}
                    scrollContainerRef={scrollContainerRef}
                    setupScrollRef={setupScrollRef}
                  />
                )}
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

          <EditorSelectionDialog
            isOpen={showEditorDialog}
            onClose={() => setShowEditorDialog(false)}
            onSelectEditor={handleOpenInEditor}
          />

          <DeleteFileConfirmationDialog
            deletingFiles={deletingFiles}
            fileToDelete={fileToDelete}
            handleConfirmDelete={handleConfirmDelete}
            handleCancelDelete={handleCancelDelete}
          />
        </>
      )}
    </>
  );
}

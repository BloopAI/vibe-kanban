import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TaskDetailsHeader } from './TaskDetailsHeader';
import { TaskFollowUpSection } from './TaskFollowUpSection';
import { EditorSelectionDialog } from './EditorSelectionDialog';
import {
  getBackdropClasses,
  getTaskPanelClasses,
} from '@/lib/responsive-config';
import { makeRequest } from '@/lib/api';
import type {
  EditorType,
  ExecutionProcess,
  ExecutionProcessSummary,
  GitBranch,
  TaskAttempt,
  TaskAttemptActivityWithPrompt,
  TaskAttemptState,
  TaskWithAttemptStatus,
  WorktreeDiff,
} from 'shared/types';
import DiffTab from '@/components/tasks/TaskDetails/DiffTab.tsx';
import LogsTab from '@/components/tasks/TaskDetails/LogsTab.tsx';
import DeleteFileConfirmationDialog from '@/components/tasks/DeleteFileConfirmationDialog.tsx';
import TabNavigation from '@/components/tasks/TaskDetails/TabNavigation.tsx';
import CollapsibleToolbar from '@/components/tasks/TaskDetails/CollapsibleToolbar.tsx';
import { useConfig } from '@/components/config-provider.tsx';

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

  const [isStopping, setIsStopping] = useState(false);

  // Use the custom hook for all task details logic
  const { config } = useConfig();
  const [taskAttempts, setTaskAttempts] = useState<TaskAttempt[]>([]);
  const [selectedAttempt, setSelectedAttempt] = useState<TaskAttempt | null>(
    null
  );
  const [attemptData, setAttemptData] = useState<{
    activities: TaskAttemptActivityWithPrompt[];
    processes: ExecutionProcessSummary[];
    runningProcessDetails: Record<string, ExecutionProcess>;
  }>({
    activities: [],
    processes: [],
    runningProcessDetails: {},
  });
  const [loading, setLoading] = useState(false);
  const [selectedExecutor, setSelectedExecutor] = useState<string>(
    config?.executor.type || 'claude'
  );
  const [devServerDetails, setDevServerDetails] =
    useState<ExecutionProcess | null>(null);
  const [isHoveringDevServer, setIsHoveringDevServer] = useState(false);
  const [branches, setBranches] = useState<GitBranch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
  const [executionState, setExecutionState] = useState<TaskAttemptState | null>(
    null
  );

  // Find running dev server in current project
  const runningDevServer = useMemo(() => {
    return attemptData.processes.find(
      (process) =>
        process.process_type === 'devserver' && process.status === 'running'
    );
  }, [attemptData.processes]);

  const processedDevServerLogs = useMemo(() => {
    if (!devServerDetails) return 'No output yet...';

    const stdout = devServerDetails.stdout || '';
    const stderr = devServerDetails.stderr || '';
    const allOutput = stdout + (stderr ? '\n' + stderr : '');
    const lines = allOutput.split('\n').filter((line) => line.trim());
    const lastLines = lines.slice(-10);
    return lastLines.length > 0 ? lastLines.join('\n') : 'No output yet...';
  }, [devServerDetails]);

  // Define callbacks first
  const fetchAttemptData = useCallback(
    async (attemptId: string) => {
      if (!task) return;

      // Find the attempt to get the task_id
      const attempt = taskAttempts.find((a) => a.id === attemptId);
      const taskId = attempt?.task_id || task.id;

      try {
        const [activitiesResponse, processesResponse] = await Promise.all([
          makeRequest(
            `/api/projects/${projectId}/tasks/${taskId}/attempts/${attemptId}/activities`
          ),
          makeRequest(
            `/api/projects/${projectId}/tasks/${taskId}/attempts/${attemptId}/execution-processes`
          ),
        ]);

        if (activitiesResponse.ok && processesResponse.ok) {
          const activitiesResult: ApiResponse<TaskAttemptActivityWithPrompt[]> =
            await activitiesResponse.json();
          const processesResult: ApiResponse<ExecutionProcessSummary[]> =
            await processesResponse.json();

          if (
            activitiesResult.success &&
            processesResult.success &&
            activitiesResult.data &&
            processesResult.data
          ) {
            const runningActivities = activitiesResult.data.filter(
              (activity) =>
                activity.status === 'setuprunning' ||
                activity.status === 'executorrunning'
            );

            const runningProcessDetails: Record<string, ExecutionProcess> = {};

            // Fetch details for running activities
            for (const activity of runningActivities) {
              try {
                const detailResponse = await makeRequest(
                  `/api/projects/${projectId}/execution-processes/${activity.execution_process_id}`
                );
                if (detailResponse.ok) {
                  const detailResult: ApiResponse<ExecutionProcess> =
                    await detailResponse.json();
                  if (detailResult.success && detailResult.data) {
                    runningProcessDetails[activity.execution_process_id] =
                      detailResult.data;
                  }
                }
              } catch (err) {
                console.error(
                  `Failed to fetch execution process ${activity.execution_process_id}:`,
                  err
                );
              }
            }

            // Also fetch setup script process details if it exists in the processes
            const setupProcess = processesResult.data.find(
              (process) => process.process_type === 'setupscript'
            );
            if (setupProcess && !runningProcessDetails[setupProcess.id]) {
              try {
                const detailResponse = await makeRequest(
                  `/api/projects/${projectId}/execution-processes/${setupProcess.id}`
                );
                if (detailResponse.ok) {
                  const detailResult: ApiResponse<ExecutionProcess> =
                    await detailResponse.json();
                  if (detailResult.success && detailResult.data) {
                    runningProcessDetails[setupProcess.id] = detailResult.data;
                  }
                }
              } catch (err) {
                console.error(
                  `Failed to fetch setup process details ${setupProcess.id}:`,
                  err
                );
              }
            }

            setAttemptData({
              activities: activitiesResult.data,
              processes: processesResult.data,
              runningProcessDetails,
            });
          }
        }
      } catch (err) {
        console.error('Failed to fetch attempt data:', err);
      }
    },
    [task, projectId]
  );

  const fetchExecutionState = useCallback(
    async (attemptId: string) => {
      if (!task) return;

      // Find the attempt to get the task_id
      const attempt = taskAttempts.find((a) => a.id === attemptId);
      const taskId = attempt?.task_id || task.id;

      try {
        const response = await makeRequest(
          `/api/projects/${projectId}/tasks/${taskId}/attempts/${attemptId}`
        );

        if (response.ok) {
          const result: ApiResponse<TaskAttemptState> = await response.json();
          if (result.success && result.data) {
            setExecutionState(result.data);
          }
        }
      } catch (err) {
        console.error('Failed to fetch execution state:', err);
      }
    },
    [task, projectId]
  );

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
            fetchAttemptData(latestAttempt.id);
            fetchExecutionState(latestAttempt.id);
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

  // Fetch dev server details when hovering
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

  // Fetch project branches
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

  // Set default executor from config
  useEffect(() => {
    if (config && config.executor.type !== selectedExecutor) {
      setSelectedExecutor(config.executor.type);
    }
  }, [config, selectedExecutor]);

  useEffect(() => {
    if (task && isOpen) {
      fetchTaskAttempts();
      fetchProjectBranches();
    }
  }, [task, isOpen, fetchTaskAttempts, fetchProjectBranches]);

  // Load attempt data when selectedAttempt changes
  useEffect(() => {
    if (selectedAttempt && task) {
      fetchAttemptData(selectedAttempt.id);
      fetchExecutionState(selectedAttempt.id);
    }
  }, [selectedAttempt, task, fetchAttemptData, fetchExecutionState]);

  // Polling for updates when attempt is running

  // Poll dev server details while hovering
  useEffect(() => {
    if (!isHoveringDevServer || !runningDevServer) {
      setDevServerDetails(null);
      return;
    }

    fetchDevServerDetails();
    const interval = setInterval(fetchDevServerDetails, 2000);
    return () => clearInterval(interval);
  }, [isHoveringDevServer, runningDevServer, fetchDevServerDetails]);

  const handleAttemptChange = (attemptId: string) => {
    const attempt = taskAttempts.find((a) => a.id === attemptId);
    if (attempt) {
      setSelectedAttempt(attempt);
      fetchAttemptData(attempt.id);
      fetchExecutionState(attempt.id);
    }
  };

  const isAttemptRunning = useMemo(() => {
    if (!selectedAttempt || isStopping) {
      return false;
    }

    return attemptData.processes.some(
      (process) =>
        (process.process_type === 'codingagent' ||
          process.process_type === 'setupscript') &&
        process.status === 'running'
    );
  }, [selectedAttempt, attemptData.processes, isStopping]);

  useEffect(() => {
    if (!isAttemptRunning || !task) return;

    const interval = setInterval(() => {
      if (selectedAttempt) {
        fetchAttemptData(selectedAttempt.id);
        fetchExecutionState(selectedAttempt.id);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [
    isAttemptRunning,
    task,
    selectedAttempt,
    fetchAttemptData,
    fetchExecutionState,
  ]);

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
    if (!task || !selectedAttempt) return;

    try {
      const response = await makeRequest(
        `/api/projects/${projectId}/tasks/${selectedAttempt.task_id}/attempts/${selectedAttempt.id}/open-editor`,
        {
          method: 'POST',
          body: JSON.stringify(editorType ? { editor_type: editorType } : null),
        }
      );

      if (!response.ok) {
        if (!editorType) {
          setShowEditorDialog(true);
        }
      }
    } catch (err) {
      console.error('Failed to open editor:', err);
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
        await fetchAttemptData(selectedAttempt.id);
        setTimeout(() => {
          fetchAttemptData(selectedAttempt.id);
        }, 1000);
      }
    } catch (err) {
      console.error('Failed to stop executions:', err);
    } finally {
      setIsStopping(false);
    }
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
                runningDevServer={runningDevServer}
                isAttemptRunning={isAttemptRunning}
                devServerDetails={devServerDetails}
                branches={branches}
                selectedBranch={selectedBranch}
                processedDevServerLogs={processedDevServerLogs}
                setIsHoveringDevServer={setIsHoveringDevServer}
                handleAttemptChange={handleAttemptChange}
                fetchTaskAttempts={fetchTaskAttempts}
                handleOpenInEditor={handleOpenInEditor}
                fetchAttemptData={fetchAttemptData}
                isStopping={isStopping}
                stopAllExecutions={stopAllExecutions}
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
                  attemptData={attemptData}
                  projectId={projectId}
                  task={task}
                  selectedAttempt={selectedAttempt}
                  isAttemptRunning={isAttemptRunning}
                  fetchAttemptData={fetchAttemptData}
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

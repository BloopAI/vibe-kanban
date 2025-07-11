import {
  Dispatch,
  FC,
  ReactNode,
  SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type {
  ApiResponse,
  AttemptData,
  EditorType,
  ExecutionProcess,
  ExecutionProcessSummary,
  TaskAttempt,
  TaskAttemptActivityWithPrompt,
  TaskAttemptState,
  TaskWithAttemptStatus,
  WorktreeDiff,
} from 'shared/types.ts';
import { makeRequest } from '@/lib/api.ts';
import { TaskDetailsContext } from './taskDetailsContext.ts';

const TaskDetailsProvider: FC<{
  task: TaskWithAttemptStatus;
  projectId: string;
  children: ReactNode;
  activeTab: 'logs' | 'diffs';
  setActiveTab: Dispatch<SetStateAction<'logs' | 'diffs'>>;
  setShowEditorDialog: Dispatch<SetStateAction<boolean>>;
  isOpen: boolean;
  userSelectedTab: boolean;
}> = ({
  task,
  projectId,
  children,
  activeTab,
  setActiveTab,
  setShowEditorDialog,
  isOpen,
  userSelectedTab,
}) => {
  const [loading, setLoading] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [selectedAttempt, setSelectedAttempt] = useState<TaskAttempt | null>(
    null
  );
  const [deletingFiles, setDeletingFiles] = useState<Set<string>>(new Set());
  const [fileToDelete, setFileToDelete] = useState<string | null>(null);

  // Diff-related state
  const [diff, setDiff] = useState<WorktreeDiff | null>(null);
  const [diffLoading, setDiffLoading] = useState(true);
  const [diffError, setDiffError] = useState<string | null>(null);
  const [isBackgroundRefreshing, setIsBackgroundRefreshing] = useState(false);

  const [executionState, setExecutionState] = useState<TaskAttemptState | null>(
    null
  );

  const [attemptData, setAttemptData] = useState<AttemptData>({
    activities: [],
    processes: [],
    runningProcessDetails: {},
  });

  const diffLoadingRef = useRef(false);

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

  const fetchExecutionState = useCallback(
    async (attemptId: string, taskId: string) => {
      if (!task) return;

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

  const handleOpenInEditor = useCallback(
    async (editorType?: EditorType) => {
      if (!task || !selectedAttempt) return;

      try {
        const response = await makeRequest(
          `/api/projects/${projectId}/tasks/${selectedAttempt.task_id}/attempts/${selectedAttempt.id}/open-editor`,
          {
            method: 'POST',
            body: JSON.stringify(
              editorType ? { editor_type: editorType } : null
            ),
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
    },
    [task, projectId, selectedAttempt, setShowEditorDialog]
  );

  const fetchAttemptData = useCallback(
    async (attemptId: string, taskId: string) => {
      if (!task) return;

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

  useEffect(() => {
    if (selectedAttempt && task) {
      fetchAttemptData(selectedAttempt.id, selectedAttempt.task_id);
      fetchExecutionState(selectedAttempt.id, selectedAttempt.task_id);
    }
  }, [selectedAttempt, task, fetchAttemptData, fetchExecutionState]);

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
        fetchAttemptData(selectedAttempt.id, selectedAttempt.task_id);
        fetchExecutionState(selectedAttempt.id, selectedAttempt.task_id);
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
    if (!executionState?.execution_state || !isOpen || !selectedAttempt) return;

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
    setActiveTab,
  ]);

  const value = useMemo(
    () => ({
      task,
      projectId,
      loading,
      setLoading,
      selectedAttempt,
      setSelectedAttempt,
      isStopping,
      setIsStopping,
      deletingFiles,
      fileToDelete,
      setFileToDelete,
      setDeletingFiles,
      fetchDiff,
      setDiffError,
      diff,
      diffError,
      diffLoading,
      setDiffLoading,
      setDiff,
      isBackgroundRefreshing,
      handleOpenInEditor,
      isAttemptRunning,
      fetchExecutionState,
      executionState,
      attemptData,
      setAttemptData,
      fetchAttemptData,
    }),
    [
      task,
      projectId,
      loading,
      selectedAttempt,
      isStopping,
      deletingFiles,
      fileToDelete,
      fetchDiff,
      diff,
      diffError,
      diffLoading,
      isBackgroundRefreshing,
      handleOpenInEditor,
      isAttemptRunning,
      fetchExecutionState,
      executionState,
      attemptData,
      fetchAttemptData,
    ]
  );
  return (
    <TaskDetailsContext.Provider value={value}>
      {children}
    </TaskDetailsContext.Provider>
  );
};

export default TaskDetailsProvider;

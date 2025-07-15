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
  EditorType,
  ExecutionProcess,
  TaskAttempt,
  TaskAttemptState,
  TaskWithAttemptStatus,
  WorktreeDiff,
} from 'shared/types.ts';
import { attemptsApi, executionProcessesApi } from '@/lib/api.ts';
import {
  TaskAttemptDataContext,
  TaskAttemptLoadingContext,
  TaskAttemptStoppingContext,
  TaskBackgroundRefreshContext,
  TaskDeletingFilesContext,
  TaskDetailsContext,
  TaskDiffContext,
  TaskExecutionStateContext,
  TaskSelectedAttemptContext,
} from './taskDetailsContext.ts';
import { AttemptData } from '@/lib/types.ts';

const TaskDetailsProvider: FC<{
  task: TaskWithAttemptStatus;
  projectId: string;
  children: ReactNode;
  activeTab: 'logs' | 'diffs';
  setActiveTab: Dispatch<SetStateAction<'logs' | 'diffs'>>;
  setShowEditorDialog: Dispatch<SetStateAction<boolean>>;
  userSelectedTab: boolean;
  projectHasDevScript?: boolean;
}> = ({
  task,
  projectId,
  children,
  activeTab,
  setActiveTab,
  setShowEditorDialog,
  userSelectedTab,
  projectHasDevScript,
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

      diffLoadingRef.current = true;
      if (isBackgroundRefresh) {
        setIsBackgroundRefreshing(true);
      } else {
        setDiffLoading(true);
      }
      setDiffError(null);

      try {
        const result = await attemptsApi.getDiff(
          projectId,
          selectedAttempt.task_id,
          selectedAttempt.id
        );

        if (result !== undefined) {
          setDiff(result);
        }
      } catch (err) {
        console.error('Failed to load diff:', err);
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
    fetchDiff();
  }, [fetchDiff]);

  const fetchExecutionState = useCallback(
    async (attemptId: string, taskId: string) => {
      if (!task) return;

      try {
        const result = await attemptsApi.getState(projectId, taskId, attemptId);

        if (result !== undefined) {
          setExecutionState((prev) => {
            if (JSON.stringify(prev) === JSON.stringify(result)) return prev;
            return result;
          });
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
        const result = await attemptsApi.openEditor(
          projectId,
          selectedAttempt.task_id,
          selectedAttempt.id,
          editorType
        );

        if (result === undefined && !editorType) {
          setShowEditorDialog(true);
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
        const [activitiesResult, processesResult] = await Promise.all([
          attemptsApi.getActivities(projectId, taskId, attemptId),
          attemptsApi.getExecutionProcesses(projectId, taskId, attemptId),
        ]);

        if (activitiesResult !== undefined && processesResult !== undefined) {
          const runningActivities = activitiesResult.filter(
            (activity) =>
              activity.status === 'setuprunning' ||
              activity.status === 'executorrunning'
          );

          const runningProcessDetails: Record<string, ExecutionProcess> = {};

          // Fetch details for running activities
          for (const activity of runningActivities) {
            const result = await executionProcessesApi.getDetails(
              projectId,
              activity.execution_process_id
            );

            if (result !== undefined) {
              runningProcessDetails[activity.execution_process_id] = result;
            }
          }

          // Also fetch setup script process details if it exists in the processes
          const setupProcess = processesResult.find(
            (process) => process.process_type === 'setupscript'
          );
          if (setupProcess && !runningProcessDetails[setupProcess.id]) {
            const result = await executionProcessesApi.getDetails(
              projectId,
              setupProcess.id
            );

            if (result !== undefined) {
              runningProcessDetails[setupProcess.id] = result;
            }
          }

          setAttemptData((prev) => {
            const newData = {
              activities: activitiesResult,
              processes: processesResult,
              runningProcessDetails,
            };
            if (JSON.stringify(prev) === JSON.stringify(newData)) return prev;
            return newData;
          });
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
    if (!executionState || !selectedAttempt) return;

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
  }, [executionState, selectedAttempt, fetchDiff]);

  // Refresh diff when coding agent completes or changes state
  useEffect(() => {
    if (!executionState?.execution_state || !selectedAttempt) return;

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
      handleOpenInEditor,
      projectHasDevScript,
    }),
    [task, projectId, handleOpenInEditor, projectHasDevScript]
  );

  const taskAttemptLoadingValue = useMemo(
    () => ({ loading, setLoading }),
    [loading]
  );

  const selectedAttemptValue = useMemo(
    () => ({ selectedAttempt, setSelectedAttempt }),
    [selectedAttempt]
  );

  const attemptStoppingValue = useMemo(
    () => ({ isStopping, setIsStopping }),
    [isStopping]
  );

  const deletingFilesValue = useMemo(
    () => ({
      deletingFiles,
      fileToDelete,
      setFileToDelete,
      setDeletingFiles,
    }),
    [deletingFiles, fileToDelete]
  );

  const diffValue = useMemo(
    () => ({
      setDiffError,
      fetchDiff,
      diff,
      diffError,
      diffLoading,
      setDiff,
      setDiffLoading,
    }),
    [fetchDiff, diff, diffError, diffLoading]
  );

  const backgroundRefreshingValue = useMemo(
    () => ({
      isBackgroundRefreshing,
    }),
    [isBackgroundRefreshing]
  );

  const attemptDataValue = useMemo(
    () => ({
      attemptData,
      setAttemptData,
      fetchAttemptData,
      isAttemptRunning,
    }),
    [attemptData, fetchAttemptData, isAttemptRunning]
  );

  const executionStateValue = useMemo(
    () => ({
      executionState,
      fetchExecutionState,
    }),
    [executionState, fetchExecutionState]
  );

  return (
    <TaskDetailsContext.Provider value={value}>
      <TaskAttemptLoadingContext.Provider value={taskAttemptLoadingValue}>
        <TaskSelectedAttemptContext.Provider value={selectedAttemptValue}>
          <TaskAttemptStoppingContext.Provider value={attemptStoppingValue}>
            <TaskDeletingFilesContext.Provider value={deletingFilesValue}>
              <TaskDiffContext.Provider value={diffValue}>
                <TaskAttemptDataContext.Provider value={attemptDataValue}>
                  <TaskExecutionStateContext.Provider
                    value={executionStateValue}
                  >
                    <TaskBackgroundRefreshContext.Provider
                      value={backgroundRefreshingValue}
                    >
                      {children}
                    </TaskBackgroundRefreshContext.Provider>
                  </TaskExecutionStateContext.Provider>
                </TaskAttemptDataContext.Provider>
              </TaskDiffContext.Provider>
            </TaskDeletingFilesContext.Provider>
          </TaskAttemptStoppingContext.Provider>
        </TaskSelectedAttemptContext.Provider>
      </TaskAttemptLoadingContext.Provider>
    </TaskDetailsContext.Provider>
  );
};

export default TaskDetailsProvider;

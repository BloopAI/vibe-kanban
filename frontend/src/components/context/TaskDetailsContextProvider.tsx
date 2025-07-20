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
  ExecutionProcessSummary,
  Task,
  TaskAttempt,
  TaskAttemptState,
  TaskWithAttemptStatus,
  WorktreeDiff,
} from 'shared/types.ts';
import { attemptsApi, executionProcessesApi, tasksApi } from '@/lib/api.ts';
import {
  TaskAttemptDataContext,
  TaskAttemptLoadingContext,
  TaskAttemptStoppingContext,
  TaskBackgroundRefreshContext,
  TaskDeletingFilesContext,
  TaskDetailsContext,
  TaskDiffContext,
  TaskExecutionStateContext,
  TaskRelatedTasksContext,
  TaskSelectedAttemptContext,
} from './taskDetailsContext.ts';
import type { AttemptData } from '@/lib/types.ts';

const TaskDetailsProvider: FC<{
  task: TaskWithAttemptStatus;
  projectId: string;
  children: ReactNode;
  setShowEditorDialog: Dispatch<SetStateAction<boolean>>;
  projectHasDevScript?: boolean;
}> = ({
  task,
  projectId,
  children,
  setShowEditorDialog,
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

  // Related tasks state
  const [relatedTasks, setRelatedTasks] = useState<Task[] | null>(null);
  const [relatedTasksLoading, setRelatedTasksLoading] = useState(true);
  const [relatedTasksError, setRelatedTasksError] = useState<string | null>(
    null
  );

  const [executionState, setExecutionState] = useState<TaskAttemptState | null>(
    null
  );

  const [attemptData, setAttemptData] = useState<AttemptData>({
    processes: [],
    runningProcessDetails: {},
    allLogs: [], // new field for all logs
  });

  const relatedTasksLoadingRef = useRef(false);

  const fetchRelatedTasks = useCallback(async () => {
    if (!projectId || !task?.id || !selectedAttempt?.id) {
      setRelatedTasks(null);
      setRelatedTasksLoading(false);
      return;
    }

    // Prevent multiple concurrent requests
    if (relatedTasksLoadingRef.current) {
      return;
    }

    relatedTasksLoadingRef.current = true;
    setRelatedTasksLoading(true);
    setRelatedTasksError(null);

    try {
      const children = await tasksApi.getChildren(
        projectId,
        task.id,
        selectedAttempt.id
      );
      setRelatedTasks(children);
    } catch (err) {
      console.error('Failed to load related tasks:', err);
      setRelatedTasksError('Failed to load related tasks');
    } finally {
      relatedTasksLoadingRef.current = false;
      setRelatedTasksLoading(false);
    }
  }, [projectId, task?.id, selectedAttempt?.id]);

  const fetchDiff = useCallback(
    async (isBackgroundRefresh = false) => {
      if (!projectId || !selectedAttempt?.id || !selectedAttempt?.task_id) {
        setDiff(null);
        setDiffLoading(false);
        return;
      }

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
    if (selectedAttempt && task) {
      fetchRelatedTasks();
    } else if (task && !selectedAttempt) {
      // If we have a task but no selectedAttempt, wait a bit then clear loading state
      // This happens when a task has no attempts yet
      const timeout = setTimeout(() => {
        setRelatedTasks(null);
        setRelatedTasksLoading(false);
      }, 1000); // Wait 1 second for attempts to load

      return () => clearTimeout(timeout);
    }
  }, [selectedAttempt, task, fetchRelatedTasks]);

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
        const [processesResult, allLogsResult] = await Promise.all([
          attemptsApi.getExecutionProcesses(projectId, taskId, attemptId),
          attemptsApi.getAllLogs(projectId, taskId, attemptId),
        ]);

        if (processesResult !== undefined && allLogsResult !== undefined) {
          const runningProcesses = processesResult.filter(
            (process) => process.status === 'running'
          );

          const runningProcessDetails: Record<string, ExecutionProcess> = {};

          // Fetch details for running processes
          for (const process of runningProcesses) {
            const result = await executionProcessesApi.getDetails(process.id);

            if (result !== undefined) {
              runningProcessDetails[process.id] = result;
            }
          }

          // Also fetch setup script process details if it exists in the processes
          const setupProcess = processesResult.find(
            (process) => process.process_type === 'setupscript'
          );
          if (setupProcess && !runningProcessDetails[setupProcess.id]) {
            const result = await executionProcessesApi.getDetails(
              setupProcess.id
            );

            if (result !== undefined) {
              runningProcessDetails[setupProcess.id] = result;
            }
          }

          setAttemptData((prev: AttemptData) => {
            const newData = {
              processes: processesResult,
              runningProcessDetails,
              allLogs: allLogsResult,
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
      (process: ExecutionProcessSummary) =>
        (process.process_type === 'codingagent' ||
          process.process_type === 'setupscript' ||
          process.process_type === 'cleanupscript') &&
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
    }, 5000);

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

    fetchDiff();
  }, [
    executionState?.execution_state,
    executionState?.has_changes,
    selectedAttempt,
    fetchDiff,
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

  const relatedTasksValue = useMemo(
    () => ({
      relatedTasks,
      setRelatedTasks,
      relatedTasksLoading,
      setRelatedTasksLoading,
      relatedTasksError,
      setRelatedTasksError,
      fetchRelatedTasks,
      totalRelatedCount:
        (task?.parent_task_attempt ? 1 : 0) + (relatedTasks?.length || 0),
    }),
    [
      relatedTasks,
      relatedTasksLoading,
      relatedTasksError,
      fetchRelatedTasks,
      task?.parent_task_attempt,
    ]
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
                      <TaskRelatedTasksContext.Provider
                        value={relatedTasksValue}
                      >
                        {children}
                      </TaskRelatedTasksContext.Provider>
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

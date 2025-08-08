import {
  Dispatch,
  FC,
  ReactNode,
  SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { ExecutionProcess, ExecutionProcessSummary } from 'shared/types';
import type {
  EditorType,
  TaskAttempt,
  TaskWithAttemptStatus,
} from 'shared/types';
import { attemptsApi, executionProcessesApi } from '@/lib/api.ts';
import {
  TaskAttemptDataContext,
  TaskAttemptLoadingContext,
  TaskAttemptStoppingContext,
  TaskDeletingFilesContext,
  TaskDetailsContext,
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

  const [attemptData, setAttemptData] = useState<AttemptData>({
    processes: [],
    runningProcessDetails: {},
  });

  const handleOpenInEditor = useCallback(
    async (editorType?: EditorType) => {
      if (!task || !selectedAttempt) return;

      try {
        const result = await attemptsApi.openEditor(
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
    async (attemptId: string) => {
      if (!task) return;

      try {
        const processesResult =
          await executionProcessesApi.getExecutionProcesses(attemptId);

        if (processesResult !== undefined) {
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
            (process) => process.run_reason === 'setupscript'
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
      fetchAttemptData(selectedAttempt.id);
    }
  }, [selectedAttempt, task, fetchAttemptData]);

  const isAttemptRunning = useMemo(() => {
    if (!selectedAttempt || isStopping) {
      return false;
    }

    return attemptData.processes.some(
      (process: ExecutionProcessSummary) =>
        (process.run_reason === 'codingagent' ||
          process.run_reason === 'setupscript' ||
          process.run_reason === 'cleanupscript') &&
        process.status === 'running'
    );
  }, [selectedAttempt, attemptData.processes, isStopping]);

  useEffect(() => {
    if (!isAttemptRunning || !task) return;

    const interval = setInterval(() => {
      if (selectedAttempt) {
        fetchAttemptData(selectedAttempt.id);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [isAttemptRunning, task, selectedAttempt, fetchAttemptData]);

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

  const attemptDataValue = useMemo(
    () => ({
      attemptData,
      setAttemptData,
      fetchAttemptData,
      isAttemptRunning,
    }),
    [attemptData, fetchAttemptData, isAttemptRunning]
  );

  return (
    <TaskDetailsContext.Provider value={value}>
      <TaskAttemptLoadingContext.Provider value={taskAttemptLoadingValue}>
        <TaskSelectedAttemptContext.Provider value={selectedAttemptValue}>
          <TaskAttemptStoppingContext.Provider value={attemptStoppingValue}>
            <TaskDeletingFilesContext.Provider value={deletingFilesValue}>
              <TaskAttemptDataContext.Provider value={attemptDataValue}>
                {children}
              </TaskAttemptDataContext.Provider>
            </TaskDeletingFilesContext.Provider>
          </TaskAttemptStoppingContext.Provider>
        </TaskSelectedAttemptContext.Provider>
      </TaskAttemptLoadingContext.Provider>
    </TaskDetailsContext.Provider>
  );
};

export default TaskDetailsProvider;

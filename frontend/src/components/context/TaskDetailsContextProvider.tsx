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
import type { ExecutionProcess, ProfileVariant } from 'shared/types';
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
import { extractProfileVariant } from '@/lib/utils.ts';
import { useUserSystem } from '@/components/config-provider';

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
  const { profiles } = useUserSystem();
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
    processProfiles: {},
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
          const processProfiles: Record<string, ProfileVariant | null> = {};

          // Fetch details for running processes
          for (const process of runningProcesses) {
            const result = await executionProcessesApi.getDetails(process.id);

            if (result !== undefined) {
              runningProcessDetails[process.id] = result;
              // Extract ProfileVariant from the executor_action
              processProfiles[process.id] = extractProfileVariant(
                result.executor_action
              );
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
              // Extract ProfileVariant from the executor_action
              processProfiles[setupProcess.id] = extractProfileVariant(
                result.executor_action
              );
            }
          }

          // Extract ProfileVariant for all processes (not just running/setup)
          for (const process of processesResult) {
            if (!processProfiles[process.id]) {
              // Extract ProfileVariant from the summary's executor_action
              processProfiles[process.id] = extractProfileVariant(
                process.executor_action
              );
            }
          }

          setAttemptData((prev: AttemptData) => {
            const newData = {
              processes: processesResult,
              runningProcessDetails,
              processProfiles,
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
      (process: ExecutionProcess) =>
        (process.run_reason === 'codingagent' ||
          process.run_reason === 'setupscript' ||
          process.run_reason === 'cleanupscript') &&
        process.status === 'running'
    );
  }, [selectedAttempt, attemptData.processes, isStopping]);

  const defaultFollowUpVariant = useMemo(() => {
    // Find most recent coding agent process with variant
    const codingAgentProcesses = attemptData.processes.filter(
      (p) => p.run_reason === 'codingagent'
    );

    if (codingAgentProcesses.length > 0) {
      // Iterate in reverse (most recent first, since ordered ASC)
      for (let i = codingAgentProcesses.length - 1; i >= 0; i--) {
        const profileVariant =
          attemptData.processProfiles[codingAgentProcesses[i].id];
        if (profileVariant) {
          return profileVariant?.variant;
        }
      }
    } else if (selectedAttempt?.profile && profiles) {
      // No processes yet, check if profile has default variant
      const profile = profiles.find((p) => p.label === selectedAttempt.profile);
      if (profile?.variants && profile.variants.length > 0) {
        return profile.variants[0].label;
      }
    }
    return null;
  }, [
    attemptData.processes,
    attemptData.processProfiles,
    selectedAttempt?.profile,
    profiles,
  ]);

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
      defaultFollowUpVariant,
    }),
    [attemptData, fetchAttemptData, isAttemptRunning, defaultFollowUpVariant]
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

import { useState, useEffect, useMemo, useCallback } from 'react';
import { makeRequest } from '@/lib/api';
import { useConfig } from '@/components/config-provider';
import type {
  TaskAttempt,
  TaskAttemptActivityWithPrompt,
  ApiResponse,
  TaskWithAttemptStatus,
  ExecutionProcess,
  ExecutionProcessSummary,
  EditorType,
} from 'shared/types';

export function useTaskDetails(
  task: TaskWithAttemptStatus | null,
  projectId: string,
  isOpen: boolean
) {
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
  const [selectedExecutor, setSelectedExecutor] = useState<string>('claude');
  const [isStopping, setIsStopping] = useState(false);
  const [followUpMessage, setFollowUpMessage] = useState('');
  const [isSendingFollowUp, setIsSendingFollowUp] = useState(false);
  const [followUpError, setFollowUpError] = useState<string | null>(null);
  const [isStartingDevServer, setIsStartingDevServer] = useState(false);
  const [devServerDetails, setDevServerDetails] =
    useState<ExecutionProcess | null>(null);
  const [isHoveringDevServer, setIsHoveringDevServer] = useState(false);

  const { config } = useConfig();

  // Find running dev server in current project
  const runningDevServer = useMemo(() => {
    return attemptData.processes.find(
      (process) =>
        process.process_type === 'devserver' && process.status === 'running'
    );
  }, [attemptData.processes]);

  // Check if any execution process is currently running
  const isAttemptRunning = useMemo(() => {
    if (!selectedAttempt || attemptData.activities.length === 0 || isStopping) {
      return false;
    }

    const latestActivitiesByProcess = new Map<
      string,
      TaskAttemptActivityWithPrompt
    >();

    attemptData.activities.forEach((activity) => {
      const existing = latestActivitiesByProcess.get(
        activity.execution_process_id
      );
      if (
        !existing ||
        new Date(activity.created_at) > new Date(existing.created_at)
      ) {
        latestActivitiesByProcess.set(activity.execution_process_id, activity);
      }
    });

    return Array.from(latestActivitiesByProcess.values()).some(
      (activity) =>
        activity.status === 'setuprunning' ||
        activity.status === 'executorrunning'
    );
  }, [selectedAttempt, attemptData.activities, isStopping]);

  // Check if follow-up should be enabled
  const canSendFollowUp = useMemo(() => {
    if (
      !selectedAttempt ||
      attemptData.activities.length === 0 ||
      isAttemptRunning ||
      isSendingFollowUp
    ) {
      return false;
    }

    const codingAgentActivities = attemptData.activities.filter(
      (activity) => activity.status === 'executorcomplete'
    );

    return codingAgentActivities.length > 0;
  }, [
    selectedAttempt,
    attemptData.activities,
    isAttemptRunning,
    isSendingFollowUp,
  ]);

  // Memoize processed dev server logs
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

      try {
        const [activitiesResponse, processesResponse] = await Promise.all([
          makeRequest(
            `/api/projects/${projectId}/tasks/${task.id}/attempts/${attemptId}/activities`
          ),
          makeRequest(
            `/api/projects/${projectId}/tasks/${task.id}/attempts/${attemptId}/execution-processes`
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
  }, [task, projectId, fetchAttemptData]);

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

  // Set default executor from config
  useEffect(() => {
    if (config) {
      setSelectedExecutor(config.executor.type);
    }
  }, [config]);

  useEffect(() => {
    if (task && isOpen) {
      fetchTaskAttempts();
    }
  }, [task, isOpen, fetchTaskAttempts]);

  // Polling for updates when attempt is running
  useEffect(() => {
    if (!isAttemptRunning || !task) return;

    const interval = setInterval(() => {
      if (selectedAttempt) {
        fetchAttemptData(selectedAttempt.id);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [isAttemptRunning, task, selectedAttempt, fetchAttemptData]);

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
    }
  };

  const createNewAttempt = async (executor?: string) => {
    if (!task) return;

    try {
      const response = await makeRequest(
        `/api/projects/${projectId}/tasks/${task.id}/attempts`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            executor: executor || selectedExecutor,
          }),
        }
      );

      if (response.ok) {
        fetchTaskAttempts();
      }
    } catch (err) {
      console.error('Failed to create new attempt:', err);
    }
  };

  const stopAllExecutions = async () => {
    if (!task || !selectedAttempt) return;

    try {
      setIsStopping(true);
      const response = await makeRequest(
        `/api/projects/${projectId}/tasks/${task.id}/attempts/${selectedAttempt.id}/stop`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
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

  const startDevServer = async () => {
    if (!task || !selectedAttempt) return;

    setIsStartingDevServer(true);

    try {
      const response = await makeRequest(
        `/api/projects/${projectId}/tasks/${task.id}/attempts/${selectedAttempt.id}/start-dev-server`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to start dev server');
      }

      const data: ApiResponse<null> = await response.json();

      if (!data.success) {
        throw new Error(data.message || 'Failed to start dev server');
      }

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
      const response = await makeRequest(
        `/api/projects/${projectId}/tasks/${task.id}/attempts/${selectedAttempt.id}/execution-processes/${runningDevServer.id}/stop`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to stop dev server');
      }

      fetchAttemptData(selectedAttempt.id);
    } catch (err) {
      console.error('Failed to stop dev server:', err);
    } finally {
      setIsStartingDevServer(false);
    }
  };

  const openInEditor = async (editorType?: EditorType) => {
    if (!task || !selectedAttempt) return;

    try {
      const response = await makeRequest(
        `/api/projects/${projectId}/tasks/${task.id}/attempts/${selectedAttempt.id}/open-editor`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(editorType ? { editor_type: editorType } : null),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to open editor');
      }
    } catch (err) {
      console.error('Failed to open editor:', err);
      throw err;
    }
  };

  const handleSendFollowUp = async () => {
    if (!task || !selectedAttempt || !followUpMessage.trim()) return;

    try {
      setIsSendingFollowUp(true);
      setFollowUpError(null);
      const response = await makeRequest(
        `/api/projects/${projectId}/tasks/${task.id}/attempts/${selectedAttempt.id}/follow-up`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            prompt: followUpMessage.trim(),
          }),
        }
      );

      if (response.ok) {
        setFollowUpMessage('');
        fetchAttemptData(selectedAttempt.id);
      } else {
        const errorText = await response.text();
        setFollowUpError(
          `Failed to start follow-up execution: ${
            errorText || response.statusText
          }`
        );
      }
    } catch (err) {
      setFollowUpError(
        `Failed to send follow-up: ${
          err instanceof Error ? err.message : 'Unknown error'
        }`
      );
    } finally {
      setIsSendingFollowUp(false);
    }
  };

  return {
    // State
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
    isHoveringDevServer,

    // Computed
    runningDevServer,
    isAttemptRunning,
    canSendFollowUp,
    processedDevServerLogs,

    // Actions
    setSelectedExecutor,
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
  };
}

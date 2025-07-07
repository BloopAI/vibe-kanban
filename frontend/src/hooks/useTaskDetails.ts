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
  GitBranch,
  TaskAttemptState,
} from 'shared/types';

export function useTaskDetails(
  task: TaskWithAttemptStatus | null,
  projectId: string,
  isOpen: boolean
) {
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
  const [isStopping, setIsStopping] = useState(false);
  const [followUpMessage, setFollowUpMessage] = useState('');
  const [isSendingFollowUp, setIsSendingFollowUp] = useState(false);
  const [followUpError, setFollowUpError] = useState<string | null>(null);
  const [isStartingDevServer, setIsStartingDevServer] = useState(false);
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

  const createNewAttempt = async (executor?: string, baseBranch?: string) => {
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
            base_branch: baseBranch || selectedBranch,
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
        `/api/projects/${projectId}/tasks/${selectedAttempt.task_id}/attempts/${selectedAttempt.id}/stop`,
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
        `/api/projects/${projectId}/tasks/${selectedAttempt.task_id}/attempts/${selectedAttempt.id}/start-dev-server`,
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
        `/api/projects/${projectId}/tasks/${selectedAttempt.task_id}/attempts/${selectedAttempt.id}/execution-processes/${runningDevServer.id}/stop`,
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
        `/api/projects/${projectId}/tasks/${selectedAttempt.task_id}/attempts/${selectedAttempt.id}/open-editor`,
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
        `/api/projects/${projectId}/tasks/${selectedAttempt.task_id}/attempts/${selectedAttempt.id}/follow-up`,
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
    branches,
    selectedBranch,
    executionState,

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
    setSelectedBranch,
    handleAttemptChange,
    createNewAttempt,
    stopAllExecutions,
    startDevServer,
    stopDevServer,
    openInEditor,
    handleSendFollowUp,
  };
}

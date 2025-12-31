import { useEffect, useState, useCallback } from 'react';
import {
  WorkflowProgress,
  WorkflowStage,
  WorkflowStatus,
  AgentStatus,
  WorkflowHistory,
  WorkflowConfig,
  CreateWorkflowRequest,
  StartWorkflowStageRequest,
} from 'shared/types';

export type WorkflowProgressState =
  | { status: 'loading' }
  | { status: 'success'; data: WorkflowProgress }
  | { status: 'error'; error: string };

export type AgentStatusState =
  | { status: 'loading' }
  | { status: 'success'; data: Record<WorkflowStage, AgentStatus> }
  | { status: 'error'; error: string };

export type WorkflowHistoryState =
  | { status: 'loading' }
  | { status: 'success'; data: WorkflowHistory[] }
  | { status: 'error'; error: string };

/**
 * Hook to track workflow execution progress for a specific task
 */
export function useWorkflowProgress(taskId: string | null | undefined) {
  const [state, setState] = useState<WorkflowProgressState>({
    status: 'loading',
  });

  const fetchProgress = useCallback(async () => {
    if (!taskId) {
      setState({ status: 'loading' });
      return;
    }

    try {
      const response = await fetch(`/api/workflows/task/${taskId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch workflow progress');
      }
      const data: WorkflowProgress = await response.json();
      setState({ status: 'success', data });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      setState({ status: 'error', error: errorMessage });
    }
  }, [taskId]);

  useEffect(() => {
    fetchProgress();
  }, [fetchProgress]);

  // Set up polling for active workflows
  useEffect(() => {
    if (state.status === 'success' && state.data.status === 'in_progress') {
      const interval = setInterval(fetchProgress, 2000); // Poll every 2 seconds
      return () => clearInterval(interval);
    }
  }, [state, fetchProgress]);

  const startWorkflow = useCallback(
    async (workflowConfig: string): Promise<void> => {
      if (!taskId) {
        throw new Error('Task ID is required');
      }

      setState({ status: 'loading' });

      try {
        const request: CreateWorkflowRequest = {
          task_id: taskId,
          workflow_config: workflowConfig,
        };

        const response = await fetch('/api/workflows/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request),
        });

        if (!response.ok) {
          throw new Error('Failed to start workflow');
        }

        await fetchProgress();
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        setState({ status: 'error', error: errorMessage });
        throw error;
      }
    },
    [taskId, fetchProgress]
  );

  const startStage = useCallback(
    async (stage: WorkflowStage): Promise<void> => {
      if (state.status !== 'success') {
        throw new Error('Workflow not loaded');
      }

      const request: StartWorkflowStageRequest = {
        workflow_id: state.data.workflow_id,
        stage,
      };

      const response = await fetch('/api/workflows/stage/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        throw new Error('Failed to start workflow stage');
      }

      await fetchProgress();
    },
    [state, fetchProgress]
  );

  return {
    state,
    refetch: fetchProgress,
    startWorkflow,
    startStage,
  };
}

/**
 * Hook to monitor agent activity across workflow stages
 */
export function useAgentStatus(taskId: string | null | undefined) {
  const [state, setState] = useState<AgentStatusState>({
    status: 'loading',
  });

  const fetchAgentStatus = useCallback(async () => {
    if (!taskId) {
      setState({ status: 'loading' });
      return;
    }

    try {
      const response = await fetch(`/api/workflows/task/${taskId}/agents`);
      if (!response.ok) {
        throw new Error('Failed to fetch agent status');
      }
      const data: Record<WorkflowStage, AgentStatus> = await response.json();
      setState({ status: 'success', data });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      setState({ status: 'error', error: errorMessage });
    }
  }, [taskId]);

  useEffect(() => {
    fetchAgentStatus();
  }, [fetchAgentStatus]);

  // Set up polling for active agents
  useEffect(() => {
    if (
      state.status === 'success' &&
      Object.values(state.data).some((status) => status === 'running')
    ) {
      const interval = setInterval(fetchAgentStatus, 1000); // Poll every second
      return () => clearInterval(interval);
    }
  }, [state, fetchAgentStatus]);

  return {
    state,
    refetch: fetchAgentStatus,
  };
}

/**
 * Hook to view completed workflow history
 */
export function useWorkflowHistory(projectId?: string, limit = 50) {
  const [state, setState] = useState<WorkflowHistoryState>({
    status: 'loading',
  });

  const fetchHistory = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (projectId) params.append('project_id', projectId);
      params.append('limit', limit.toString());

      const response = await fetch(`/api/workflows/history?${params}`);
      if (!response.ok) {
        throw new Error('Failed to fetch workflow history');
      }
      const data: WorkflowHistory[] = await response.json();
      setState({ status: 'success', data });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      setState({ status: 'error', error: errorMessage });
    }
  }, [projectId, limit]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  return {
    state,
    refetch: fetchHistory,
  };
}

/**
 * Hook to get workflow configuration from file
 */
export function useWorkflowConfig(workflowName = 'default') {
  const [config, setConfig] = useState<WorkflowConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchConfig = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/workflows/config/${workflowName}`);
        if (!response.ok) {
          throw new Error('Failed to fetch workflow config');
        }
        const data = await response.json();
        setConfig(data);
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Unknown error';
        setError(errorMessage);
      } finally {
        setLoading(false);
      }
    };

    fetchConfig();
  }, [workflowName]);

  return { config, loading, error };
}

/**
 * Utility function to format duration in human-readable form
 */
export function formatDuration(seconds: number | null): string {
  if (seconds === null) return '-';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return secs > 0 ? `${minutes}m ${secs}s` : `${minutes}m`;
  }
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}

/**
 * Utility function to get stage display name
 */
export function getStageDisplayName(stage: WorkflowStage): string {
  const names: Record<WorkflowStage, string> = {
    [WorkflowStage.RESEARCH]: 'Research',
    [WorkflowStage.IMPLEMENT]: 'Implement',
    [WorkflowStage.CI_CD]: 'CI/CD',
    [WorkflowStage.REVIEW]: 'Review',
  };
  return names[stage];
}

/**
 * Utility function to get status color for display
 */
export function getStatusColor(status: WorkflowStatus | AgentStatus): string {
  const colors: Record<string, string> = {
    pending: 'bg-neutral-200 text-neutral-700',
    in_progress: 'bg-blue-100 text-blue-700',
    completed: 'bg-green-100 text-green-700',
    failed: 'bg-red-100 text-red-700',
    skipped: 'bg-gray-100 text-gray-500',
    idle: 'bg-neutral-200 text-neutral-700',
    running: 'bg-blue-100 text-blue-700',
  };
  return colors[status] || 'bg-gray-100 text-gray-700';
}

import { useCallback, useMemo } from 'react';
import { useJsonPatchWsStream } from './useJsonPatchWsStream';
import type { TaskStatus, TaskWithAttemptStatus } from 'shared/types';

type TasksState = {
  tasks: Record<string, TaskWithAttemptStatus>;
};

export interface UseBoardTasksOverviewResult {
  tasksByStatus: Record<TaskStatus, TaskWithAttemptStatus[]>;
  totalCount: number;
  isLoading: boolean;
  isConnected: boolean;
  error: string | null;
}

/**
 * Simplified hook for fetching tasks overview for a project.
 * Used on the AllBoards page to show task counts and mini kanban.
 * Does not include shared tasks - just local tasks for quick overview.
 */
export const useBoardTasksOverview = (
  projectId: string,
  enabled: boolean = true
): UseBoardTasksOverviewResult => {
  const endpoint = `/api/tasks/stream/ws?project_id=${encodeURIComponent(projectId)}`;

  const initialData = useCallback((): TasksState => ({ tasks: {} }), []);

  const { data, isConnected, isInitialized, error } = useJsonPatchWsStream(
    endpoint,
    enabled && !!projectId,
    initialData
  );

  const { tasksByStatus, totalCount } = useMemo(() => {
    const tasksById = data?.tasks ?? {};
    const byStatus: Record<TaskStatus, TaskWithAttemptStatus[]> = {
      todo: [],
      inprogress: [],
      inreview: [],
      done: [],
      cancelled: [],
    };

    Object.values(tasksById).forEach((task) => {
      byStatus[task.status]?.push(task);
    });

    // Sort each status by created_at descending
    (Object.values(byStatus) as TaskWithAttemptStatus[][]).forEach((list) => {
      list.sort(
        (a, b) =>
          new Date(b.created_at as string).getTime() -
          new Date(a.created_at as string).getTime()
      );
    });

    return {
      tasksByStatus: byStatus,
      totalCount: Object.values(tasksById).length,
    };
  }, [data?.tasks]);

  const isLoading = !isInitialized && !error;

  return {
    tasksByStatus,
    totalCount,
    isLoading,
    isConnected,
    error,
  };
};

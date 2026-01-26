import { useCallback, useMemo } from 'react';
import { useJsonPatchWsStream } from './useJsonPatchWsStream';
import type { GlobalTaskWithAttemptStatus, TaskStatus } from 'shared/types';

type GlobalTasksState = {
  tasks: Record<string, GlobalTaskWithAttemptStatus>;
};

export interface UseGlobalTasksResult {
  tasks: GlobalTaskWithAttemptStatus[];
  tasksById: Record<string, GlobalTaskWithAttemptStatus>;
  tasksByStatus: Record<TaskStatus, GlobalTaskWithAttemptStatus[]>;
  isLoading: boolean;
  isConnected: boolean;
  error: string | null;
}

export const useGlobalTasks = (): UseGlobalTasksResult => {
  const endpoint = '/api/tasks/global/stream/ws';

  const initialData = useCallback((): GlobalTasksState => ({ tasks: {} }), []);

  const { data, isConnected, isInitialized, error } = useJsonPatchWsStream(
    endpoint,
    true,
    initialData
  );

  const localTasksById = useMemo(() => data?.tasks ?? {}, [data?.tasks]);

  const { tasks, tasksById, tasksByStatus } = useMemo(() => {
    const merged: Record<string, GlobalTaskWithAttemptStatus> = {
      ...localTasksById,
    };
    const byStatus: Record<TaskStatus, GlobalTaskWithAttemptStatus[]> = {
      todo: [],
      inprogress: [],
      inreview: [],
      done: [],
      cancelled: [],
    };

    Object.values(merged).forEach((task) => {
      byStatus[task.status]?.push(task);
    });

    const sorted = Object.values(merged).sort(
      (a, b) =>
        new Date(b.created_at as string).getTime() -
        new Date(a.created_at as string).getTime()
    );

    (Object.values(byStatus) as GlobalTaskWithAttemptStatus[][]).forEach(
      (list) => {
        list.sort(
          (a, b) =>
            new Date(b.created_at as string).getTime() -
            new Date(a.created_at as string).getTime()
        );
      }
    );

    return { tasks: sorted, tasksById: merged, tasksByStatus: byStatus };
  }, [localTasksById]);

  const isLoading = !isInitialized && !error;

  return {
    tasks,
    tasksById,
    tasksByStatus,
    isLoading,
    isConnected,
    error,
  };
};

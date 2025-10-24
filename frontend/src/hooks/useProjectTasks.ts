import { useCallback, useMemo } from 'react';
import { useJsonPatchWsStream } from './useJsonPatchWsStream';
import type { SharedTask, TaskWithAttemptStatus } from 'shared/types';

export type SharedTaskRecord = Omit<
  SharedTask,
  'version' | 'last_event_seq'
> & {
  version: number;
  last_event_seq: number | null;
  created_at: string | Date;
  updated_at: string | Date;
};

type TasksState = {
  tasks: Record<string, TaskWithAttemptStatus>;
  shared_tasks: Record<string, SharedTaskRecord>;
};

interface UseProjectTasksResult {
  tasks: TaskWithAttemptStatus[];
  tasksById: Record<string, TaskWithAttemptStatus>;
  sharedTasks: SharedTaskRecord[];
  sharedTasksById: Record<string, SharedTaskRecord>;
  isLoading: boolean;
  isConnected: boolean;
  error: string | null;
}

/**
 * Stream tasks for a project via WebSocket (JSON Patch) and expose as array + map.
 * Server sends initial snapshot: replace /tasks with an object keyed by id.
 * Live updates arrive at /tasks/<id> via add/replace/remove operations.
 */
export const useProjectTasks = (projectId: string): UseProjectTasksResult => {
  const endpoint = `/api/tasks/stream/ws?project_id=${encodeURIComponent(projectId)}`;

  const initialData = useCallback(
    (): TasksState => ({ tasks: {}, shared_tasks: {} }),
    []
  );

  const { data, isConnected, error } = useJsonPatchWsStream(
    endpoint,
    !!projectId,
    initialData
  );

  const localTasksById = data?.tasks ?? {};
  const sharedTasksById = data?.shared_tasks ?? {};

  const { tasks, tasksById } = useMemo(() => {
    const merged: Record<string, TaskWithAttemptStatus> = { ...localTasksById };
    const sorted = Object.values(merged).sort(
      (a, b) =>
        new Date(b.created_at as string).getTime() -
        new Date(a.created_at as string).getTime()
    );

    return { tasks: sorted, tasksById: merged };
  }, [localTasksById]);

  const sharedTasks = useMemo(() => {
    return Object.values(sharedTasksById).sort(
      (a, b) =>
        new Date(b.created_at as string).getTime() -
        new Date(a.created_at as string).getTime()
    );
  }, [sharedTasksById]);

  const isLoading = !data && !error; // until first snapshot

  return {
    tasks,
    tasksById,
    sharedTasks,
    sharedTasksById,
    isLoading,
    isConnected,
    error,
  };
};

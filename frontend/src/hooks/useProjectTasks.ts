import { useCallback, useMemo } from 'react';
import { useJsonPatchWsStream } from './useJsonPatchWsStream';
import { useProject } from '@/contexts/ProjectContext';
import type {
  SharedTask,
  TaskStatus,
  TaskWithAttemptStatus,
} from 'shared/types';

export type SharedTaskRecord = Omit<
  SharedTask,
  'version' | 'last_event_seq'
> & {
  version: number;
  last_event_seq: number | null;
  created_at: string | Date;
  updated_at: string | Date;
  assignee_first_name?: string | null;
  assignee_last_name?: string | null;
  assignee_username?: string | null;
};

type TasksState = {
  tasks: Record<string, TaskWithAttemptStatus>;
  shared_tasks: Record<string, SharedTaskRecord>;
};

export interface UseProjectTasksResult {
  tasks: TaskWithAttemptStatus[];
  tasksById: Record<string, TaskWithAttemptStatus>;
  tasksByStatus: Record<TaskStatus, TaskWithAttemptStatus[]>;
  sharedTasksById: Record<string, SharedTaskRecord>;
  sharedOnlyByStatus: Record<TaskStatus, SharedTaskRecord[]>;
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
  const { project } = useProject();
  const remoteProjectId = project?.remote_project_id;

  const endpoint = `/api/tasks/stream/ws?project_id=${encodeURIComponent(projectId)}&remote_project_id=${encodeURIComponent(remoteProjectId ?? 'null')}`;

  const initialData = useCallback(
    (): TasksState => ({ tasks: {}, shared_tasks: {} }),
    []
  );

  const { data, isConnected, error } = useJsonPatchWsStream(
    endpoint,
    !!projectId,
    initialData
  );

  const localTasksById = useMemo(() => data?.tasks ?? {}, [data?.tasks]);
  const sharedTasksById = useMemo(
    () => data?.shared_tasks ?? {},
    [data?.shared_tasks]
  );

  const { tasks, tasksById, tasksByStatus } = useMemo(() => {
    const merged: Record<string, TaskWithAttemptStatus> = { ...localTasksById };
    const byStatus: Record<TaskStatus, TaskWithAttemptStatus[]> = {
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

    (Object.values(byStatus) as TaskWithAttemptStatus[][]).forEach((list) => {
      list.sort(
        (a, b) =>
          new Date(b.created_at as string).getTime() -
          new Date(a.created_at as string).getTime()
      );
    });

    return { tasks: sorted, tasksById: merged, tasksByStatus: byStatus };
  }, [localTasksById]);

  const sharedOnlyByStatus = useMemo(() => {
    const grouped: Record<TaskStatus, SharedTaskRecord[]> = {
      todo: [],
      inprogress: [],
      inreview: [],
      done: [],
      cancelled: [],
    };

    // Build a set of shared_task_ids that are already represented in local tasks
    // This ensures we don't show duplicates when a task exists in both
    // the local tasks table (with is_remote=true) AND the shared_tasks table
    const referencedSharedIds = new Set(
      Object.values(localTasksById)
        .map((task) => task.shared_task_id)
        .filter((id): id is string => Boolean(id))
    );

    Object.values(sharedTasksById).forEach((sharedTask) => {
      // Skip this shared task if its ID matches a local task's shared_task_id
      // This properly deduplicates remote tasks that appear in both tables
      if (referencedSharedIds.has(sharedTask.id)) {
        return;
      }
      grouped[sharedTask.status]?.push(sharedTask);
    });

    (Object.values(grouped) as SharedTaskRecord[][]).forEach((list) => {
      list.sort(
        (a, b) =>
          new Date(b.created_at as string).getTime() -
          new Date(a.created_at as string).getTime()
      );
    });

    return grouped;
  }, [localTasksById, sharedTasksById]);

  const isLoading = !data && !error; // until first snapshot

  return {
    tasks,
    tasksById,
    tasksByStatus,
    sharedTasksById,
    sharedOnlyByStatus,
    isLoading,
    isConnected,
    error,
  };
};

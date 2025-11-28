import { useCallback, useMemo } from 'react';
import { useJsonPatchWsStream } from './useJsonPatchWsStream';
import { useProject } from '@/contexts/ProjectContext';
import { useLiveQuery, eq, isNull } from '@tanstack/react-db';
import { sharedTasksCollection } from '@/lib/electric/sharedTasksCollection';
import type {
  SharedTask,
  TaskStatus,
  TaskWithAttemptStatus,
} from 'shared/types';

const statusMap: Record<string, TaskStatus> = {
  todo: 'todo',
  'in-progress': 'inprogress',
  inprogress: 'inprogress',
  'in-review': 'inreview',
  inreview: 'inreview',
  done: 'done',
  cancelled: 'cancelled',
};

const normalizeStatus = (status: string): TaskStatus =>
  statusMap[status] ?? 'todo';

export type SharedTaskRecord = Omit<SharedTask, 'version'> & {
  version: number;
  remote_project_id: string;
  last_event_seq: number | null;
  assignee_first_name?: string | null;
  assignee_last_name?: string | null;
  assignee_username?: string | null;
};

type TasksState = {
  tasks: Record<string, TaskWithAttemptStatus>;
  // shared_tasks is no longer in WS stream
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

  const endpoint = `/api/tasks/stream/ws?project_id=${encodeURIComponent(projectId)}`;

  const initialData = useCallback((): TasksState => ({ tasks: {} }), []);

  const { data, isConnected, error } = useJsonPatchWsStream(
    endpoint,
    !!projectId,
    initialData
  );

  const sharedTasksQuery = useLiveQuery(
    (q) => {
      if (!remoteProjectId) {
        return undefined;
      }
      return q
        .from({ sharedTasks: sharedTasksCollection })
        .where(({ sharedTasks }) => eq(sharedTasks.project_id, remoteProjectId))
        .where(({ sharedTasks }) => isNull(sharedTasks.deleted_at));
    },
    [remoteProjectId]
  );

  const sharedTasksList = sharedTasksQuery.data ?? [];

  const localTasksById = useMemo(() => data?.tasks ?? {}, [data?.tasks]);

  const sharedTasksById = useMemo(() => {
    if (!sharedTasksList) return {};
    const map: Record<string, SharedTaskRecord> = {};
    const list = Array.isArray(sharedTasksList) ? sharedTasksList : [];
    for (const task of list) {
      const enriched = task as SharedTask & Partial<SharedTaskRecord>;
      const normalizedStatus = normalizeStatus(String(task.status));
      map[task.id] = {
        ...task,
        status: normalizedStatus,
        version: Number(task.version),
        remote_project_id: task.project_id,
        last_event_seq: null,
        assignee_first_name: enriched.assignee_first_name ?? null,
        assignee_last_name: enriched.assignee_last_name ?? null,
        assignee_username: enriched.assignee_username ?? null,
      };
    }
    return map;
  }, [sharedTasksList]);

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

    const referencedSharedIds = new Set(
      Object.values(localTasksById)
        .map((task) => task.shared_task_id)
        .filter((id): id is string => Boolean(id))
    );

    Object.values(sharedTasksById).forEach((sharedTask) => {
      const hasLocal =
        Boolean(localTasksById[sharedTask.id]) ||
        referencedSharedIds.has(sharedTask.id);

      if (hasLocal) {
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

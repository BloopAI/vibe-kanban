import { useCallback, useMemo } from 'react';
import { useJsonPatchWsStream } from './useJsonPatchWsStream';
import type { TaskWithAttemptStatus } from 'shared/types';

type SharedTaskRecord = {
  id: string;
  organization_id: string;
  title: string;
  description: string | null;
  status: TaskWithAttemptStatus['status'];
  assignee_member_id: string | null;
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
    const merged: Record<string, TaskWithAttemptStatus> = {
      ...localTasksById,
    };

    const claimedSharedTaskIds = new Set(
      Object.values(localTasksById)
        .map((task) => task.shared_task_id)
        .filter((id): id is string => Boolean(id))
    );

    Object.values(sharedTasksById).forEach((sharedTask: SharedTaskRecord) => {
      if (claimedSharedTaskIds.has(sharedTask.id)) {
        return;
      }
      merged[sharedTask.id] = convertSharedTask(sharedTask);
    });

    const sorted = Object.values(merged).sort(
      (a, b) =>
        new Date(b.created_at as string).getTime() -
        new Date(a.created_at as string).getTime()
    );

    return { tasks: sorted, tasksById: merged };
  }, [localTasksById, sharedTasksById]);

  const isLoading = !data && !error; // until first snapshot

  return { tasks, tasksById, isLoading, isConnected, error };
};

function convertSharedTask(task: SharedTaskRecord): TaskWithAttemptStatus {
  return {
    id: task.id,
    project_id: task.organization_id,
    title: task.title,
    description: task.description ?? null,
    status: task.status,
    parent_task_attempt: null,
    shared_task_id: null,
    created_at: toIsoString(task.created_at),
    updated_at: toIsoString(task.updated_at),
    has_in_progress_attempt: false,
    has_merged_attempt: false,
    last_attempt_failed: false,
    executor: 'shared',
  };
}

function toIsoString(value: Date | string): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return new Date(value).toISOString();
}

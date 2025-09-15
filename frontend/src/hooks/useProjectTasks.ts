import { useCallback } from 'react';
import { useJsonPatchStream } from './useJsonPatchStream';
import { useJsonPatchWsStream } from './useJsonPatchWsStream';
import type { TaskWithAttemptStatus } from 'shared/types';

type TasksState = {
  tasks: Record<string, TaskWithAttemptStatus>;
};

type Transport = 'sse' | 'ws';

interface UseProjectTasksResult {
  tasks: TaskWithAttemptStatus[];
  tasksById: Record<string, TaskWithAttemptStatus>;
  isLoading: boolean;
  isConnected: boolean;
  error: string | null;
}

/**
 * Stream tasks for a project via SSE or WebSocket (JSON Patch) and expose as array + map.
 * Server sends initial snapshot: replace /tasks with an object keyed by id.
 * Live updates arrive at /tasks/<id> via add/replace/remove operations.
 */
export const useProjectTasks = (
  projectId: string,
  transport: Transport = 'ws' // Default to WebSocket, can be overridden
): UseProjectTasksResult => {
  const baseEndpoint = `/api/tasks/stream`;
  const endpoint = transport === 'ws'
    ? `${baseEndpoint}/ws?project_id=${encodeURIComponent(projectId)}`
    : `${baseEndpoint}?project_id=${encodeURIComponent(projectId)}`;

  const initialData = useCallback((): TasksState => ({ tasks: {} }), []);

  // Choose the appropriate hook based on transport
  const hook = transport === 'ws' ? useJsonPatchWsStream : useJsonPatchStream;
  const { data, isConnected, error } = hook(
    endpoint,
    !!projectId,
    initialData
  );

  const tasksById = data?.tasks ?? {};
  const tasks = Object.values(tasksById).sort(
    (a, b) =>
      new Date(b.created_at as unknown as string).getTime() -
      new Date(a.created_at as unknown as string).getTime()
  );
  const isLoading = !data && !error; // until first snapshot

  return { tasks, tasksById, isLoading, isConnected, error };
};

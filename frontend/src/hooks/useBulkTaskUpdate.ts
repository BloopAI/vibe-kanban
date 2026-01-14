import { useMutation, useQueryClient } from '@tanstack/react-query';
import { tasksApi } from '@/lib/api';
import { taskKeys } from './useTask';
import type { TaskPriority, Task } from 'shared/types';

export interface PriorityUpdate {
  taskId: string;
  priority: TaskPriority;
}

/**
 * Hook for bulk updating task priorities.
 * Executes all updates in parallel and invalidates queries on success.
 */
export function useBulkTaskUpdate() {
  const queryClient = useQueryClient();

  const updatePriorities = useMutation({
    mutationFn: async (updates: PriorityUpdate[]): Promise<Task[]> => {
      // Execute all updates in parallel
      const results = await Promise.all(
        updates.map(({ taskId, priority }) =>
          tasksApi.update(taskId, {
            title: null,
            description: null,
            status: null,
            parent_workspace_id: null,
            image_ids: null,
            priority,
            due_date: null,
            labels: null,
          })
        )
      );
      return results;
    },
    onSuccess: (updatedTasks: Task[]) => {
      // Invalidate the task list
      queryClient.invalidateQueries({ queryKey: taskKeys.all });
      // Also invalidate each individual task query
      for (const task of updatedTasks) {
        queryClient.invalidateQueries({ queryKey: taskKeys.byId(task.id) });
      }
    },
    onError: (err) => {
      console.error('Failed to bulk update task priorities:', err);
    },
  });

  return {
    updatePriorities,
    isUpdating: updatePriorities.isPending,
  };
}

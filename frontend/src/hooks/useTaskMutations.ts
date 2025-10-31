import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigateWithSearch } from '@/hooks';
import { tasksApi } from '@/lib/api';
import { paths } from '@/lib/paths';
import { taskChildrenKeys } from '@/hooks/useTaskChildren';
import type {
  CreateTask,
  CreateAndStartTaskRequest,
  Task,
  TaskWithAttemptStatus,
  UpdateTask,
} from 'shared/types';

export function useTaskMutations(projectId?: string) {
  const queryClient = useQueryClient();
  const navigate = useNavigateWithSearch();

  const invalidateQueries = (taskId?: string) => {
    queryClient.invalidateQueries({ queryKey: ['tasks', projectId] });
    if (taskId) {
      queryClient.invalidateQueries({ queryKey: ['task', taskId] });
    }
  };

  const createTask = useMutation({
    mutationFn: (data: CreateTask) => tasksApi.create(data),
    onSuccess: (createdTask: Task) => {
      invalidateQueries();
      // Invalidate parent's children cache if this is a subtask
      if (createdTask.parent_task_attempt) {
        queryClient.invalidateQueries({
          queryKey: taskChildrenKeys.byAttempt(createdTask.parent_task_attempt),
        });
      }
      if (projectId) {
        navigate(`${paths.task(projectId, createdTask.id)}/attempts/latest`);
      }
    },
    onError: (err) => {
      console.error('Failed to create task:', err);
    },
  });

  const createAndStart = useMutation({
    mutationFn: (data: CreateAndStartTaskRequest) =>
      tasksApi.createAndStart(data),
    onSuccess: (createdTask: TaskWithAttemptStatus) => {
      invalidateQueries();
      // Invalidate parent's children cache if this is a subtask
      if ((createdTask as any).parent_task_attempt) {
        queryClient.invalidateQueries({
          queryKey: taskChildrenKeys.byAttempt(
            (createdTask as any).parent_task_attempt
          ),
        });
      }
      if (projectId) {
        navigate(`${paths.task(projectId, createdTask.id)}/attempts/latest`);
      }
    },
    onError: (err) => {
      console.error('Failed to create and start task:', err);
    },
  });

  const updateTask = useMutation({
    mutationFn: ({ taskId, data }: { taskId: string; data: UpdateTask }) =>
      tasksApi.update(taskId, data),
    onSuccess: (updatedTask: Task) => {
      invalidateQueries(updatedTask.id);
    },
    onError: (err) => {
      console.error('Failed to update task:', err);
    },
  });

  const deleteTask = useMutation({
    mutationFn: (taskId: string) => tasksApi.delete(taskId),
    onSuccess: (_: unknown, taskId: string) => {
      invalidateQueries(taskId);
      // Remove single-task cache entry to avoid stale data flashes
      queryClient.removeQueries({ queryKey: ['task', taskId], exact: true });
      // Invalidate all task children caches (safe approach since we don't know parent)
      queryClient.invalidateQueries({ queryKey: taskChildrenKeys.all });
    },
    onError: (err) => {
      console.error('Failed to delete task:', err);
    },
  });

  return {
    createTask,
    createAndStart,
    updateTask,
    deleteTask,
  };
}

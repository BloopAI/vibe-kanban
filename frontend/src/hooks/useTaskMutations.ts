import { useMutation, useQueryClient } from '@tanstack/react-query';
import { tasksApi } from '@/lib/api';
import { useTaskViewManager } from '@/hooks/useTaskViewManager';
import type {
  CreateTask,
  CreateAndStartTaskRequest,
  Task,
  TaskWithAttemptStatus,
  UpdateTask,
} from 'shared/types';

export function useTaskMutations(projectId?: string) {
  const queryClient = useQueryClient();
  const { navigateToTask } = useTaskViewManager();

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
      if (projectId) {
        navigateToTask(projectId, createdTask.id);
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
      if (projectId) {
        navigateToTask(projectId, createdTask.id);
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

  return {
    createTask,
    createAndStart,
    updateTask,
  };
}

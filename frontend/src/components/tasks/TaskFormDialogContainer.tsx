import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { TaskFormDialog } from './TaskFormDialog';
import { useTaskDialog } from '@/contexts/task-dialog-context';
import { useProject } from '@/contexts/project-context';
import { tasksApi } from '@/lib/api';
import type {
  TaskStatus,
  CreateTask,
  CreateAndStartTaskRequest,
  UpdateTask,
  ExecutorProfileId,
} from 'shared/types';
import { useUserSystem } from '@/components/config-provider';

/**
 * Container component that bridges the TaskDialogContext with TaskFormDialog
 * Handles API calls while keeping the context UI-only as recommended by Oracle
 */
export function TaskFormDialogContainer() {
  const { dialogState, close, handleSuccess } = useTaskDialog();
  const { projectId } = useProject();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { system } = useUserSystem();

  // React Query mutations
  const createTaskMutation = useMutation({
    mutationFn: (data: CreateTask) => tasksApi.create(data),
    onSuccess: (createdTask) => {
      // Invalidate and refetch tasks list
      queryClient.invalidateQueries({ queryKey: ['tasks', projectId] });

      // Navigate to the new task
      navigate(`/projects/${projectId}/tasks/${createdTask.id}`, {
        replace: true,
      });

      handleSuccess(createdTask);
    },
    onError: (err) => {
      console.error('Failed to create task:', err);
    },
  });

  const createAndStartTaskMutation = useMutation({
    mutationFn: (data: CreateAndStartTaskRequest) =>
      tasksApi.createAndStart(data),
    onSuccess: (result) => {
      // Invalidate and refetch tasks list
      queryClient.invalidateQueries({ queryKey: ['tasks', projectId] });

      // Navigate to the new task
      navigate(`/projects/${projectId}/tasks/${result.id}`, {
        replace: true,
      });

      handleSuccess(result);
    },
    onError: (err) => {
      console.error('Failed to create and start task:', err);
    },
  });

  const updateTaskMutation = useMutation({
    mutationFn: ({ taskId, data }: { taskId: string; data: UpdateTask }) =>
      tasksApi.update(taskId, data),
    onSuccess: (updatedTask) => {
      // Invalidate and refetch tasks list and individual task
      queryClient.invalidateQueries({ queryKey: ['tasks', projectId] });
      queryClient.invalidateQueries({ queryKey: ['task', updatedTask.id] });

      handleSuccess(updatedTask);
    },
    onError: (err) => {
      console.error('Failed to update task:', err);
    },
  });

  const handleCreateTask = useCallback(
    async (title: string, description: string, imageIds?: string[]) => {
      if (!projectId) return;

      createTaskMutation.mutate({
        project_id: projectId,
        title,
        description: description || null,
        parent_task_attempt: null,
        image_ids: imageIds || null,
      });
    },
    [projectId, createTaskMutation]
  );

  const handleCreateAndStartTask = useCallback(
    async (
      title: string,
      description: string,
      imageIds?: string[],
      baseBranch?: string,
      executorProfile?: ExecutorProfileId
    ) => {
      if (!projectId || !baseBranch) return;

      // Use provided executor profile or fall back to config default
      const finalExecutorProfile =
        executorProfile || system.config?.executor_profile;
      if (!finalExecutorProfile) return;

      createAndStartTaskMutation.mutate({
        task: {
          project_id: projectId,
          title,
          description: description || null,
          parent_task_attempt: null,
          image_ids: imageIds || null,
        },
        executor_profile_id: finalExecutorProfile,
        base_branch: baseBranch,
      });
    },
    [projectId, system, createAndStartTaskMutation]
  );

  const handleUpdateTask = useCallback(
    async (
      title: string,
      description: string,
      status: TaskStatus,
      imageIds?: string[]
    ) => {
      if (!dialogState.task) return;

      updateTaskMutation.mutate({
        taskId: dialogState.task.id,
        data: {
          title,
          description: description || null,
          status,
          parent_task_attempt: null,
          image_ids: imageIds || null,
        },
      });
    },
    [dialogState.task, updateTaskMutation]
  );

  return (
    <TaskFormDialog
      isOpen={dialogState.isOpen}
      onOpenChange={(open) => !open && close()}
      task={dialogState.task}
      projectId={projectId || undefined}
      initialTemplate={dialogState.initialTemplate}
      initialTask={dialogState.initialTask}
      onCreateTask={handleCreateTask}
      onCreateAndStartTask={handleCreateAndStartTask}
      onUpdateTask={handleUpdateTask}
    />
  );
}

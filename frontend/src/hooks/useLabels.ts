import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { labelsApi, tasksApi } from '@/lib/api';
import type { CreateLabel, UpdateLabel } from 'shared/types';

export function useProjectLabels(projectId: string | undefined) {
  return useQuery({
    queryKey: ['labels', projectId],
    queryFn: () => (projectId ? labelsApi.list(projectId) : []),
    enabled: !!projectId,
  });
}

export function useTaskLabels(taskId: string | undefined) {
  return useQuery({
    queryKey: ['task-labels', taskId],
    queryFn: () => (taskId ? labelsApi.getTaskLabels(taskId) : []),
    enabled: !!taskId,
  });
}

export function useCreateLabel(projectId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Omit<CreateLabel, 'project_id'>) =>
      projectId
        ? labelsApi.create(projectId, { ...data, project_id: projectId })
        : Promise.reject('No project ID'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['labels', projectId] });
    },
  });
}

export function useUpdateLabel(projectId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ labelId, data }: { labelId: string; data: UpdateLabel }) =>
      projectId
        ? labelsApi.update(projectId, labelId, data)
        : Promise.reject('No project ID'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['labels', projectId] });
    },
  });
}

export function useDeleteLabel(projectId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (labelId: string) =>
      projectId
        ? labelsApi.delete(projectId, labelId)
        : Promise.reject('No project ID'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['labels', projectId] });
    },
  });
}

// Task Dependencies Hooks
export function useTaskDependencies(taskId: string | undefined) {
  return useQuery({
    queryKey: ['task-dependencies', taskId],
    queryFn: () => (taskId ? tasksApi.getDependencies(taskId) : []),
    enabled: !!taskId,
  });
}

export function useSetTaskDependencies(taskId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (dependencyIds: string[]) =>
      taskId
        ? tasksApi.setDependencies(taskId, dependencyIds)
        : Promise.reject('No task ID'),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['task-dependencies', taskId],
      });
    },
  });
}

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { discoveryApi, feedbackApi } from '@/lib/api';
import type { DiscoveryItem, CreateDiscoveryItem, UpdateDiscoveryItem, FeedbackEntry, CreateFeedbackEntry } from 'shared/types';

// Query keys
export const discoveryKeys = {
  all: ['discovery'] as const,
  byProject: (projectId: string | undefined) => ['discovery', 'project', projectId] as const,
  byId: (id: string | undefined) => ['discovery', id] as const,
  forTask: (taskId: string | undefined) => ['discovery', 'task', taskId] as const,
};

export const feedbackKeys = {
  all: ['feedback'] as const,
  forTask: (taskId: string | undefined) => ['feedback', 'task', taskId] as const,
  forDiscoveryItem: (id: string | undefined) => ['feedback', 'discovery', id] as const,
};

// Discovery hooks
export function useDiscoveryItems(projectId?: string) {
  return useQuery<DiscoveryItem[]>({
    queryKey: discoveryKeys.byProject(projectId),
    queryFn: () => discoveryApi.getByProject(projectId!),
    enabled: !!projectId,
  });
}

export function useDiscoveryItem(id?: string) {
  return useQuery<DiscoveryItem>({
    queryKey: discoveryKeys.byId(id),
    queryFn: () => discoveryApi.getById(id!),
    enabled: !!id,
  });
}

export function useTaskDiscoveryItem(taskId?: string) {
  return useQuery<DiscoveryItem | null>({
    queryKey: discoveryKeys.forTask(taskId),
    queryFn: () => discoveryApi.getForTask(taskId!),
    enabled: !!taskId,
  });
}

export function useCreateDiscoveryItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateDiscoveryItem) => discoveryApi.create(data),
    onSuccess: (item) => {
      queryClient.invalidateQueries({ queryKey: discoveryKeys.byProject(item.project_id) });
    },
  });
}

export function useUpdateDiscoveryItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateDiscoveryItem }) =>
      discoveryApi.update(id, data),
    onSuccess: (item) => {
      queryClient.invalidateQueries({ queryKey: discoveryKeys.byId(item.id) });
      queryClient.invalidateQueries({ queryKey: discoveryKeys.byProject(item.project_id) });
    },
  });
}

export function useDeleteDiscoveryItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => discoveryApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: discoveryKeys.all });
    },
  });
}

export function usePromoteToTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (discoveryItemId: string) => discoveryApi.promoteToTask(discoveryItemId),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: discoveryKeys.byId(result.discovery_item.id) });
      queryClient.invalidateQueries({ queryKey: discoveryKeys.byProject(result.discovery_item.project_id) });
      // Also invalidate tasks to show the new task
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

// Feedback hooks
export function useTaskFeedback(taskId?: string) {
  return useQuery<FeedbackEntry[]>({
    queryKey: feedbackKeys.forTask(taskId),
    queryFn: () => feedbackApi.getForTask(taskId!),
    enabled: !!taskId,
  });
}

export function useDiscoveryItemFeedback(discoveryItemId?: string) {
  return useQuery<FeedbackEntry[]>({
    queryKey: feedbackKeys.forDiscoveryItem(discoveryItemId),
    queryFn: () => feedbackApi.getForDiscoveryItem(discoveryItemId!),
    enabled: !!discoveryItemId,
  });
}

export function useCreateFeedback() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateFeedbackEntry) => feedbackApi.create(data),
    onSuccess: (entry) => {
      if (entry.task_id) {
        queryClient.invalidateQueries({ queryKey: feedbackKeys.forTask(entry.task_id) });
      }
      if (entry.discovery_item_id) {
        queryClient.invalidateQueries({ queryKey: feedbackKeys.forDiscoveryItem(entry.discovery_item_id) });
      }
    },
  });
}

export function useDeleteFeedback() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => feedbackApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: feedbackKeys.all });
    },
  });
}

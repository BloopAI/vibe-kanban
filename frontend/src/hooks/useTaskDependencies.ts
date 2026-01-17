import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { dependenciesApi, ApiError } from '@/lib/api';
import type { TaskDependency } from 'shared/types';

export const dependencyKeys = {
  all: ['dependencies'] as const,
  byProject: (projectId: string) =>
    [...dependencyKeys.all, 'project', projectId] as const,
};

export function useTaskDependencies(projectId: string) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: dependencyKeys.byProject(projectId),
    queryFn: () => dependenciesApi.getByProject(projectId),
    enabled: !!projectId,
  });

  const invalidateDependencies = () => {
    queryClient.invalidateQueries({
      queryKey: dependencyKeys.byProject(projectId),
    });
  };

  const createDependency = useMutation({
    mutationFn: (data: { task_id: string; depends_on_task_id: string }) =>
      dependenciesApi.create(projectId, data),
    onSuccess: () => {
      invalidateDependencies();
    },
    onError: (error: ApiError) => {
      // Handle specific error cases
      if (error.status === 409) {
        // Conflict - circular dependency or already exists
        console.error(
          'Cannot create dependency: This would create a circular dependency or the dependency already exists.',
          error
        );
        window.alert(
          'Cannot create dependency: This would create a circular dependency or the dependency already exists.'
        );
      } else {
        console.error('Failed to create dependency:', error.message);
        window.alert(`Failed to create dependency: ${error.message}`);
      }
    },
  });

  const deleteDependency = useMutation({
    mutationFn: (dependencyId: string) => dependenciesApi.delete(dependencyId),
    onSuccess: () => {
      invalidateDependencies();
    },
    onError: (error: ApiError) => {
      console.error('Failed to delete dependency:', error.message);
      window.alert(`Failed to delete dependency: ${error.message}`);
    },
  });

  return {
    dependencies: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    createDependency,
    deleteDependency,
    invalidateDependencies,
  };
}

// Helper to get dependency by edge ID (format: "dep-{dependency_id}")
export function getDependencyIdFromEdgeId(edgeId: string): string | null {
  if (edgeId.startsWith('dep-')) {
    return edgeId.slice(4);
  }
  return null;
}

// Helper to create edge ID from dependency
export function createEdgeIdFromDependency(dependency: TaskDependency): string {
  return `dep-${dependency.id}`;
}

import { useQuery } from '@tanstack/react-query';
import { tasksApi } from '@/lib/api';
import type { TaskWithProjectInfo } from 'shared/types';

export interface UseAllTasksResult {
  tasks: TaskWithProjectInfo[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Hook to fetch all tasks across all projects.
 * Used for the "All Projects" unified Kanban view.
 */
export const useAllTasks = (): UseAllTasksResult => {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['allTasks'],
    queryFn: async () => {
      const response = await tasksApi.getAll();
      return response.tasks;
    },
    refetchInterval: 10000, // Refetch every 10 seconds for live updates
    staleTime: 5000,
  });

  return {
    tasks: data ?? [],
    isLoading,
    error: error as Error | null,
    refetch,
  };
};

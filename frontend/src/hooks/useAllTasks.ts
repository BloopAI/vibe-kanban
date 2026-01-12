import { useCallback, useEffect, useMemo, useState } from 'react';
import { useProjects } from '@/hooks/useProjects';
import type {
  Task,
  TaskWithAttemptStatus,
  TaskStatus,
  Project,
} from 'shared/types';

export interface TaskWithProject extends TaskWithAttemptStatus {
  project: Project;
}

export interface UseAllTasksResult {
  tasks: TaskWithProject[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
  tasksByStatus: Record<TaskStatus, TaskWithProject[]>;
  filteredTasks: TaskWithProject[];
}

/**
 * Fetch all tasks from all projects
 * This hook makes individual requests to each project's tasks endpoint
 * and combines them into a single list with project information
 */
export function useAllTasks(
  filters?: {
    status?: TaskStatus;
    searchQuery?: string;
    projectId?: string;
  }
): UseAllTasksResult {
  const { projects, isLoading: projectsLoading } = useProjects();
  const [tasks, setTasks] = useState<TaskWithProject[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refetchTrigger, setRefetchTrigger] = useState(0);

  const fetchAllTasks = useCallback(async () => {
    if (projects.length === 0) {
      setTasks([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const taskPromises = projects.map(async (project) => {
        try {
          const response = await fetch(
            `/api/tasks?project_id=${encodeURIComponent(project.id)}`
          );
          if (!response.ok) {
            console.error(`Failed to fetch tasks for project ${project.id}`);
            return [];
          }
          const apiResponse = await response.json();
          const projectTasks: Task[] = apiResponse.data || [];
          return projectTasks.map((task) => ({
            ...task,
            has_in_progress_attempt: false,
            last_attempt_failed: false,
            executor: 'local',
            project,
          }));
        } catch (err) {
          console.error(`Error fetching tasks for project ${project.id}:`, err);
          return [];
        }
      });

      const results = await Promise.all(taskPromises);
      const allTasks = results.flat();

      setTasks(allTasks);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch tasks');
    } finally {
      setIsLoading(false);
    }
  }, [projects]);

  useEffect(() => {
    fetchAllTasks();
  }, [fetchAllTasks, refetchTrigger]);

  const refetch = useCallback(() => {
    setRefetchTrigger((prev) => prev + 1);
  }, []);

  const tasksByStatus = useMemo(() => {
    const grouped: Record<TaskStatus, TaskWithProject[]> = {
      todo: [],
      inprogress: [],
      inreview: [],
      done: [],
      cancelled: [],
    };

    tasks.forEach((task) => {
      grouped[task.status]?.push(task);
    });

    return grouped;
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    let result = tasks;

    if (filters?.status) {
      result = result.filter((task) => task.status === filters.status);
    }

    if (filters?.projectId) {
      result = result.filter((task) => task.project_id === filters.projectId);
    }

    if (filters?.searchQuery) {
      const query = filters.searchQuery.toLowerCase();
      result = result.filter(
        (task) =>
          task.title.toLowerCase().includes(query) ||
          (task.description?.toLowerCase().includes(query) ?? false)
      );
    }

    return result;
  }, [tasks, filters]);

  return {
    tasks,
    isLoading: isLoading || projectsLoading,
    error,
    refetch,
    tasksByStatus,
    filteredTasks,
  };
}

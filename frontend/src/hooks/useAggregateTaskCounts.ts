import {
  createContext,
  useContext,
  useCallback,
  useMemo,
  useState,
  useEffect,
} from 'react';
import type { TaskStatus } from 'shared/types';

export type AggregateTaskCounts = Record<TaskStatus, number>;

interface AggregateTaskCountsContextValue {
  counts: AggregateTaskCounts;
  totalCount: number;
  isLoading: boolean;
  registerProject: (
    projectId: string,
    counts: AggregateTaskCounts,
    loading: boolean
  ) => void;
  unregisterProject: (projectId: string) => void;
}

const defaultCounts: AggregateTaskCounts = {
  todo: 0,
  inprogress: 0,
  inreview: 0,
  done: 0,
  cancelled: 0,
};

const AggregateTaskCountsContext =
  createContext<AggregateTaskCountsContextValue>({
    counts: defaultCounts,
    totalCount: 0,
    isLoading: false,
    registerProject: () => {},
    unregisterProject: () => {},
  });

interface ProjectCounts {
  counts: AggregateTaskCounts;
  loading: boolean;
}

export function useAggregateTaskCountsProvider() {
  const [projectCounts, setProjectCounts] = useState<
    Map<string, ProjectCounts>
  >(new Map());

  const registerProject = useCallback(
    (projectId: string, counts: AggregateTaskCounts, loading: boolean) => {
      setProjectCounts((prev) => {
        const next = new Map(prev);
        next.set(projectId, { counts, loading });
        return next;
      });
    },
    []
  );

  const unregisterProject = useCallback((projectId: string) => {
    setProjectCounts((prev) => {
      const next = new Map(prev);
      next.delete(projectId);
      return next;
    });
  }, []);

  const { counts, totalCount, isLoading } = useMemo(() => {
    const aggregated: AggregateTaskCounts = {
      todo: 0,
      inprogress: 0,
      inreview: 0,
      done: 0,
      cancelled: 0,
    };

    let total = 0;
    let anyLoading = false;

    for (const { counts: projectCts, loading } of projectCounts.values()) {
      if (loading) {
        anyLoading = true;
      }
      for (const status of Object.keys(aggregated) as TaskStatus[]) {
        const count = projectCts[status] ?? 0;
        aggregated[status] += count;
        total += count;
      }
    }

    return {
      counts: aggregated,
      totalCount: total,
      isLoading: anyLoading,
    };
  }, [projectCounts]);

  const contextValue = useMemo(
    () => ({
      counts,
      totalCount,
      isLoading,
      registerProject,
      unregisterProject,
    }),
    [counts, totalCount, isLoading, registerProject, unregisterProject]
  );

  return {
    Provider: AggregateTaskCountsContext.Provider,
    value: contextValue,
  };
}

export function useAggregateTaskCounts() {
  return useContext(AggregateTaskCountsContext);
}

/**
 * Hook to register a project's task counts with the aggregate context.
 * Call this from each ProjectSwimlane to report its counts.
 */
export function useRegisterProjectCounts(
  projectId: string,
  tasksByStatus: Record<TaskStatus, unknown[]>,
  isLoading: boolean
) {
  const { registerProject, unregisterProject } = useContext(
    AggregateTaskCountsContext
  );

  const counts = useMemo(
    (): AggregateTaskCounts => ({
      todo: tasksByStatus.todo?.length ?? 0,
      inprogress: tasksByStatus.inprogress?.length ?? 0,
      inreview: tasksByStatus.inreview?.length ?? 0,
      done: tasksByStatus.done?.length ?? 0,
      cancelled: tasksByStatus.cancelled?.length ?? 0,
    }),
    [tasksByStatus]
  );

  useEffect(() => {
    registerProject(projectId, counts, isLoading);
    return () => unregisterProject(projectId);
  }, [projectId, counts, isLoading, registerProject, unregisterProject]);
}

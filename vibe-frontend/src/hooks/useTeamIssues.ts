import { useState, useEffect, useCallback, useMemo } from 'react';
import { teamsApi } from '@/lib/api';
import type { TaskWithAttemptStatus, TaskStatus } from 'shared/types';

export interface UseTeamIssuesResult {
  issues: TaskWithAttemptStatus[];
  issuesById: Record<string, TaskWithAttemptStatus>;
  issuesByStatus: Record<TaskStatus, TaskWithAttemptStatus[]>;
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

export function useTeamIssues(teamId: string | undefined): UseTeamIssuesResult {
  const [issues, setIssues] = useState<TaskWithAttemptStatus[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    if (!teamId) {
      setIssues([]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const data = await teamsApi.getIssues(teamId);
      setIssues(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch team issues'));
    } finally {
      setIsLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const issuesById = useMemo(() => {
    return issues.reduce(
      (acc, issue) => {
        acc[issue.id] = issue;
        return acc;
      },
      {} as Record<string, TaskWithAttemptStatus>
    );
  }, [issues]);

  const issuesByStatus = useMemo(() => {
    const byStatus: Record<TaskStatus, TaskWithAttemptStatus[]> = {
      todo: [],
      inprogress: [],
      inreview: [],
      done: [],
      cancelled: [],
    };

    issues.forEach((issue) => {
      byStatus[issue.status]?.push(issue);
    });

    // Sort each status by created_at descending
    Object.values(byStatus).forEach((list) => {
      list.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    });

    return byStatus;
  }, [issues]);

  return {
    issues,
    issuesById,
    issuesByStatus,
    isLoading,
    error,
    refresh,
  };
}

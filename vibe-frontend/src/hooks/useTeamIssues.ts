import { useMemo, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { teamsApi } from '@/lib/api';
import type { TaskWithAttemptStatus, TaskStatus } from 'shared/types';

// Helper to check if error is a rate limit (429)
function isRateLimitError(error: unknown): boolean {
  if (error instanceof Error) {
    return error.message.includes('429') || error.message.includes('Too Many Requests');
  }
  return false;
}

// Query key factory for consistent caching
export const teamIssuesKeys = {
  all: ['teamIssues'] as const,
  team: (teamId: string) => [...teamIssuesKeys.all, teamId] as const,
};

export interface UseTeamIssuesResult {
  issues: TaskWithAttemptStatus[];
  issuesById: Record<string, TaskWithAttemptStatus>;
  issuesByStatus: Record<TaskStatus, TaskWithAttemptStatus[]>;
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

/**
 * Hook for fetching team issues with TanStack Query for request deduplication.
 * Multiple components using this hook with the same teamId will share the cache
 * and NOT make duplicate API requests.
 */
export function useTeamIssues(teamId: string | undefined): UseTeamIssuesResult {
  const queryClient = useQueryClient();

  const { data: issues = [], isLoading, error } = useQuery<TaskWithAttemptStatus[]>({
    queryKey: teamIssuesKeys.team(teamId!),
    queryFn: () => teamsApi.getIssues(teamId!),
    enabled: !!teamId,
    staleTime: 5 * 60 * 1000, // 5 minutes - issues don't change frequently
    gcTime: 15 * 60 * 1000, // 15 minutes cache retention
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: (failureCount, error) => {
      // Never retry rate limit errors - this amplifies the problem
      if (isRateLimitError(error)) return false;
      return failureCount < 1;
    },
    retryDelay: 60000, // 60 seconds - respect rate limit window
  });

  const refresh = useCallback(async () => {
    if (!teamId) return;
    await queryClient.invalidateQueries({ queryKey: teamIssuesKeys.team(teamId) });
  }, [teamId, queryClient]);

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
    error: error ? (error instanceof Error ? error : new Error('Failed to fetch team issues')) : null,
    refresh,
  };
}

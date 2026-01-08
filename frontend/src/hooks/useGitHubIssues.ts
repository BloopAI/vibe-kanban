import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { projectsApi } from '@/lib/api';
import { taskKeys } from './useTask';
import type { ImportGitHubIssuesRequest } from 'shared/types';

export const githubIssuesKeys = {
  all: ['github-issues'] as const,
  byRepo: (projectId: string, repoId: string, state: string) =>
    [...githubIssuesKeys.all, projectId, repoId, state] as const,
};

export function useGitHubIssues(
  projectId: string,
  repoId: string | undefined,
  state: string = 'open',
  enabled: boolean = true
) {
  return useQuery({
    queryKey: githubIssuesKeys.byRepo(projectId, repoId || '', state),
    queryFn: () => projectsApi.listGitHubIssues(projectId, repoId!, state),
    enabled: enabled && !!repoId,
  });
}

export function useImportGitHubIssues(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: ImportGitHubIssuesRequest) =>
      projectsApi.importGitHubIssues(projectId, data),
    onSuccess: () => {
      // Invalidate tasks to show newly imported issues
      queryClient.invalidateQueries({ queryKey: taskKeys.all });
    },
    onError: (err) => {
      console.error('Failed to import GitHub issues:', err);
    },
  });
}

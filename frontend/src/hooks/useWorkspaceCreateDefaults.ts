import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ExecutorConfig, RepoWithTargetBranch } from 'shared/types';
import { attemptsApi } from '@/lib/api';
import { useExecutionProcesses } from '@/hooks/useExecutionProcesses';
import { getLatestConfigFromProcesses } from '@/utils/executor';

interface UseWorkspaceCreateDefaultsOptions {
  sourceWorkspaceId: string | null;
  enabled: boolean;
}

interface WorkspaceCreateDefaultsData {
  repos: RepoWithTargetBranch[];
  sourceSessionId: string | undefined;
  sourceSessionExecutor: ExecutorConfig['executor'] | null;
}

interface UseWorkspaceCreateDefaultsResult {
  preferredRepos: RepoWithTargetBranch[];
  preferredExecutorConfig: ExecutorConfig | null;
}

export function useWorkspaceCreateDefaults({
  sourceWorkspaceId,
  enabled,
}: UseWorkspaceCreateDefaultsOptions): UseWorkspaceCreateDefaultsResult {
  const { data } = useQuery<WorkspaceCreateDefaultsData>({
    queryKey: ['workspaceCreateDefaults', sourceWorkspaceId],
    enabled: enabled && !!sourceWorkspaceId,
    queryFn: async () => {
      const [repos, workspaceWithSession] = await Promise.all([
        attemptsApi.getRepos(sourceWorkspaceId!),
        attemptsApi.getWithSession(sourceWorkspaceId!),
      ]);

      return {
        repos,
        sourceSessionId: workspaceWithSession.session?.id ?? undefined,
        sourceSessionExecutor:
          (workspaceWithSession.session
            ?.executor as ExecutorConfig['executor']) ?? null,
      };
    },
  });

  const { executionProcesses } = useExecutionProcesses(data?.sourceSessionId);

  const preferredExecutorConfig = useMemo(() => {
    const fromProcesses = getLatestConfigFromProcesses(executionProcesses);
    if (fromProcesses) return fromProcesses;
    if (data?.sourceSessionExecutor) {
      return { executor: data.sourceSessionExecutor };
    }
    return null;
  }, [executionProcesses, data?.sourceSessionExecutor]);

  return {
    preferredRepos: data?.repos ?? [],
    preferredExecutorConfig,
  };
}

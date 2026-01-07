import { useQuery } from '@tanstack/react-query';
import { projectsApi } from '@/lib/api';

export function useHasDevServerScript(projectId?: string) {
  return useQuery({
    queryKey: ['hasDevServerScript', projectId],
    queryFn: async () => {
      if (!projectId) return false;

      const repos = await projectsApi.getRepositories(projectId);
      return repos.some(
        (repo) => repo.dev_server_script && repo.dev_server_script.trim() !== ''
      );
    },
    enabled: !!projectId,
  });
}

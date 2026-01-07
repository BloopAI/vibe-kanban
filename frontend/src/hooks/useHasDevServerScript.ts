import { useQuery } from '@tanstack/react-query';
import { projectsApi } from '@/lib/api';

export function useHasDevServerScript(projectId?: string) {
  return useQuery({
    queryKey: ['hasDevServerScript', projectId],
    queryFn: async () => {
      if (!projectId) return false;

      const repos = await projectsApi.getRepositories(projectId);
      if (repos.length === 0) return false;

      // Check each repo for dev_server_script
      const projectRepoPromises = repos.map((repo) =>
        projectsApi.getRepository(projectId, repo.id)
      );
      const projectRepos = await Promise.all(projectRepoPromises);

      return projectRepos.some(
        (pr) => pr.dev_server_script && pr.dev_server_script.trim() !== ''
      );
    },
    enabled: !!projectId,
  });
}

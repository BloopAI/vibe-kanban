import { useQuery } from '@tanstack/react-query';
import { projectsApi } from '@/lib/api';
import type { ProjectRepo, Repo } from 'shared/types';

// Extended ProjectRepo type with GitHub sync fields (until types are regenerated)
interface ProjectRepoWithGitHub extends ProjectRepo {
  github_issue_sync_enabled: boolean;
  github_issue_import_to_todo: boolean;
  github_issue_create_from_tasks: boolean;
}

interface ProjectRepoWithSettings extends Repo {
  projectRepo: ProjectRepoWithGitHub;
}

/**
 * Fetches project repos with their settings (including GitHub sync settings)
 */
export function useProjectRepoSettings(
  projectId: string | undefined,
  repos: Repo[],
  enabled: boolean = true
) {
  return useQuery<ProjectRepoWithSettings[]>({
    queryKey: ['projectRepoSettings', projectId, repos.map((r) => r.id)],
    queryFn: async () => {
      if (!projectId || repos.length === 0) return [];

      const settings = await Promise.all(
        repos.map(async (repo) => {
          try {
            const projectRepo = await projectsApi.getRepository(
              projectId,
              repo.id
            );
            return { ...repo, projectRepo: projectRepo as ProjectRepoWithGitHub };
          } catch {
            // If we can't fetch settings, create a default ProjectRepo object
            return {
              ...repo,
              projectRepo: {
                id: '',
                project_id: projectId,
                repo_id: repo.id,
                setup_script: null,
                cleanup_script: null,
                copy_files: null,
                parallel_setup_script: false,
                github_issue_sync_enabled: false,
                github_issue_import_to_todo: false,
                github_issue_create_from_tasks: false,
              } as ProjectRepoWithGitHub,
            };
          }
        })
      );

      return settings;
    },
    enabled: enabled && !!projectId && repos.length > 0,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

/**
 * Check if any repo in the project has GitHub issue creation enabled
 */
export function useGitHubIssueCreationEnabled(
  projectId: string | undefined,
  repos: Repo[],
  enabled: boolean = true
) {
  const { data: repoSettings, isLoading } = useProjectRepoSettings(
    projectId,
    repos,
    enabled
  );

  const repoWithIssueCreation = repoSettings?.find(
    (r) => r.projectRepo.github_issue_create_from_tasks
  );

  return {
    isEnabled: !!repoWithIssueCreation,
    repoId: repoWithIssueCreation?.id,
    isLoading,
  };
}

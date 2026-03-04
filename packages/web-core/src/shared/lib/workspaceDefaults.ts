import { attemptsApi, repoApi } from '@/shared/lib/api';
import type { Workspace } from 'shared/remote-types';
import { getValidProjectRepoDefaults } from '@/shared/hooks/useProjectRepoDefaults';

export interface WorkspaceDefaults {
  preferredRepos: Array<{ repo_id: string; target_branch: string | null }>;
}

/**
 * Fetches workspace creation defaults using a project-aware priority chain:
 * 1. Scratch project-repo defaults (if projectId provided and valid repos exist)
 * 2. Most recent workspace for the same project (if projectId provided)
 * 3. Globally most recent workspace
 * 4. null (no defaults)
 */
export async function getWorkspaceDefaults(
  remoteWorkspaces: Workspace[],
  localWorkspaceIds: Set<string>,
  projectId?: string | null
): Promise<WorkspaceDefaults | null> {
  // Priority 1: Scratch project-repo defaults
  if (projectId) {
    try {
      const allRepos = await repoApi.list();
      const availableRepoIds = new Set(allRepos.map((r) => r.id));
      const scratchDefaults = await getValidProjectRepoDefaults(
        projectId,
        availableRepoIds
      );
      if (scratchDefaults.length > 0) {
        return {
          preferredRepos: scratchDefaults.map((r) => ({
            repo_id: r.repo_id,
            target_branch: r.target_branch,
          })),
        };
      }
    } catch (err) {
      console.warn('Failed to fetch project scratch defaults:', err);
    }

    // Priority 2: Most recent workspace for the same project
    const projectRecent = remoteWorkspaces
      .filter(
        (w) =>
          w.project_id === projectId &&
          w.local_workspace_id !== null &&
          localWorkspaceIds.has(w.local_workspace_id)
      )
      .sort(
        (a, b) =>
          new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      )[0];

    if (projectRecent?.local_workspace_id) {
      try {
        const [repos] = await Promise.all([
          attemptsApi.getRepos(projectRecent.local_workspace_id),
          attemptsApi.get(projectRecent.local_workspace_id),
        ]);
        return {
          preferredRepos: repos.map((r) => ({
            repo_id: r.id,
            target_branch: r.target_branch,
          })),
        };
      } catch (err) {
        console.warn('Failed to fetch project workspace defaults:', err);
      }
    }
  }

  // Priority 3: Globally most recent workspace
  const mostRecent = remoteWorkspaces
    .filter(
      (w) =>
        w.local_workspace_id !== null &&
        localWorkspaceIds.has(w.local_workspace_id)
    )
    .sort(
      (a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    )[0];

  if (!mostRecent?.local_workspace_id) {
    return null;
  }

  try {
    const [repos] = await Promise.all([
      attemptsApi.getRepos(mostRecent.local_workspace_id),
      attemptsApi.get(mostRecent.local_workspace_id),
    ]);

    return {
      preferredRepos: repos.map((r) => ({
        repo_id: r.id,
        target_branch: r.target_branch,
      })),
    };
  } catch (err) {
    console.warn('Failed to fetch workspace defaults:', err);
    return null;
  }
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { githubApi } from '@/lib/api';
import type {
  GitHubStatusResponse,
  GitHubProject,
  GitHubLinkResponse,
  CreateGitHubLinkRequest,
  SyncResult,
  GitHubIssueMapping,
} from 'shared/types';

// Query keys for GitHub integration
export const githubQueryKeys = {
  status: ['github', 'status'] as const,
  projects: ['github', 'projects'] as const,
  orgProjects: (org: string) => ['github', 'orgProjects', org] as const,
  links: (projectId: string) => ['github', 'links', projectId] as const,
  mappings: (projectId: string, linkId: string) =>
    ['github', 'mappings', projectId, linkId] as const,
};

/**
 * Hook for checking GitHub CLI status and authentication
 */
export function useGitHubStatus() {
  return useQuery<GitHubStatusResponse>({
    queryKey: githubQueryKeys.status,
    queryFn: () => githubApi.getStatus(),
    staleTime: 30000, // Consider fresh for 30 seconds
    retry: 1,
  });
}

/**
 * Hook for fetching available GitHub Projects for the user
 */
export function useGitHubProjects(options?: { enabled?: boolean }) {
  return useQuery<GitHubProject[]>({
    queryKey: githubQueryKeys.projects,
    queryFn: () => githubApi.getProjects(),
    enabled: options?.enabled ?? true,
    staleTime: 60000, // Consider fresh for 1 minute
  });
}

/**
 * Hook for fetching GitHub Projects for an organization
 */
export function useGitHubOrgProjects(org: string, options?: { enabled?: boolean }) {
  return useQuery<GitHubProject[]>({
    queryKey: githubQueryKeys.orgProjects(org),
    queryFn: () => githubApi.getOrgProjects(org),
    enabled: (options?.enabled ?? true) && !!org,
    staleTime: 60000, // Consider fresh for 1 minute
  });
}

/**
 * Hook for fetching GitHub project links for a Vibe project
 */
export function useGitHubLinks(projectId: string, options?: { enabled?: boolean }) {
  return useQuery<GitHubLinkResponse[]>({
    queryKey: githubQueryKeys.links(projectId),
    queryFn: () => githubApi.getLinks(projectId),
    enabled: (options?.enabled ?? true) && !!projectId,
  });
}

/**
 * Hook for fetching issue mappings for a GitHub project link
 */
export function useGitHubMappings(
  projectId: string,
  linkId: string,
  options?: { enabled?: boolean }
) {
  return useQuery<GitHubIssueMapping[]>({
    queryKey: githubQueryKeys.mappings(projectId, linkId),
    queryFn: () => githubApi.getMappings(projectId, linkId),
    enabled: (options?.enabled ?? true) && !!projectId && !!linkId,
  });
}

interface UseGitHubLinkMutationsOptions {
  onCreateSuccess?: (link: GitHubLinkResponse) => void;
  onCreateError?: (err: unknown) => void;
  onDeleteSuccess?: () => void;
  onDeleteError?: (err: unknown) => void;
  onSyncSuccess?: (result: SyncResult) => void;
  onSyncError?: (err: unknown) => void;
}

/**
 * Hook for GitHub project link mutations (create, delete, sync)
 */
export function useGitHubLinkMutations(
  projectId: string,
  options?: UseGitHubLinkMutationsOptions
) {
  const queryClient = useQueryClient();

  const createLink = useMutation({
    mutationKey: ['createGitHubLink', projectId],
    mutationFn: (data: CreateGitHubLinkRequest) =>
      githubApi.createLink(projectId, data),
    onSuccess: (link) => {
      queryClient.invalidateQueries({ queryKey: githubQueryKeys.links(projectId) });
      options?.onCreateSuccess?.(link);
    },
    onError: (err) => {
      console.error('Failed to create GitHub link:', err);
      options?.onCreateError?.(err);
    },
  });

  const deleteLink = useMutation({
    mutationKey: ['deleteGitHubLink', projectId],
    mutationFn: (linkId: string) => githubApi.deleteLink(projectId, linkId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: githubQueryKeys.links(projectId) });
      options?.onDeleteSuccess?.();
    },
    onError: (err) => {
      console.error('Failed to delete GitHub link:', err);
      options?.onDeleteError?.(err);
    },
  });

  const syncLink = useMutation({
    mutationKey: ['syncGitHubLink', projectId],
    mutationFn: (linkId: string) => githubApi.syncLink(projectId, linkId),
    onSuccess: (result) => {
      // Invalidate links to update last_sync_at
      queryClient.invalidateQueries({ queryKey: githubQueryKeys.links(projectId) });
      options?.onSyncSuccess?.(result);
    },
    onError: (err) => {
      console.error('Failed to sync GitHub link:', err);
      options?.onSyncError?.(err);
    },
  });

  const updateSyncEnabled = useMutation({
    mutationKey: ['updateGitHubLinkSync', projectId],
    mutationFn: ({ linkId, syncEnabled }: { linkId: string; syncEnabled: boolean }) =>
      githubApi.updateLinkSyncEnabled(projectId, linkId, syncEnabled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: githubQueryKeys.links(projectId) });
    },
    onError: (err) => {
      console.error('Failed to update sync enabled:', err);
    },
  });

  return {
    createLink,
    deleteLink,
    syncLink,
    updateSyncEnabled,
  };
}

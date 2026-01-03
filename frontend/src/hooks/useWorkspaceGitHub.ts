import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { teamsApi } from '@/lib/api';
import type {
  GitHubConnectionWithRepos,
  GitHubRepository,
  CreateGitHubConnection,
  UpdateGitHubConnection,
  LinkGitHubRepository,
  GitHubRepoInfo,
} from 'shared/types';

const QUERY_KEY = ['workspace', 'github'];

export function useWorkspaceGitHubConnection() {
  return useQuery<GitHubConnectionWithRepos | null>({
    queryKey: QUERY_KEY,
    queryFn: () => teamsApi.getWorkspaceGitHubConnection(),
  });
}

export function useWorkspaceGitHubRepositories() {
  return useQuery<GitHubRepository[]>({
    queryKey: [...QUERY_KEY, 'repos'],
    queryFn: () => teamsApi.getWorkspaceGitHubRepositories(),
  });
}

export function useWorkspaceAvailableGitHubRepos(enabled = true) {
  return useQuery<GitHubRepoInfo[]>({
    queryKey: [...QUERY_KEY, 'available'],
    queryFn: () => teamsApi.getWorkspaceAvailableGitHubRepos(),
    enabled,
  });
}

export function useWorkspaceGitHubMutations() {
  const queryClient = useQueryClient();

  const createConnection = useMutation({
    mutationFn: (data: CreateGitHubConnection) =>
      teamsApi.createWorkspaceGitHubConnection(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });

  const updateConnection = useMutation({
    mutationFn: (data: UpdateGitHubConnection) =>
      teamsApi.updateWorkspaceGitHubConnection(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });

  const deleteConnection = useMutation({
    mutationFn: () => teamsApi.deleteWorkspaceGitHubConnection(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });

  const linkRepository = useMutation({
    mutationFn: (data: LinkGitHubRepository) =>
      teamsApi.linkWorkspaceGitHubRepository(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });

  const unlinkRepository = useMutation({
    mutationFn: (repoId: string) => teamsApi.unlinkWorkspaceGitHubRepository(repoId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });

  return {
    createConnection,
    updateConnection,
    deleteConnection,
    linkRepository,
    unlinkRepository,
  };
}

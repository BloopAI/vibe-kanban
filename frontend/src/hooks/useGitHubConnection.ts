import { useState, useEffect, useCallback, useRef } from 'react';
import { teamsApi } from '@/lib/api';
import type {
  GitHubConnectionWithRepos,
  GitHubRepository,
  CreateGitHubConnection,
  UpdateGitHubConnection,
  LinkGitHubRepository,
  GitHubRepoInfo,
  ConfigureSyncRequest,
  SyncOperationResponse,
} from 'shared/types';

export interface UseGitHubConnectionResult {
  connection: GitHubConnectionWithRepos | null;
  repositories: GitHubRepository[];
  availableRepos: GitHubRepoInfo[];
  isLoading: boolean;
  isLoadingAvailableRepos: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  fetchAvailableRepos: () => Promise<void>;
  connectWithOAuth: () => Promise<void>;
  createConnection: (data: CreateGitHubConnection) => Promise<void>;
  updateConnection: (data: UpdateGitHubConnection) => Promise<void>;
  deleteConnection: () => Promise<void>;
  linkRepository: (data: LinkGitHubRepository) => Promise<GitHubRepository>;
  unlinkRepository: (repoId: string) => Promise<void>;
  configureSync: (repoId: string, data: ConfigureSyncRequest) => Promise<GitHubRepository>;
  clearSync: (repoId: string) => Promise<GitHubRepository>;
  pushDocuments: (repoId: string, commitMessage?: string) => Promise<SyncOperationResponse>;
  pullDocuments: (repoId: string) => Promise<SyncOperationResponse>;
}

export function useGitHubConnection(teamId: string): UseGitHubConnectionResult {
  const [connection, setConnection] = useState<GitHubConnectionWithRepos | null>(null);
  const [availableRepos, setAvailableRepos] = useState<GitHubRepoInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingAvailableRepos, setIsLoadingAvailableRepos] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const oauthWindowRef = useRef<Window | null>(null);

  const refresh = useCallback(async () => {
    if (!teamId) return;
    try {
      setIsLoading(true);
      setError(null);
      const data = await teamsApi.getGitHubConnection(teamId);
      setConnection(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch GitHub connection'));
    } finally {
      setIsLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Listen for OAuth window close to refresh connection
  useEffect(() => {
    const checkOAuthWindow = setInterval(() => {
      if (oauthWindowRef.current?.closed) {
        oauthWindowRef.current = null;
        refresh();
      }
    }, 500);

    return () => clearInterval(checkOAuthWindow);
  }, [refresh]);

  const repositories = connection?.repositories ?? [];

  const connectWithOAuth = useCallback(async () => {
    try {
      const { authorize_url } = await teamsApi.getGitHubAuthorizeUrl(teamId);
      // Open OAuth window
      const width = 600;
      const height = 700;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;
      oauthWindowRef.current = window.open(
        authorize_url,
        'github-oauth',
        `width=${width},height=${height},left=${left},top=${top}`
      );
    } catch (err) {
      throw err instanceof Error ? err : new Error('Failed to start OAuth flow');
    }
  }, [teamId]);

  const createConnection = useCallback(
    async (data: CreateGitHubConnection) => {
      await teamsApi.createGitHubConnection(teamId, data);
      await refresh();
    },
    [teamId, refresh]
  );

  const updateConnection = useCallback(
    async (data: UpdateGitHubConnection) => {
      await teamsApi.updateGitHubConnection(teamId, data);
      await refresh();
    },
    [teamId, refresh]
  );

  const deleteConnection = useCallback(async () => {
    await teamsApi.deleteGitHubConnection(teamId);
    setConnection(null);
  }, [teamId]);

  const linkRepository = useCallback(
    async (data: LinkGitHubRepository) => {
      const repo = await teamsApi.linkGitHubRepository(teamId, data);
      await refresh();
      return repo;
    },
    [teamId, refresh]
  );

  const unlinkRepository = useCallback(
    async (repoId: string) => {
      await teamsApi.unlinkGitHubRepository(teamId, repoId);
      await refresh();
    },
    [teamId, refresh]
  );

  const fetchAvailableRepos = useCallback(async () => {
    if (!teamId) return;
    try {
      setIsLoadingAvailableRepos(true);
      const repos = await teamsApi.getAvailableGitHubRepos(teamId);
      setAvailableRepos(repos);
    } catch (err) {
      console.error('Failed to fetch available repos:', err);
    } finally {
      setIsLoadingAvailableRepos(false);
    }
  }, [teamId]);

  const configureSync = useCallback(
    async (repoId: string, data: ConfigureSyncRequest) => {
      const repo = await teamsApi.configureRepoSync(teamId, repoId, data);
      await refresh();
      return repo;
    },
    [teamId, refresh]
  );

  const clearSync = useCallback(
    async (repoId: string) => {
      const repo = await teamsApi.clearRepoSync(teamId, repoId);
      await refresh();
      return repo;
    },
    [teamId, refresh]
  );

  const pushDocuments = useCallback(
    async (repoId: string, commitMessage?: string) => {
      const result = await teamsApi.pushDocumentsToGitHub(teamId, repoId, {
        commit_message: commitMessage ?? null,
      });
      await refresh();
      return result;
    },
    [teamId, refresh]
  );

  const pullDocuments = useCallback(
    async (repoId: string) => {
      const result = await teamsApi.pullDocumentsFromGitHub(teamId, repoId);
      await refresh();
      return result;
    },
    [teamId, refresh]
  );

  return {
    connection,
    repositories,
    availableRepos,
    isLoading,
    isLoadingAvailableRepos,
    error,
    refresh,
    fetchAvailableRepos,
    connectWithOAuth,
    createConnection,
    updateConnection,
    deleteConnection,
    linkRepository,
    unlinkRepository,
    configureSync,
    clearSync,
    pushDocuments,
    pullDocuments,
  };
}

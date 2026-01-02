import { useState, useEffect, useCallback, useRef } from 'react';
import { teamsApi } from '@/lib/api';
import type {
  GitHubConnectionWithRepos,
  GitHubRepository,
  CreateGitHubConnection,
  UpdateGitHubConnection,
  LinkGitHubRepository,
} from 'shared/types';

export interface UseGitHubConnectionResult {
  connection: GitHubConnectionWithRepos | null;
  repositories: GitHubRepository[];
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  connectWithOAuth: () => Promise<void>;
  createConnection: (data: CreateGitHubConnection) => Promise<void>;
  updateConnection: (data: UpdateGitHubConnection) => Promise<void>;
  deleteConnection: () => Promise<void>;
  linkRepository: (data: LinkGitHubRepository) => Promise<GitHubRepository>;
  unlinkRepository: (repoId: string) => Promise<void>;
}

export function useGitHubConnection(teamId: string): UseGitHubConnectionResult {
  const [connection, setConnection] = useState<GitHubConnectionWithRepos | null>(null);
  const [isLoading, setIsLoading] = useState(true);
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

  return {
    connection,
    repositories,
    isLoading,
    error,
    refresh,
    connectWithOAuth,
    createConnection,
    updateConnection,
    deleteConnection,
    linkRepository,
    unlinkRepository,
  };
}

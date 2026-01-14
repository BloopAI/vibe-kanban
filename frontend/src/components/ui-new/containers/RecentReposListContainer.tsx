import { useState, useEffect, useCallback, useMemo } from 'react';
import { fileSystemApi, repoApi } from '@/lib/api';
import {
  RecentReposList,
  type RecentRepoEntry,
} from '@/components/ui-new/primitives/RecentReposList';
import type { DirectoryEntry, Repo } from 'shared/types';

interface RecentReposListContainerProps {
  registeredRepoPaths: string[];
  onRepoRegistered: (repo: Repo) => void;
}

export function RecentReposListContainer({
  registeredRepoPaths,
  onRepoRegistered,
}: RecentReposListContainerProps) {
  const [recentRepos, setRecentRepos] = useState<DirectoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [registeringPath, setRegisteringPath] = useState<string | null>(null);

  // Load recent repos on mount
  useEffect(() => {
    const loadRecentRepos = async () => {
      setLoading(true);
      setError(null);
      try {
        const repos = await fileSystemApi.listGitRepos();
        setRecentRepos(repos);
      } catch (err) {
        setError('Failed to load recent repositories');
        console.error('Failed to load repos:', err);
      } finally {
        setLoading(false);
      }
    };
    loadRecentRepos();
  }, []);

  // Handle selecting a recent repo
  const handleSelect = useCallback(
    async (entry: RecentRepoEntry) => {
      // Check if already added
      if (registeredRepoPaths.includes(entry.path)) {
        return;
      }

      setRegisteringPath(entry.path);
      setError(null);
      try {
        const repo = await repoApi.register({ path: entry.path });
        onRepoRegistered(repo);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to register repository';
        setError(message);
      } finally {
        setRegisteringPath(null);
      }
    },
    [registeredRepoPaths, onRepoRegistered]
  );

  // Transform recentRepos for presenter
  const reposForPresenter = useMemo(
    (): RecentRepoEntry[] =>
      recentRepos
        .filter((entry) => !registeredRepoPaths.includes(entry.path))
        .slice(0, 5)
        .map((entry) => ({
          path: entry.path,
          name: entry.name,
          isRegistering: registeringPath === entry.path,
        })),
    [recentRepos, registeredRepoPaths, registeringPath]
  );

  return (
    <RecentReposList
      repos={reposForPresenter}
      loading={loading}
      error={error}
      onSelect={handleSelect}
    />
  );
}

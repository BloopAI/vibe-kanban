import { useQuery } from '@tanstack/react-query';
import { releasesApi, type GitHubRelease } from '@/shared/lib/api';

export function useReleases() {
  return useQuery<GitHubRelease[]>({
    queryKey: ['releases'],
    queryFn: () => releasesApi.list(),
    staleTime: 15 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

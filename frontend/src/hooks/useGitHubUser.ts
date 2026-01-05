import { useQuery } from '@tanstack/react-query';

interface GitHubUserResponse {
  login: string;
}

async function fetchGitHubUser(): Promise<GitHubUserResponse | null> {
  try {
    const response = await fetch('/api/github/user');
    if (!response.ok) {
      // If not authenticated or other error, just return null
      return null;
    }
    const data = await response.json();
    if (!data.success) {
      return null;
    }
    return data.data as GitHubUserResponse;
  } catch {
    return null;
  }
}

/**
 * Hook to get the current GitHub user from the gh CLI
 * Returns null if the user is not authenticated
 */
export function useGitHubUser() {
  return useQuery({
    queryKey: ['github-user'],
    queryFn: fetchGitHubUser,
    staleTime: 1000 * 60 * 60, // 1 hour cache
    retry: false,
    refetchOnWindowFocus: false,
  });
}

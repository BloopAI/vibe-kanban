import { useQuery } from '@tanstack/react-query';
import { oauthApi } from '@/lib/api';
import { useAuth } from '@/hooks/auth/useAuth';

// Detect if we're running in cloud mode (when VITE_API_URL is set to external API)
// In cloud mode, /api/auth/user endpoint may not be available
const API_BASE_URL = import.meta.env.VITE_API_URL || '';
const isCloudMode = !!API_BASE_URL;

export function useCurrentUser() {
  const { isSignedIn, userId } = useAuth();

  const query = useQuery({
    queryKey: ['auth', 'user', userId], // Include userId in key to avoid stale data
    queryFn: () => oauthApi.getCurrentUser(),
    retry: 0, // Don't retry - if it fails once, use Clerk data instead
    staleTime: 30 * 60 * 1000, // 30 minutes - user data rarely changes
    gcTime: 60 * 60 * 1000, // 1 hour cache
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false, // Don't refetch on mount - use cached data
    // In cloud mode, disable entirely - use Clerk userId instead
    // In local mode, only enable if signed in
    enabled: !isCloudMode && isSignedIn,
  });

  // REMOVED: useEffect that was causing unnecessary invalidations

  // In cloud mode with userId from useAuth, return that instead of query result
  // This handles the case where /api/auth/user is not available
  if (isCloudMode && userId && (query.isError || !query.data)) {
    return {
      data: { user_id: userId },
      isLoading: false,
      isError: false,
      error: null,
      refetch: query.refetch,
    };
  }

  return query;
}

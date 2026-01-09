import { useQuery, useQueryClient } from '@tanstack/react-query';
import { oauthApi } from '@/lib/api';
import { useEffect } from 'react';
import { useAuth } from '@/hooks/auth/useAuth';

// Detect if we're running in cloud mode (when VITE_API_URL is set to external API)
// In cloud mode, /api/auth/user endpoint may not be available
const API_BASE_URL = import.meta.env.VITE_API_URL || '';
const isCloudMode = !!API_BASE_URL;

export function useCurrentUser() {
  const { isSignedIn, userId } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['auth', 'user'],
    queryFn: () => oauthApi.getCurrentUser(),
    retry: 2,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    // In cloud mode, the /api/auth/user endpoint is not available (returns 400 "Remote client not configured")
    // Clerk provides userId via useAuth(), so we don't need this endpoint in cloud mode
    enabled: !isCloudMode,
  });

  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ['auth', 'user'] });
  }, [queryClient, isSignedIn]);

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

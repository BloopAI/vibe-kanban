import { useQuery, useQueryClient } from '@tanstack/react-query';
import { oauthApi } from '@/lib/api';
import { useEffect, useMemo } from 'react';
import { useAuth } from '@/hooks/auth/useAuth';
import { useUser } from '@clerk/clerk-react';

// Detect if we're running in cloud mode (when VITE_API_URL is set to external API)
// In cloud mode, /api/auth/user endpoint is not available, so we use Clerk directly
const API_BASE_URL = import.meta.env.VITE_API_URL || '';
const isCloudMode = !!API_BASE_URL;

export function useCurrentUser() {
  const { isSignedIn } = useAuth();
  const { user: clerkUser, isLoaded: isClerkLoaded } = useUser();
  const queryClient = useQueryClient();

  // In cloud mode, use Clerk user directly instead of calling /api/auth/user
  // The backend endpoint requires VK_SHARED_API_BASE which is for local deployment only
  const cloudModeData = useMemo(() => {
    if (!isCloudMode) return null;
    if (!isClerkLoaded) return undefined; // Still loading
    if (!clerkUser) return null; // Not signed in
    return { user_id: clerkUser.id };
  }, [clerkUser, isClerkLoaded]);

  const query = useQuery({
    queryKey: ['auth', 'user'],
    queryFn: () => oauthApi.getCurrentUser(),
    retry: 2,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    // Disable query in cloud mode - use Clerk directly
    enabled: !isCloudMode,
  });

  useEffect(() => {
    if (!isCloudMode) {
      queryClient.invalidateQueries({ queryKey: ['auth', 'user'] });
    }
  }, [queryClient, isSignedIn]);

  // In cloud mode, return Clerk-based result
  if (isCloudMode) {
    return {
      data: cloudModeData,
      isLoading: !isClerkLoaded,
      isError: false,
      error: null,
      refetch: async () => ({ data: cloudModeData }),
    };
  }

  return query;
}

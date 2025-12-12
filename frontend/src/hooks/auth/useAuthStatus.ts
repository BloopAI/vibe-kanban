import { useQuery } from '@tanstack/react-query';
import { oauthApi } from '@/lib/api';
import { useEffect } from 'react';
import { useAuth } from '@/hooks';

export const authStatusKeys = {
  all: ['auth', 'status'] as const,
};

interface UseAuthStatusOptions {
  enabled: boolean;
}

export function useAuthStatus(options: UseAuthStatusOptions) {
  const query = useQuery({
    queryKey: authStatusKeys.all,
    queryFn: () => oauthApi.status(),
    enabled: options.enabled,
    refetchInterval: options.enabled ? 1000 : false,
    retry: 3,
    staleTime: 0, // Always fetch fresh data when enabled
  });

  const { isSignedIn } = useAuth();
  useEffect(() => {
    if (query) {
      query.refetch();
    }
  }, [isSignedIn, query]);

  return query;
}

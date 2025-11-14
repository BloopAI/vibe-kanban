import { useQuery } from '@tanstack/react-query';
import { oauthApi } from '@/lib/api';

interface UseAuthStatusOptions {
  enabled: boolean;
}

export function useAuthStatus(options: UseAuthStatusOptions) {
  return useQuery({
    queryKey: ['auth', 'status'],
    queryFn: () => oauthApi.status(),
    enabled: options.enabled,
    refetchInterval: options.enabled ? 1000 : false,
    retry: 3,
    staleTime: 0, // Always fetch fresh data when enabled
  });
}

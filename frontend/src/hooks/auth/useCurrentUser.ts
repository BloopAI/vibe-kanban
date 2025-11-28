import { useQuery } from '@tanstack/react-query';
import { oauthApi } from '@/lib/api';

export function useCurrentUser() {
  return useQuery({
    queryKey: ['auth', 'user'],
    queryFn: () => oauthApi.getCurrentUser(),
    retry: 2,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

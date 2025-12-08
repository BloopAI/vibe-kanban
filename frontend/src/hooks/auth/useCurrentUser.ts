import { useQuery, useQueryClient } from '@tanstack/react-query';
import { oauthApi } from '@/lib/api';
import { useEffect } from 'react';
import { useAuth } from '@/hooks/auth/useAuth';

export function useCurrentUser() {
  const { isSignedIn } = useAuth();
  const query = useQuery({
    queryKey: ['auth', 'user'],
    queryFn: () => oauthApi.getCurrentUser(),
    retry: 2,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const queryClient = useQueryClient();
  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ['auth', 'user'] });
  }, [queryClient, isSignedIn]);

  return query;
}

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { oauthApi } from '@/lib/api';
import { useEffect } from 'react';
import { useAuth } from '@/hooks/auth/useAuth';

export const authUserKeys = {
  all: ['auth', 'user'] as const,
};

export function useCurrentUser() {
  const { isSignedIn } = useAuth();
  const query = useQuery({
    queryKey: authUserKeys.all,
    queryFn: () => oauthApi.getCurrentUser(),
    retry: 2,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const queryClient = useQueryClient();
  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: authUserKeys.all });
  }, [queryClient, isSignedIn]);

  return query;
}

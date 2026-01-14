import { useQuery } from '@tanstack/react-query';
import { localAuthApi, LocalAuthUser } from '@/lib/api';

/**
 * Hook to fetch all users for the assignment picker.
 * Only enabled when the user is authenticated (local auth mode).
 */
export function useUsers(options?: { enabled?: boolean }) {
  return useQuery<LocalAuthUser[]>({
    queryKey: ['users'],
    queryFn: () => localAuthApi.listUsers(),
    enabled: options?.enabled ?? true,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

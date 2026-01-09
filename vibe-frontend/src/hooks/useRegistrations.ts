import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { registrationsApi } from '@/lib/api';
import type { UserRegistration } from 'shared/types';

// Query key factory for consistent caching
export const registrationsKeys = {
  all: ['registrations'] as const,
  pending: () => [...registrationsKeys.all, 'pending'] as const,
  list: (status?: string) => [...registrationsKeys.all, 'list', status] as const,
};

export interface UseRegistrationsResult {
  pendingRegistrations: UserRegistration[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  approveRegistration: (registrationId: string) => Promise<UserRegistration>;
  rejectRegistration: (registrationId: string, reason?: string) => Promise<UserRegistration>;
  isApproving: boolean;
  isRejecting: boolean;
}

/**
 * Hook for managing user registrations (for owners/admins)
 *
 * Fetches pending registrations and provides approve/reject mutations.
 * Only owners can approve/reject registrations.
 */
export function useRegistrations(enabled: boolean = true): UseRegistrationsResult {
  const queryClient = useQueryClient();

  // Query for pending registrations
  const pendingQuery = useQuery({
    queryKey: registrationsKeys.pending(),
    queryFn: () => registrationsApi.listPending(),
    enabled,
    staleTime: 30 * 1000, // 30 seconds - registrations may need to be refreshed more often
    gcTime: 5 * 60 * 1000, // 5 minutes cache retention
    refetchOnWindowFocus: true, // Refetch when tab gets focus since approval state may change
  });

  // Mutation for approving a registration
  const approveMutation = useMutation({
    mutationFn: (registrationId: string) => registrationsApi.approve(registrationId),
    onSuccess: () => {
      // Invalidate the pending list to refetch
      queryClient.invalidateQueries({ queryKey: registrationsKeys.pending() });
    },
  });

  // Mutation for rejecting a registration
  const rejectMutation = useMutation({
    mutationFn: ({ registrationId, reason }: { registrationId: string; reason?: string }) =>
      registrationsApi.reject(registrationId, reason),
    onSuccess: () => {
      // Invalidate the pending list to refetch
      queryClient.invalidateQueries({ queryKey: registrationsKeys.pending() });
    },
  });

  const approveRegistration = async (registrationId: string): Promise<UserRegistration> => {
    return approveMutation.mutateAsync(registrationId);
  };

  const rejectRegistration = async (registrationId: string, reason?: string): Promise<UserRegistration> => {
    return rejectMutation.mutateAsync({ registrationId, reason });
  };

  const refetch = async () => {
    await queryClient.invalidateQueries({ queryKey: registrationsKeys.pending() });
  };

  return {
    pendingRegistrations: pendingQuery.data ?? [],
    isLoading: pendingQuery.isLoading,
    error: pendingQuery.error as Error | null,
    refetch,
    approveRegistration,
    rejectRegistration,
    isApproving: approveMutation.isPending,
    isRejecting: rejectMutation.isPending,
  };
}

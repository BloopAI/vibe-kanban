import { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { registrationsApi } from '@/lib/api';
import type { UserRegistration, CreateUserRegistration } from 'shared/types';

const REGISTRATION_QUERY_KEY = ['user-registration'];
const PENDING_REGISTRATIONS_QUERY_KEY = ['pending-registrations'];

export interface UseUserRegistrationResult {
  registration: UserRegistration | null;
  isLoading: boolean;
  error: Error | null;
  isApproved: boolean;
  isPending: boolean;
  isRejected: boolean;
  hasRegistration: boolean;
  refresh: () => Promise<void>;
  createRegistration: (data: CreateUserRegistration) => Promise<UserRegistration>;
  isCreating: boolean;
}

export function useUserRegistration(): UseUserRegistrationResult {
  const queryClient = useQueryClient();

  const {
    data: registration = null,
    isLoading,
    error,
  } = useQuery<UserRegistration | null, Error>({
    queryKey: REGISTRATION_QUERY_KEY,
    queryFn: () => registrationsApi.getMyRegistration(),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: REGISTRATION_QUERY_KEY });
  }, [queryClient]);

  const createMutation = useMutation({
    mutationFn: (data: CreateUserRegistration) => registrationsApi.create(data),
    onSuccess: (newRegistration) => {
      queryClient.setQueryData<UserRegistration | null>(
        REGISTRATION_QUERY_KEY,
        newRegistration
      );
    },
  });

  const createRegistration = useCallback(
    async (data: CreateUserRegistration) => {
      return createMutation.mutateAsync(data);
    },
    [createMutation]
  );

  const isApproved = registration?.status === 'approved';
  const isPending = registration?.status === 'pending';
  const isRejected = registration?.status === 'rejected';
  const hasRegistration = registration !== null;

  return {
    registration,
    isLoading,
    error,
    isApproved,
    isPending,
    isRejected,
    hasRegistration,
    refresh,
    createRegistration,
    isCreating: createMutation.isPending,
  };
}

// Hook for admin to manage pending registrations
export interface UsePendingRegistrationsResult {
  registrations: UserRegistration[];
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  approveRegistration: (registrationId: string) => Promise<UserRegistration>;
  rejectRegistration: (
    registrationId: string,
    reason?: string
  ) => Promise<UserRegistration>;
  isApproving: boolean;
  isRejecting: boolean;
}

export function usePendingRegistrations(): UsePendingRegistrationsResult {
  const queryClient = useQueryClient();

  const {
    data: registrations = [],
    isLoading,
    error,
  } = useQuery<UserRegistration[], Error>({
    queryKey: PENDING_REGISTRATIONS_QUERY_KEY,
    queryFn: () => registrationsApi.listPending(),
    staleTime: 30 * 1000, // 30 seconds - check more frequently for pending
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
    retry: 1,
  });

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({
      queryKey: PENDING_REGISTRATIONS_QUERY_KEY,
    });
  }, [queryClient]);

  const approveMutation = useMutation({
    mutationFn: (registrationId: string) =>
      registrationsApi.approve(registrationId),
    onSuccess: (updatedRegistration) => {
      // Remove from pending list
      queryClient.setQueryData<UserRegistration[]>(
        PENDING_REGISTRATIONS_QUERY_KEY,
        (old) => old?.filter((r) => r.id !== updatedRegistration.id) ?? []
      );
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({
      registrationId,
      reason,
    }: {
      registrationId: string;
      reason?: string;
    }) => registrationsApi.reject(registrationId, reason),
    onSuccess: (updatedRegistration) => {
      // Remove from pending list
      queryClient.setQueryData<UserRegistration[]>(
        PENDING_REGISTRATIONS_QUERY_KEY,
        (old) => old?.filter((r) => r.id !== updatedRegistration.id) ?? []
      );
    },
  });

  const approveRegistration = useCallback(
    async (registrationId: string) => {
      return approveMutation.mutateAsync(registrationId);
    },
    [approveMutation]
  );

  const rejectRegistration = useCallback(
    async (registrationId: string, reason?: string) => {
      return rejectMutation.mutateAsync({ registrationId, reason });
    },
    [rejectMutation]
  );

  return {
    registrations,
    isLoading,
    error,
    refresh,
    approveRegistration,
    rejectRegistration,
    isApproving: approveMutation.isPending,
    isRejecting: rejectMutation.isPending,
  };
}

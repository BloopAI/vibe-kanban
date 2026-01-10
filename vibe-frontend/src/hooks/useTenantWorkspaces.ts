import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useUser } from '@clerk/clerk-react';
import { tenantWorkspacesApi } from '@/lib/api';
import type {
  TenantWorkspace,
  CreateTenantWorkspace,
  UpdateTenantWorkspace,
} from '@/types/workspace';

export const WORKSPACES_QUERY_KEY = ['tenant-workspaces'];

export function useTenantWorkspaces() {
  const { user, isLoaded } = useUser();
  const queryClient = useQueryClient();
  const userId = user?.id;
  const userEmail = user?.primaryEmailAddress?.emailAddress;

  // Fetch all workspaces
  const {
    data: workspaces = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: [...WORKSPACES_QUERY_KEY, userId],
    queryFn: () => {
      if (!userId) throw new Error('User not authenticated');
      return tenantWorkspacesApi.list(userId);
    },
    enabled: isLoaded && !!userId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Create workspace
  const createMutation = useMutation({
    mutationFn: (data: CreateTenantWorkspace) => {
      if (!userId || !userEmail) throw new Error('User not authenticated');
      return tenantWorkspacesApi.create(data, userId, userEmail);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: WORKSPACES_QUERY_KEY });
    },
  });

  // Update workspace
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateTenantWorkspace }) => {
      if (!userId) throw new Error('User not authenticated');
      return tenantWorkspacesApi.update(id, data, userId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: WORKSPACES_QUERY_KEY });
    },
  });

  // Delete workspace
  const deleteMutation = useMutation({
    mutationFn: (id: string) => {
      if (!userId) throw new Error('User not authenticated');
      return tenantWorkspacesApi.delete(id, userId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: WORKSPACES_QUERY_KEY });
    },
  });

  // Get workspace by ID
  const getWorkspace = useCallback(
    (id: string): TenantWorkspace | undefined => {
      return workspaces.find((w) => w.id === id);
    },
    [workspaces]
  );

  // Get workspace by slug
  const getWorkspaceBySlug = useCallback(
    (slug: string): TenantWorkspace | undefined => {
      return workspaces.find((w) => w.slug === slug);
    },
    [workspaces]
  );

  return {
    // Data
    workspaces,
    isLoading,
    error: error as Error | null,

    // Lookups
    getWorkspace,
    getWorkspaceBySlug,

    // Mutations
    createWorkspace: createMutation.mutateAsync,
    updateWorkspace: (id: string, data: UpdateTenantWorkspace) =>
      updateMutation.mutateAsync({ id, data }),
    deleteWorkspace: deleteMutation.mutateAsync,

    // Mutation states
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,

    // Refresh
    refetch,
  };
}

// Hook for fetching a single workspace
export function useTenantWorkspace(workspaceId: string | null | undefined) {
  const { user, isLoaded } = useUser();
  const userId = user?.id;

  return useQuery({
    queryKey: [...WORKSPACES_QUERY_KEY, workspaceId, 'detail'],
    queryFn: () => {
      if (!userId || !workspaceId) throw new Error('Missing required params');
      return tenantWorkspacesApi.get(workspaceId, userId);
    },
    enabled: isLoaded && !!userId && !!workspaceId,
    staleTime: 5 * 60 * 1000,
  });
}

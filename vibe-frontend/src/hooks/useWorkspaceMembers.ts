import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useUser } from '@clerk/clerk-react';
import { tenantWorkspacesApi } from '@/lib/api';
import type {
  TenantWorkspaceMember,
  AddWorkspaceMember,
  UpdateWorkspaceMemberRole,
} from '@/types/workspace';

export const WORKSPACE_MEMBERS_QUERY_KEY = ['workspace-members'];

export function useWorkspaceMembers(workspaceId: string | null | undefined) {
  const queryClient = useQueryClient();
  const { user } = useUser();
  const userId = user?.id;

  // Fetch members
  const {
    data: members = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: [...WORKSPACE_MEMBERS_QUERY_KEY, workspaceId, userId],
    queryFn: () => {
      if (!workspaceId) throw new Error('Workspace ID required');
      if (!userId) throw new Error('User ID required');
      return tenantWorkspacesApi.getMembers(workspaceId, userId);
    },
    enabled: !!workspaceId && !!userId,
    staleTime: 5 * 60 * 1000,
  });

  // Add member
  const addMutation = useMutation({
    mutationFn: (data: AddWorkspaceMember) => {
      if (!workspaceId) throw new Error('Workspace ID required');
      if (!userId) throw new Error('User ID required');
      return tenantWorkspacesApi.addMember(workspaceId, data, userId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [...WORKSPACE_MEMBERS_QUERY_KEY, workspaceId, userId],
      });
    },
  });

  // Update member role
  const updateRoleMutation = useMutation({
    mutationFn: ({ userId: targetUserId, data }: { userId: string; data: UpdateWorkspaceMemberRole }) => {
      if (!workspaceId) throw new Error('Workspace ID required');
      if (!userId) throw new Error('User ID required');
      return tenantWorkspacesApi.updateMemberRole(workspaceId, targetUserId, data, userId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [...WORKSPACE_MEMBERS_QUERY_KEY, workspaceId, userId],
      });
    },
  });

  // Remove member
  const removeMutation = useMutation({
    mutationFn: (targetUserId: string) => {
      if (!workspaceId) throw new Error('Workspace ID required');
      if (!userId) throw new Error('User ID required');
      return tenantWorkspacesApi.removeMember(workspaceId, targetUserId, userId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [...WORKSPACE_MEMBERS_QUERY_KEY, workspaceId, userId],
      });
    },
  });

  return {
    // Data
    members,
    isLoading,
    error: error as Error | null,

    // Get member by user ID
    getMember: (userId: string): TenantWorkspaceMember | undefined =>
      members.find((m) => m.user_id === userId),

    // Mutations
    addMember: addMutation.mutateAsync,
    updateMemberRole: (userId: string, data: UpdateWorkspaceMemberRole) =>
      updateRoleMutation.mutateAsync({ userId, data }),
    removeMember: removeMutation.mutateAsync,

    // Mutation states
    isAdding: addMutation.isPending,
    isUpdating: updateRoleMutation.isPending,
    isRemoving: removeMutation.isPending,

    // Refresh
    refetch,
  };
}

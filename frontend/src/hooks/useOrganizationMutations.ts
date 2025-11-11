import { useMutation, useQueryClient } from '@tanstack/react-query';
import { organizationsApi } from '@/lib/api';
import type { MemberRole, UpdateMemberRoleResponse } from 'shared/types';

interface UseOrganizationMutationsOptions {
  onRemoveSuccess?: () => void;
  onRemoveError?: (err: unknown) => void;
  onRoleChangeSuccess?: () => void;
  onRoleChangeError?: (err: unknown) => void;
}

/**
 * Hook providing mutations for organization member management
 */
export function useOrganizationMutations(
  options?: UseOrganizationMutationsOptions
) {
  const queryClient = useQueryClient();

  const removeMember = useMutation({
    mutationFn: ({ orgId, userId }: { orgId: string; userId: string }) =>
      organizationsApi.removeMember(orgId, userId),
    onSuccess: (_data, variables) => {
      // Invalidate members query for this organization
      queryClient.invalidateQueries({
        queryKey: ['organization', 'members', variables.orgId],
      });
      // Invalidate user's organizations in case we removed ourselves
      queryClient.invalidateQueries({ queryKey: ['user', 'organizations'] });
      options?.onRemoveSuccess?.();
    },
    onError: (err) => {
      console.error('Failed to remove member:', err);
      options?.onRemoveError?.(err);
    },
  });

  const updateMemberRole = useMutation<
    UpdateMemberRoleResponse,
    unknown,
    { orgId: string; userId: string; role: MemberRole }
  >({
    mutationFn: ({ orgId, userId, role }) =>
      organizationsApi.updateMemberRole(orgId, userId, { role }),
    onSuccess: (_data, variables) => {
      // Invalidate members query for this organization
      queryClient.invalidateQueries({
        queryKey: ['organization', 'members', variables.orgId],
      });
      // Invalidate user's organizations in case we changed our own role
      queryClient.invalidateQueries({ queryKey: ['user', 'organizations'] });
      options?.onRoleChangeSuccess?.();
    },
    onError: (err) => {
      console.error('Failed to update member role:', err);
      options?.onRoleChangeError?.(err);
    },
  });

  /**
   * Helper to manually refetch members for an organization
   */
  const refetchMembers = async (orgId: string) => {
    await queryClient.invalidateQueries({
      queryKey: ['organization', 'members', orgId],
    });
  };

  /**
   * Helper to manually refetch invitations for an organization
   */
  const refetchInvitations = async (orgId: string) => {
    await queryClient.invalidateQueries({
      queryKey: ['organization', 'invitations', orgId],
    });
  };

  return {
    removeMember,
    updateMemberRole,
    refetchMembers,
    refetchInvitations,
  };
}

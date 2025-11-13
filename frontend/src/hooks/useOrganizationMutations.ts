import { useMutation, useQueryClient } from '@tanstack/react-query';
import { organizationsApi } from '@/lib/api';
import type {
  MemberRole,
  UpdateMemberRoleResponse,
  CreateOrganizationRequest,
  CreateOrganizationResponse,
  CreateInvitationRequest,
  CreateInvitationResponse,
  ListOrganizationsResponse,
} from 'shared/types';

interface UseOrganizationMutationsOptions {
  onCreateSuccess?: (result: CreateOrganizationResponse) => void;
  onCreateError?: (err: unknown) => void;
  onInviteSuccess?: (result: CreateInvitationResponse) => void;
  onInviteError?: (err: unknown) => void;
  onRevokeSuccess?: () => void;
  onRevokeError?: (err: unknown) => void;
  onRemoveSuccess?: () => void;
  onRemoveError?: (err: unknown) => void;
  onRoleChangeSuccess?: () => void;
  onRoleChangeError?: (err: unknown) => void;
  onDeleteSuccess?: () => void;
  onDeleteError?: (err: unknown) => void;
}

export function useOrganizationMutations(
  options?: UseOrganizationMutationsOptions
) {
  const queryClient = useQueryClient();

  const createOrganization = useMutation({
    mutationKey: ['createOrganization'],
    mutationFn: (data: CreateOrganizationRequest) =>
      organizationsApi.createOrganization(data),
    onSuccess: (result: CreateOrganizationResponse) => {
      // Immediately add new org to cache to prevent race condition with selection
      queryClient.setQueryData<ListOrganizationsResponse>(
        ['user', 'organizations'],
        (old) => {
          if (!old) return { organizations: [result.organization] };
          return {
            organizations: [...old.organizations, result.organization],
          };
        }
      );

      // Then invalidate to ensure server data stays fresh
      queryClient.invalidateQueries({ queryKey: ['user', 'organizations'] });
      options?.onCreateSuccess?.(result);
    },
    onError: (err) => {
      console.error('Failed to create organization:', err);
      options?.onCreateError?.(err);
    },
  });

  const createInvitation = useMutation({
    mutationKey: ['createInvitation'],
    mutationFn: ({
      orgId,
      data,
    }: {
      orgId: string;
      data: CreateInvitationRequest;
    }) => organizationsApi.createInvitation(orgId, data),
    onSuccess: (result: CreateInvitationResponse, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['organization', 'members', variables.orgId],
      });
      queryClient.invalidateQueries({
        queryKey: ['organization', 'invitations', variables.orgId],
      });
      options?.onInviteSuccess?.(result);
    },
    onError: (err) => {
      console.error('Failed to create invitation:', err);
      options?.onInviteError?.(err);
    },
  });

  const revokeInvitation = useMutation({
    mutationFn: ({
      orgId,
      invitationId,
    }: {
      orgId: string;
      invitationId: string;
    }) => organizationsApi.revokeInvitation(orgId, invitationId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['organization', 'members', variables.orgId],
      });
      queryClient.invalidateQueries({
        queryKey: ['organization', 'invitations', variables.orgId],
      });
      options?.onRevokeSuccess?.();
    },
    onError: (err) => {
      console.error('Failed to revoke invitation:', err);
      options?.onRevokeError?.(err);
    },
  });

  const removeMember = useMutation({
    mutationFn: ({ orgId, userId }: { orgId: string; userId: string }) =>
      organizationsApi.removeMember(orgId, userId),
    onSuccess: (_data, variables) => {
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

  const refetchMembers = async (orgId: string) => {
    await queryClient.invalidateQueries({
      queryKey: ['organization', 'members', orgId],
    });
  };

  const refetchInvitations = async (orgId: string) => {
    await queryClient.invalidateQueries({
      queryKey: ['organization', 'invitations', orgId],
    });
  };

  const deleteOrganization = useMutation({
    mutationFn: (orgId: string) => organizationsApi.deleteOrganization(orgId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user', 'organizations'] });
      options?.onDeleteSuccess?.();
    },
    onError: (err) => {
      console.error('Failed to delete organization:', err);
      options?.onDeleteError?.(err);
    },
  });

  return {
    createOrganization,
    createInvitation,
    revokeInvitation,
    removeMember,
    updateMemberRole,
    deleteOrganization,
    refetchMembers,
    refetchInvitations,
  };
}

import { useCallback, useMemo, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { teamsApi, userInvitationsApi } from '@/lib/api';
import { useClerkUser } from '@/hooks/auth/useClerkAuth';
import type {
  TeamMember,
  TeamMemberRole,
  CreateTeamMember,
  SyncClerkMember,
  TeamInvitation,
  TeamInvitationWithTeam,
  CreateTeamInvitation,
} from 'shared/types';

// Track which teams have been synced this session to avoid duplicate sync requests
const syncedTeams = new Set<string>();

// Query key factory for consistent caching
export const teamMembersKeys = {
  all: ['teams'] as const,
  members: (teamId: string) => [...teamMembersKeys.all, teamId, 'members'] as const,
  invitations: (teamId: string) => [...teamMembersKeys.all, teamId, 'invitations'] as const,
};

// Helper to check if error is a rate limit (429)
function isRateLimitError(error: unknown): boolean {
  if (error instanceof Error) {
    return error.message.includes('429') || error.message.includes('Too Many Requests');
  }
  return false;
}

export interface UseTeamMembersResult {
  members: TeamMember[];
  invitations: TeamInvitation[];
  currentMember: TeamMember | null;
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  syncClerkMember: () => Promise<TeamMember | null>;
  addMember: (data: CreateTeamMember) => Promise<TeamMember>;
  updateMemberRole: (memberId: string, role: TeamMemberRole) => Promise<TeamMember>;
  removeMember: (memberId: string) => Promise<void>;
  createInvitation: (data: CreateTeamInvitation) => Promise<TeamInvitation>;
  updateInvitationRole: (invitationId: string, role: TeamMemberRole) => Promise<TeamInvitation>;
  cancelInvitation: (invitationId: string) => Promise<void>;
}

/**
 * Hook for managing team members and invitations (for team owners/maintainers)
 *
 * Uses TanStack Query for automatic request deduplication and caching.
 * Multiple components using this hook with the same teamId will share the cache
 * and NOT make duplicate API requests.
 */
export function useTeamMembers(teamId: string | undefined): UseTeamMembersResult {
  const { user, isLoaded: isClerkLoaded } = useClerkUser();
  const queryClient = useQueryClient();

  // Query for team members - shared across all components using this hook
  const membersQuery = useQuery({
    queryKey: teamMembersKeys.members(teamId!),
    queryFn: () => teamsApi.getMembers(teamId!),
    enabled: !!teamId,
    staleTime: 5 * 60 * 1000, // 5 minutes - members don't change frequently
    gcTime: 15 * 60 * 1000, // 15 minutes cache retention
    refetchOnWindowFocus: false, // Don't refetch when tab gets focus
    refetchOnReconnect: false, // Don't refetch on network reconnect
    retry: (failureCount, error) => {
      // Never retry rate limit errors - this amplifies the problem
      if (isRateLimitError(error)) return false;
      // Only 1 retry for other errors
      return failureCount < 1;
    },
    retryDelay: 60000, // 60 seconds - respect rate limit window
  });

  // Query for invitations - separate so components that only need members don't fetch invitations
  const invitationsQuery = useQuery({
    queryKey: teamMembersKeys.invitations(teamId!),
    queryFn: () => teamsApi.getInvitations(teamId!),
    enabled: !!teamId,
    staleTime: 5 * 60 * 1000, // 5 minutes - invitations don't change frequently
    gcTime: 15 * 60 * 1000, // 15 minutes cache retention
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: (failureCount, error) => {
      if (isRateLimitError(error)) return false;
      return failureCount < 1;
    },
    retryDelay: 60000, // 60 seconds - respect rate limit window
  });

  const members = membersQuery.data ?? [];
  const invitations = invitationsQuery.data ?? [];

  // Find current member from cached data
  const currentMember = useMemo(() => {
    if (!user || !members.length) return null;
    return members.find((m) => m.clerk_user_id === user.id) || null;
  }, [members, user]);

  // Sync current Clerk user to team members
  const syncClerkMember = useCallback(async (): Promise<TeamMember | null> => {
    if (!teamId || !user) return null;

    // Only sync once per team per session to avoid excessive requests
    if (syncedTeams.has(teamId)) {
      return currentMember;
    }

    // Mark as synced BEFORE the call to prevent retry loops on failure
    syncedTeams.add(teamId);

    try {
      const syncData: SyncClerkMember = {
        clerk_user_id: user.id,
        email: user.primaryEmailAddress?.emailAddress || '',
        display_name: user.fullName || user.firstName || null,
        avatar_url: user.imageUrl || null,
      };
      const member = await teamsApi.syncClerkMember(teamId, syncData);

      // Update cache with synced member
      queryClient.setQueryData(teamMembersKeys.members(teamId), (old: TeamMember[] | undefined) => {
        if (!old) return [member];
        const exists = old.some((m) => m.id === member.id);
        if (exists) {
          return old.map((m) => (m.id === member.id ? member : m));
        }
        return [...old, member];
      });

      return member;
    } catch (err) {
      // Don't remove from syncedTeams - we don't want to retry on rate limits
      console.error('Failed to sync Clerk member:', err);
      return null;
    }
  }, [teamId, user, currentMember, queryClient]);

  // Auto-sync on first load (only once per team per session)
  useEffect(() => {
    if (isClerkLoaded && user && teamId && !syncedTeams.has(teamId) && membersQuery.isSuccess) {
      syncClerkMember();
    }
    // Intentionally exclude syncClerkMember from deps to prevent re-triggering
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isClerkLoaded, user, teamId, membersQuery.isSuccess]);

  const refresh = useCallback(async () => {
    if (!teamId) return;
    // Invalidate both queries to trigger refetch
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: teamMembersKeys.members(teamId) }),
      queryClient.invalidateQueries({ queryKey: teamMembersKeys.invitations(teamId) }),
    ]);
  }, [teamId, queryClient]);

  const addMember = useCallback(
    async (data: CreateTeamMember) => {
      if (!teamId) throw new Error('No team selected');
      const newMember = await teamsApi.addMember(teamId, data);
      // Update cache optimistically
      queryClient.setQueryData(teamMembersKeys.members(teamId), (old: TeamMember[] | undefined) => {
        return old ? [...old, newMember] : [newMember];
      });
      return newMember;
    },
    [teamId, queryClient]
  );

  const updateMemberRole = useCallback(
    async (memberId: string, role: TeamMemberRole) => {
      if (!teamId) throw new Error('No team selected');
      const updatedMember = await teamsApi.updateMemberRole(teamId, memberId, { role });
      queryClient.setQueryData(teamMembersKeys.members(teamId), (old: TeamMember[] | undefined) => {
        return old?.map((m) => (m.id === memberId ? updatedMember : m)) ?? [];
      });
      return updatedMember;
    },
    [teamId, queryClient]
  );

  const removeMember = useCallback(
    async (memberId: string) => {
      if (!teamId) throw new Error('No team selected');
      await teamsApi.removeMember(teamId, memberId);
      queryClient.setQueryData(teamMembersKeys.members(teamId), (old: TeamMember[] | undefined) => {
        return old?.filter((m) => m.id !== memberId) ?? [];
      });
    },
    [teamId, queryClient]
  );

  const createInvitation = useCallback(
    async (data: CreateTeamInvitation) => {
      if (!teamId) throw new Error('No team selected');
      const newInvitation = await teamsApi.createInvitation(teamId, data);
      queryClient.setQueryData(teamMembersKeys.invitations(teamId), (old: TeamInvitation[] | undefined) => {
        return old ? [...old, newInvitation] : [newInvitation];
      });
      return newInvitation;
    },
    [teamId, queryClient]
  );

  const updateInvitationRole = useCallback(
    async (invitationId: string, role: TeamMemberRole) => {
      if (!teamId) throw new Error('No team selected');
      const updated = await teamsApi.updateInvitationRole(teamId, invitationId, { role });
      queryClient.setQueryData(teamMembersKeys.invitations(teamId), (old: TeamInvitation[] | undefined) => {
        return old?.map((i) => (i.id === invitationId ? updated : i)) ?? [];
      });
      return updated;
    },
    [teamId, queryClient]
  );

  const cancelInvitation = useCallback(
    async (invitationId: string) => {
      if (!teamId) throw new Error('No team selected');
      await teamsApi.cancelInvitation(teamId, invitationId);
      queryClient.setQueryData(teamMembersKeys.invitations(teamId), (old: TeamInvitation[] | undefined) => {
        return old?.filter((i) => i.id !== invitationId) ?? [];
      });
    },
    [teamId, queryClient]
  );

  // Combine loading states
  const isLoading = membersQuery.isLoading || invitationsQuery.isLoading;
  const error = membersQuery.error || invitationsQuery.error;

  return {
    members,
    invitations,
    currentMember,
    isLoading,
    error: error ? (error instanceof Error ? error : new Error('Failed to fetch team data')) : null,
    refresh,
    syncClerkMember,
    addMember,
    updateMemberRole,
    removeMember,
    createInvitation,
    updateInvitationRole,
    cancelInvitation,
  };
}

export interface UseMyInvitationsResult {
  invitations: TeamInvitationWithTeam[];
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  acceptInvitation: (invitationId: string) => Promise<TeamMember>;
  declineInvitation: (invitationId: string) => Promise<void>;
}

/**
 * Hook for managing user's own pending invitations (for accepting/declining)
 */
export function useMyInvitations(): UseMyInvitationsResult {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['user', 'invitations'],
    queryFn: () => userInvitationsApi.getMyInvitations(),
    staleTime: 5 * 60 * 1000, // 5 minutes - invitations don't change frequently
    gcTime: 15 * 60 * 1000, // 15 minutes cache retention
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: (failureCount, error) => {
      if (isRateLimitError(error)) return false;
      return failureCount < 1;
    },
    retryDelay: 60000, // 60 seconds - respect rate limit window
  });

  const invitations = query.data ?? [];

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['user', 'invitations'] });
  }, [queryClient]);

  const acceptInvitation = useCallback(
    async (invitationId: string) => {
      const member = await userInvitationsApi.acceptInvitation(invitationId);
      queryClient.setQueryData(['user', 'invitations'], (old: TeamInvitationWithTeam[] | undefined) => {
        return old?.filter((i) => i.id !== invitationId) ?? [];
      });
      return member;
    },
    [queryClient]
  );

  const declineInvitation = useCallback(
    async (invitationId: string) => {
      await userInvitationsApi.declineInvitation(invitationId);
      queryClient.setQueryData(['user', 'invitations'], (old: TeamInvitationWithTeam[] | undefined) => {
        return old?.filter((i) => i.id !== invitationId) ?? [];
      });
    },
    [queryClient]
  );

  return {
    invitations,
    isLoading: query.isLoading,
    error: query.error ? (query.error instanceof Error ? query.error : new Error('Failed to fetch invitations')) : null,
    refresh,
    acceptInvitation,
    declineInvitation,
  };
}

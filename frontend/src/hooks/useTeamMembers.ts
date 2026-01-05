import { useState, useEffect, useCallback, useRef } from 'react';
import { teamsApi, userInvitationsApi } from '@/lib/api';
import { useUser } from '@clerk/clerk-react';
import type {
  TeamMember,
  TeamMemberRole,
  CreateTeamMember,
  SyncClerkMember,
  TeamInvitation,
  TeamInvitationWithTeam,
  CreateTeamInvitation,
} from 'shared/types';

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
 */
export function useTeamMembers(teamId: string | undefined): UseTeamMembersResult {
  const { user, isLoaded: isClerkLoaded } = useUser();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [invitations, setInvitations] = useState<TeamInvitation[]>([]);
  const [currentMember, setCurrentMember] = useState<TeamMember | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const hasSyncedRef = useRef<string | null>(null);

  // Sync current Clerk user to team members
  const syncClerkMember = useCallback(async (): Promise<TeamMember | null> => {
    if (!teamId || !user) return null;

    try {
      const syncData: SyncClerkMember = {
        clerk_user_id: user.id,
        email: user.primaryEmailAddress?.emailAddress || '',
        display_name: user.fullName || user.firstName || null,
        avatar_url: user.imageUrl || null,
      };
      const member = await teamsApi.syncClerkMember(teamId, syncData);
      setCurrentMember(member);
      // Update member in list if exists, otherwise add
      setMembers((prev) => {
        const exists = prev.some((m) => m.id === member.id);
        if (exists) {
          return prev.map((m) => (m.id === member.id ? member : m));
        }
        return [...prev, member];
      });
      return member;
    } catch (err) {
      console.error('Failed to sync Clerk member:', err);
      return null;
    }
  }, [teamId, user]);

  const refresh = useCallback(async () => {
    if (!teamId) {
      setMembers([]);
      setInvitations([]);
      setCurrentMember(null);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const [membersData, invitationsData] = await Promise.all([
        teamsApi.getMembers(teamId),
        teamsApi.getInvitations(teamId),
      ]);
      setMembers(membersData);
      setInvitations(invitationsData);

      // Find current member by clerk_user_id
      if (user) {
        const current = membersData.find((m) => m.clerk_user_id === user.id);
        setCurrentMember(current || null);
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch team members'));
    } finally {
      setIsLoading(false);
    }
  }, [teamId, user]);

  // Initial fetch
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Auto-sync Clerk user on first load per team
  useEffect(() => {
    if (isClerkLoaded && user && teamId && hasSyncedRef.current !== teamId) {
      hasSyncedRef.current = teamId;
      syncClerkMember();
    }
  }, [isClerkLoaded, user, teamId, syncClerkMember]);

  const addMember = useCallback(
    async (data: CreateTeamMember) => {
      if (!teamId) throw new Error('No team selected');
      const newMember = await teamsApi.addMember(teamId, data);
      setMembers((prev) => [...prev, newMember]);
      return newMember;
    },
    [teamId]
  );

  const updateMemberRole = useCallback(
    async (memberId: string, role: TeamMemberRole) => {
      if (!teamId) throw new Error('No team selected');
      const updatedMember = await teamsApi.updateMemberRole(teamId, memberId, { role });
      setMembers((prev) =>
        prev.map((m) => (m.id === memberId ? updatedMember : m))
      );
      return updatedMember;
    },
    [teamId]
  );

  const removeMember = useCallback(
    async (memberId: string) => {
      if (!teamId) throw new Error('No team selected');
      await teamsApi.removeMember(teamId, memberId);
      setMembers((prev) => prev.filter((m) => m.id !== memberId));
    },
    [teamId]
  );

  const createInvitation = useCallback(
    async (data: CreateTeamInvitation) => {
      if (!teamId) throw new Error('No team selected');
      const newInvitation = await teamsApi.createInvitation(teamId, data);
      setInvitations((prev) => [...prev, newInvitation]);
      return newInvitation;
    },
    [teamId]
  );

  const updateInvitationRole = useCallback(
    async (invitationId: string, role: TeamMemberRole) => {
      if (!teamId) throw new Error('No team selected');
      const updated = await teamsApi.updateInvitationRole(teamId, invitationId, { role });
      setInvitations((prev) =>
        prev.map((i) => (i.id === invitationId ? updated : i))
      );
      return updated;
    },
    [teamId]
  );

  const cancelInvitation = useCallback(
    async (invitationId: string) => {
      if (!teamId) throw new Error('No team selected');
      await teamsApi.cancelInvitation(teamId, invitationId);
      setInvitations((prev) => prev.filter((i) => i.id !== invitationId));
    },
    [teamId]
  );

  return {
    members,
    invitations,
    currentMember,
    isLoading,
    error,
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
  const [invitations, setInvitations] = useState<TeamInvitationWithTeam[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await userInvitationsApi.getMyInvitations();
      setInvitations(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch invitations'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const acceptInvitation = useCallback(
    async (invitationId: string) => {
      const member = await userInvitationsApi.acceptInvitation(invitationId);
      setInvitations((prev) => prev.filter((i) => i.id !== invitationId));
      return member;
    },
    []
  );

  const declineInvitation = useCallback(
    async (invitationId: string) => {
      await userInvitationsApi.declineInvitation(invitationId);
      setInvitations((prev) => prev.filter((i) => i.id !== invitationId));
    },
    []
  );

  return {
    invitations,
    isLoading,
    error,
    refresh,
    acceptInvitation,
    declineInvitation,
  };
}

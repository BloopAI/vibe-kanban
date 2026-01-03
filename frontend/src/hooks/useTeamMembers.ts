import { useState, useEffect, useCallback } from 'react';
import { teamsApi, userInvitationsApi } from '@/lib/api';
import type {
  TeamMember,
  TeamMemberRole,
  CreateTeamMember,
  TeamInvitation,
  TeamInvitationWithTeam,
  CreateTeamInvitation,
} from 'shared/types';

export interface UseTeamMembersResult {
  members: TeamMember[];
  invitations: TeamInvitation[];
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
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
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [invitations, setInvitations] = useState<TeamInvitation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    if (!teamId) {
      setMembers([]);
      setInvitations([]);
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
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch team members'));
    } finally {
      setIsLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

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
    isLoading,
    error,
    refresh,
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

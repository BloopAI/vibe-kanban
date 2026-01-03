import { useParams } from 'react-router-dom';
import { useTeams } from '@/hooks/useTeams';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  UserPlus,
  Users,
  MoreHorizontal,
  Loader2,
  Mail,
  Clock,
  X,
  Crown,
  Shield,
  Pencil,
  Eye,
  UserMinus,
} from 'lucide-react';
import { InvitePeopleDialog } from '@/components/dialogs/teams/InvitePeopleDialog';
import { ConfirmDialog } from '@/components/dialogs/shared/ConfirmDialog';
import type { TeamMember, TeamMemberRole, TeamInvitation } from 'shared/types';
import { formatDistanceToNow } from 'date-fns';
import { useState } from 'react';

const ROLE_OPTIONS: { value: TeamMemberRole; label: string; icon: React.ElementType }[] = [
  { value: 'viewer', label: 'Viewer', icon: Eye },
  { value: 'contributor', label: 'Contributor', icon: Pencil },
  { value: 'maintainer', label: 'Maintainer', icon: Shield },
  { value: 'owner', label: 'Owner', icon: Crown },
];

function getRoleIcon(role: TeamMemberRole) {
  const option = ROLE_OPTIONS.find((o) => o.value === role);
  return option?.icon || Eye;
}

function getRoleBadgeVariant(role: TeamMemberRole): 'default' | 'secondary' | 'outline' | 'destructive' {
  switch (role) {
    case 'owner':
      return 'default';
    case 'maintainer':
      return 'secondary';
    case 'contributor':
      return 'outline';
    case 'viewer':
    default:
      return 'outline';
  }
}

interface MemberRowProps {
  member: TeamMember;
  onRoleChange: (memberId: string, role: TeamMemberRole) => Promise<void>;
  onRemove: (memberId: string) => Promise<void>;
  isUpdating: boolean;
}

function MemberRow({ member, onRoleChange, onRemove, isUpdating }: MemberRowProps) {
  const [isChangingRole, setIsChangingRole] = useState(false);
  const RoleIcon = getRoleIcon(member.role);

  const handleRoleChange = async (newRole: TeamMemberRole) => {
    if (newRole === member.role) return;
    setIsChangingRole(true);
    try {
      await onRoleChange(member.id, newRole);
    } finally {
      setIsChangingRole(false);
    }
  };

  const handleRemove = async () => {
    const confirmed = await ConfirmDialog.show({
      title: 'Remove member',
      message: `Are you sure you want to remove ${member.display_name || member.email} from this team? They will lose access to all team resources.`,
      confirmText: 'Remove',
      variant: 'destructive',
    });
    if (confirmed === 'confirmed') {
      await onRemove(member.id);
    }
  };

  return (
    <div className="flex items-center justify-between py-3 px-4 border-b last:border-b-0 hover:bg-muted/50">
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
          <span className="text-sm font-medium text-primary">
            {(member.display_name || member.email).slice(0, 2).toUpperCase()}
          </span>
        </div>
        <div>
          <p className="text-sm font-medium">
            {member.display_name || member.email}
          </p>
          <p className="text-xs text-muted-foreground">{member.email}</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Select
          value={member.role}
          onValueChange={handleRoleChange}
          disabled={isUpdating || isChangingRole}
        >
          <SelectTrigger className="w-32 h-8">
            <SelectValue>
              <div className="flex items-center gap-1.5">
                <RoleIcon className="h-3.5 w-3.5" />
                <span className="capitalize">{member.role}</span>
              </div>
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {ROLE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                <div className="flex items-center gap-2">
                  <option.icon className="h-4 w-4" />
                  <span>{option.label}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={handleRemove}
              className="text-destructive focus:text-destructive"
            >
              <UserMinus className="h-4 w-4 mr-2" />
              Remove member
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

interface PendingInvitationRowProps {
  invitation: TeamInvitation;
  onCancel: (invitationId: string) => Promise<void>;
}

function PendingInvitationRow({ invitation, onCancel }: PendingInvitationRowProps) {
  const [isCanceling, setIsCanceling] = useState(false);
  const expiresAt = new Date(invitation.expires_at);
  const isExpired = expiresAt < new Date();

  const handleCancel = async () => {
    setIsCanceling(true);
    try {
      await onCancel(invitation.id);
    } finally {
      setIsCanceling(false);
    }
  };

  return (
    <div className="flex items-center justify-between py-3 px-4 border-b last:border-b-0 hover:bg-muted/50">
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
          <Mail className="h-4 w-4 text-muted-foreground" />
        </div>
        <div>
          <p className="text-sm font-medium">{invitation.email}</p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            {isExpired ? (
              <span className="text-destructive">Expired</span>
            ) : (
              <span>
                Expires {formatDistanceToNow(expiresAt, { addSuffix: true })}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Badge variant={getRoleBadgeVariant(invitation.role)} className="capitalize">
          {invitation.role}
        </Badge>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={handleCancel}
          disabled={isCanceling}
        >
          {isCanceling ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <X className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );
}

export function TeamMembers() {
  const { teamId } = useParams<{ teamId: string }>();
  const { teamsById } = useTeams();
  const {
    members,
    invitations,
    isLoading,
    error,
    updateMemberRole,
    removeMember,
    cancelInvitation,
  } = useTeamMembers(teamId);

  const team = teamId ? teamsById[teamId] : undefined;
  const [isUpdating, setIsUpdating] = useState(false);

  const handleInvite = async () => {
    if (!team) return;
    await InvitePeopleDialog.show({ teamId: team.id, teamName: team.name });
  };

  const handleRoleChange = async (memberId: string, role: TeamMemberRole) => {
    setIsUpdating(true);
    try {
      await updateMemberRole(memberId, role);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    setIsUpdating(true);
    try {
      await removeMember(memberId);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleCancelInvitation = async (invitationId: string) => {
    await cancelInvitation(invitationId);
  };

  if (!team) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Team not found</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div className="flex items-center gap-3">
          <Users className="h-5 w-5 text-muted-foreground" />
          <div>
            <h1 className="text-lg font-semibold">Team Members</h1>
            <p className="text-sm text-muted-foreground">
              Manage who has access to {team.name}
            </p>
          </div>
        </div>
        <Button onClick={handleInvite}>
          <UserPlus className="h-4 w-4 mr-2" />
          Invite people
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6 space-y-6">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Members */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Members</CardTitle>
                <CardDescription>
                  {members.length} member{members.length !== 1 ? 's' : ''} in this team
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {members.length === 0 ? (
                  <div className="py-8 text-center text-muted-foreground">
                    <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No members yet</p>
                    <p className="text-sm">Invite people to join this team</p>
                  </div>
                ) : (
                  <div className="divide-y">
                    {members.map((member) => (
                      <MemberRow
                        key={member.id}
                        member={member}
                        onRoleChange={handleRoleChange}
                        onRemove={handleRemoveMember}
                        isUpdating={isUpdating}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Pending Invitations */}
            {invitations.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Pending Invitations</CardTitle>
                  <CardDescription>
                    {invitations.length} pending invitation{invitations.length !== 1 ? 's' : ''}
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y">
                    {invitations.map((invitation) => (
                      <PendingInvitationRow
                        key={invitation.id}
                        invitation={invitation}
                        onCancel={handleCancelInvitation}
                      />
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}

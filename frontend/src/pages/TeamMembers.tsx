import { useParams } from 'react-router-dom';
import { useTeams } from '@/hooks/useTeams';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  Loader2,
  Mail,
  Clock,
  X,
  Crown,
  Shield,
  Pencil,
  Eye,
  UserMinus,
  Copy,
  Check,
  Send,
  Search,
  ArrowUpDown,
  MoreVertical,
  UserPlus2,
  CheckCircle2,
  Hourglass,
} from 'lucide-react';
import { InvitePeopleDialog } from '@/components/dialogs/teams/InvitePeopleDialog';
import { ConfirmDialog } from '@/components/dialogs/shared/ConfirmDialog';
import type { TeamMember, TeamMemberRole, TeamInvitation } from 'shared/types';
import { format } from 'date-fns';
import { useState, useMemo } from 'react';

const ROLE_OPTIONS: { value: TeamMemberRole; label: string; icon: React.ElementType }[] = [
  { value: 'viewer', label: 'Viewer', icon: Eye },
  { value: 'contributor', label: 'Contributor', icon: Pencil },
  { value: 'maintainer', label: 'Maintainer', icon: Shield },
  { value: 'owner', label: 'Owner', icon: Crown },
];

type SortField = 'account' | 'role' | 'created' | 'activity';

function getRoleColor(role: TeamMemberRole): string {
  switch (role) {
    case 'owner':
      return 'text-blue-600 dark:text-blue-400';
    case 'maintainer':
      return 'text-blue-600 dark:text-blue-400';
    case 'contributor':
      return 'text-blue-600 dark:text-blue-400';
    case 'viewer':
    default:
      return 'text-blue-600 dark:text-blue-400';
  }
}

// Generate a deterministic pattern for avatar based on email/name
function getAvatarPattern(str: string): string {
  const colors = [
    'bg-blue-500',
    'bg-green-500',
    'bg-purple-500',
    'bg-orange-500',
    'bg-pink-500',
    'bg-teal-500',
    'bg-indigo-500',
    'bg-cyan-500',
  ];
  const hash = str.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return colors[hash % colors.length];
}

interface MemberTableRowProps {
  member: TeamMember;
  isCurrentUser: boolean;
  onRoleChange: (memberId: string, role: TeamMemberRole) => Promise<void>;
  onRemove: (memberId: string) => Promise<void>;
  isUpdating: boolean;
}

function MemberTableRow({ member, isCurrentUser, onRoleChange, onRemove, isUpdating }: MemberTableRowProps) {
  const [isChangingRole, setIsChangingRole] = useState(false);

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

  const displayName = member.display_name || member.email.split('@')[0];
  const username = member.email.split('@')[0];
  const avatarColor = getAvatarPattern(member.email);
  const joinedDate = new Date(member.joined_at);
  const updatedDate = new Date(member.updated_at);

  return (
    <tr className="border-b hover:bg-muted/50">
      {/* Account */}
      <td className="py-4 px-4">
        <div className="flex items-center gap-3">
          <div className={`h-10 w-10 rounded-full ${avatarColor} flex items-center justify-center`}>
            <span className="text-sm font-medium text-white">
              {displayName.slice(0, 2).toUpperCase()}
            </span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium">{displayName}</span>
              {isCurrentUser && (
                <Badge variant="outline" className="text-xs border-green-500 text-green-600 dark:text-green-400">
                  It's you
                </Badge>
              )}
            </div>
            <span className="text-sm text-muted-foreground">@{username}</span>
          </div>
        </div>
      </td>

      {/* Source */}
      <td className="py-4 px-4">
        <span className="text-sm text-muted-foreground">
          {member.invited_by ? (
            <>Direct member by <span className="text-blue-600 dark:text-blue-400">Admin</span></>
          ) : (
            'Direct member'
          )}
        </span>
      </td>

      {/* Role */}
      <td className="py-4 px-4">
        <Select
          value={member.role}
          onValueChange={handleRoleChange}
          disabled={isUpdating || isChangingRole}
        >
          <SelectTrigger className="w-auto border-0 p-0 h-auto shadow-none focus:ring-0">
            <span className={`font-medium capitalize ${getRoleColor(member.role)}`}>
              {member.role}
            </span>
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
      </td>

      {/* Joined */}
      <td className="py-4 px-4">
        <span className="text-sm">{format(joinedDate, 'MMM dd, yyyy')}</span>
      </td>

      {/* Activity */}
      <td className="py-4 px-4">
        <div className="text-sm space-y-0.5">
          <div className="flex items-center gap-2 text-muted-foreground">
            <UserPlus2 className="h-3.5 w-3.5" />
            <span>{format(joinedDate, 'MMM dd, yyyy')}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>{format(updatedDate, 'MMM dd, yyyy')}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Hourglass className="h-3.5 w-3.5" />
            <span>{format(updatedDate, 'MMM dd, yyyy')}</span>
          </div>
        </div>
      </td>

      {/* Actions */}
      <td className="py-4 px-4 w-10">
        {!isCurrentUser && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
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
        )}
      </td>
    </tr>
  );
}

interface InvitationTableRowProps {
  invitation: TeamInvitation;
  teamName: string;
  onRoleChange: (invitationId: string, role: TeamMemberRole) => Promise<void>;
  onCancel: (invitationId: string) => Promise<void>;
  isUpdating: boolean;
}

function InvitationTableRow({ invitation, teamName, onRoleChange, onCancel, isUpdating }: InvitationTableRowProps) {
  const [isChangingRole, setIsChangingRole] = useState(false);
  const [isCanceling, setIsCanceling] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  const expiresAt = new Date(invitation.expires_at);
  const createdAt = new Date(invitation.created_at);
  const isExpired = invitation.status === 'expired' || expiresAt < new Date();
  const isPending = invitation.status === 'pending' && !isExpired;
  const effectiveStatus = isExpired && invitation.status === 'pending' ? 'expired' : invitation.status;

  const handleRoleChange = async (newRole: TeamMemberRole) => {
    if (newRole === invitation.role) return;
    setIsChangingRole(true);
    try {
      await onRoleChange(invitation.id, newRole);
    } finally {
      setIsChangingRole(false);
    }
  };

  const handleCancel = async () => {
    setIsCanceling(true);
    try {
      await onCancel(invitation.id);
    } finally {
      setIsCanceling(false);
    }
  };

  const handleCopyLink = async () => {
    if (!invitation.token) return;
    const url = `${window.location.origin}/join?token=${invitation.token}`;
    try {
      await navigator.clipboard.writeText(url);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy link:', err);
    }
  };

  const handleSendEmail = () => {
    if (!invitation.token) return;
    const inviteUrl = `${window.location.origin}/join?token=${invitation.token}`;
    const daysUntilExpiry = Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

    const subject = encodeURIComponent(`You're invited to join ${teamName} on Vibe Kanban`);
    const body = encodeURIComponent(
`Hi,

You've been invited to join the team "${teamName}" as a ${invitation.role.charAt(0).toUpperCase() + invitation.role.slice(1)}.

Click here to accept: ${inviteUrl}

This invitation expires in ${daysUntilExpiry} day${daysUntilExpiry !== 1 ? 's' : ''}.

Best regards`
    );

    window.open(`mailto:${invitation.email}?subject=${subject}&body=${body}`, '_blank');
  };

  const username = invitation.email.split('@')[0];

  return (
    <tr className="border-b hover:bg-muted/50">
      {/* Account */}
      <td className="py-4 px-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
            <Mail className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium">{invitation.email}</span>
              <Badge
                variant={effectiveStatus === 'pending' ? 'secondary' : effectiveStatus === 'accepted' ? 'default' : 'outline'}
                className="text-xs"
              >
                {effectiveStatus}
              </Badge>
            </div>
            <span className="text-sm text-muted-foreground">@{username}</span>
          </div>
        </div>
      </td>

      {/* Source */}
      <td className="py-4 px-4">
        <span className="text-sm text-muted-foreground">Pending invitation</span>
      </td>

      {/* Role */}
      <td className="py-4 px-4">
        {isPending ? (
          <Select
            value={invitation.role}
            onValueChange={handleRoleChange}
            disabled={isUpdating || isChangingRole}
          >
            <SelectTrigger className="w-auto border-0 p-0 h-auto shadow-none focus:ring-0">
              <span className={`font-medium capitalize ${getRoleColor(invitation.role)}`}>
                {invitation.role}
              </span>
            </SelectTrigger>
            <SelectContent>
              {ROLE_OPTIONS.filter(o => o.value !== 'owner').map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  <div className="flex items-center gap-2">
                    <option.icon className="h-4 w-4" />
                    <span>{option.label}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className={`font-medium capitalize ${getRoleColor(invitation.role)}`}>
            {invitation.role}
          </span>
        )}
      </td>

      {/* Expiration */}
      <td className="py-4 px-4">
        <div className="flex items-center gap-2">
          <span className={`text-sm ${isExpired ? 'text-destructive' : ''}`}>
            {format(expiresAt, 'MMM dd, yyyy')}
          </span>
        </div>
      </td>

      {/* Activity */}
      <td className="py-4 px-4">
        <div className="text-sm space-y-0.5">
          <div className="flex items-center gap-2 text-muted-foreground">
            <UserPlus2 className="h-3.5 w-3.5" />
            <span>{format(createdAt, 'MMM dd, yyyy')}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Hourglass className="h-3.5 w-3.5" />
            <span>{format(expiresAt, 'MMM dd, yyyy')}</span>
          </div>
        </div>
      </td>

      {/* Actions */}
      <td className="py-4 px-4 w-10">
        <div className="flex items-center gap-1">
          {isPending && invitation.token && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={handleSendEmail}
                title="Send invite email"
              >
                <Send className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={handleCopyLink}
                title="Copy invite link"
              >
                {isCopied ? (
                  <Check className="h-4 w-4 text-green-600" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={handleCancel}
                disabled={isCanceling}
                title="Cancel invitation"
              >
                {isCanceling ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <X className="h-4 w-4" />
                )}
              </Button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

export function TeamMembers() {
  const { teamId } = useParams<{ teamId: string }>();
  const { resolveTeam } = useTeams();
  const team = teamId ? resolveTeam(teamId) : undefined;
  const actualTeamId = team?.id;

  const {
    members,
    invitations,
    isLoading,
    error,
    updateMemberRole,
    removeMember,
    updateInvitationRole,
    cancelInvitation,
  } = useTeamMembers(actualTeamId);
  const [isUpdating, setIsUpdating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortField>('account');
  const [sortAsc, setSortAsc] = useState(true);

  // TODO: Get current user email from auth context
  const currentUserEmail = 'rupeshpanwar43@gmail.com';

  const totalCount = members.length + invitations.filter(i => i.status === 'pending').length;

  // Filter and sort members
  const filteredMembers = useMemo(() => {
    let result = [...members];

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(m =>
        m.display_name?.toLowerCase().includes(query) ||
        m.email.toLowerCase().includes(query)
      );
    }

    // Sort
    result.sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case 'account':
          comparison = (a.display_name || a.email).localeCompare(b.display_name || b.email);
          break;
        case 'role': {
          const roleOrder: Record<TeamMemberRole, number> = { owner: 0, maintainer: 1, contributor: 2, viewer: 3 };
          comparison = roleOrder[a.role] - roleOrder[b.role];
          break;
        }
        case 'created':
          comparison = new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime();
          break;
        case 'activity':
          comparison = new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime();
          break;
      }
      return sortAsc ? comparison : -comparison;
    });

    return result;
  }, [members, searchQuery, sortBy, sortAsc]);

  // Filter invitations (only pending shown in main list)
  const filteredInvitations = useMemo(() => {
    let result = invitations.filter(i => i.status === 'pending');

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(i => i.email.toLowerCase().includes(query));
    }

    return result;
  }, [invitations, searchQuery]);

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

  const handleInvitationRoleChange = async (invitationId: string, role: TeamMemberRole) => {
    setIsUpdating(true);
    try {
      await updateInvitationRole(invitationId, role);
    } finally {
      setIsUpdating(false);
    }
  };

  const toggleSortDirection = () => {
    setSortAsc(!sortAsc);
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
      <div className="px-6 py-6 border-b">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Team Members</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage who has access to {team.name}
            </p>
          </div>
          <Button onClick={handleInvite}>
            <UserPlus className="h-4 w-4 mr-2" />
            Invite people
          </Button>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="px-6 border-b">
        <button className="px-4 py-3 border-b-2 border-primary text-sm font-medium">
          Members <Badge variant="secondary" className="ml-2">{totalCount}</Badge>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="px-6 py-4 flex items-center gap-4 border-b">
        {/* Time Filter */}
        <Select defaultValue="all">
          <SelectTrigger className="w-[110px]">
            <Clock className="h-4 w-4 mr-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All time</SelectItem>
            <SelectItem value="week">Last week</SelectItem>
            <SelectItem value="month">Last month</SelectItem>
            <SelectItem value="year">Last year</SelectItem>
          </SelectContent>
        </Select>

        {/* Search */}
        <div className="flex-1 relative">
          <Input
            placeholder="Filter members"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pr-10"
          />
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        </div>

        {/* Sort By */}
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortField)}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="account">Account</SelectItem>
            <SelectItem value="role">Role</SelectItem>
            <SelectItem value="created">User created</SelectItem>
            <SelectItem value="activity">Last activity</SelectItem>
          </SelectContent>
        </Select>

        {/* Sort Direction */}
        <Button variant="outline" size="icon" onClick={toggleSortDirection}>
          <ArrowUpDown className="h-4 w-4" />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {error && (
          <Alert variant="destructive" className="m-6">
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b text-left text-sm text-muted-foreground">
                <th className="py-3 px-4 font-medium">Account</th>
                <th className="py-3 px-4 font-medium">Source</th>
                <th className="py-3 px-4 font-medium">Role</th>
                <th className="py-3 px-4 font-medium">Joined</th>
                <th className="py-3 px-4 font-medium">Activity</th>
                <th className="py-3 px-4 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {filteredMembers.map((member) => (
                <MemberTableRow
                  key={member.id}
                  member={member}
                  isCurrentUser={member.email === currentUserEmail}
                  onRoleChange={handleRoleChange}
                  onRemove={handleRemoveMember}
                  isUpdating={isUpdating}
                />
              ))}
              {filteredInvitations.map((invitation) => (
                <InvitationTableRow
                  key={invitation.id}
                  invitation={invitation}
                  teamName={team.name}
                  onRoleChange={handleInvitationRoleChange}
                  onCancel={handleCancelInvitation}
                  isUpdating={isUpdating}
                />
              ))}
              {filteredMembers.length === 0 && filteredInvitations.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-muted-foreground">
                    <Mail className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No members found</p>
                    <p className="text-sm">Invite people to join this team</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

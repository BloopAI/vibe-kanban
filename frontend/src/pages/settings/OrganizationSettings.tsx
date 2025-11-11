import { useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, UserPlus } from 'lucide-react';
import { useUserOrganizations } from '@/hooks/useUserOrganizations';
import { useOrganizationSelection } from '@/hooks/useOrganizationSelection';
import { useOrganizationMembersQuery } from '@/hooks/useOrganizationMembersQuery';
import { useOrganizationInvitations } from '@/hooks/useOrganizationInvitations';
import { useOrganizationMutations } from '@/hooks/useOrganizationMutations';
import { useUserSystem } from '@/components/config-provider';
import NiceModal from '@ebay/nice-modal-react';
import {
  InviteMemberDialog,
  type InviteMemberResult,
} from '@/components/dialogs/org/InviteMemberDialog';
import { MemberListItem } from '@/components/org/MemberListItem';
import { PendingInvitationItem } from '@/components/org/PendingInvitationItem';
import type { MemberRole } from 'shared/types';
import { MemberRole as MemberRoleEnum } from 'shared/types';
import { useTranslation } from 'react-i18next';

export function OrganizationSettings() {
  const { t } = useTranslation('organization');
  const { loginStatus } = useUserSystem();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Fetch all organizations
  const {
    data: orgsResponse,
    isLoading: orgsLoading,
    error: orgsError,
  } = useUserOrganizations();

  // Organization selection with URL sync
  const { selectedOrgId, selectedOrg, handleOrgSelect } =
    useOrganizationSelection({
      organizations: orgsResponse,
      onSelectionChange: () => {
        setSuccess(null);
        setError(null);
      },
    });

  // Get current user's role and ID
  const currentUserRole = selectedOrg?.user_role;
  const isAdmin = currentUserRole === MemberRoleEnum.ADMIN;
  const currentUserId =
    loginStatus?.status === 'loggedin' ? loginStatus.profile.user_id : null;

  // Fetch members using query hook
  const { data: members = [], isLoading: loadingMembers } =
    useOrganizationMembersQuery({
      organizationId: selectedOrgId || null,
    });

  // Fetch invitations using query hook (admin only)
  const { data: invitations = [], isLoading: loadingInvitations } =
    useOrganizationInvitations({
      organizationId: selectedOrgId || null,
      isAdmin,
    });

  // Organization mutations
  const { removeMember, updateMemberRole, refetchMembers, refetchInvitations } =
    useOrganizationMutations({
      onRemoveSuccess: () => {
        setSuccess('Member removed successfully');
        setTimeout(() => setSuccess(null), 3000);
      },
      onRemoveError: (err) => {
        setError(
          err instanceof Error ? err.message : 'Failed to remove member'
        );
      },
      onRoleChangeSuccess: () => {
        setSuccess('Member role updated successfully');
        setTimeout(() => setSuccess(null), 3000);
      },
      onRoleChangeError: (err) => {
        setError(
          err instanceof Error ? err.message : 'Failed to update member role'
        );
      },
    });

  const handleInviteMember = async () => {
    try {
      const result: InviteMemberResult =
        await NiceModal.show(InviteMemberDialog);

      if (result.action === 'invited') {
        if (selectedOrgId) {
          await refetchMembers(selectedOrgId);
          if (isAdmin) {
            await refetchInvitations(selectedOrgId);
          }

          setSuccess('Member invited successfully');
          setTimeout(() => setSuccess(null), 3000);
        }
      }
    } catch (err) {
      // Dialog error
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!selectedOrgId) return;

    const confirmed = window.confirm(t('confirmRemoveMember'));
    if (!confirmed) return;

    setError(null);
    removeMember.mutate({ orgId: selectedOrgId, userId });
  };

  const handleRoleChange = async (userId: string, newRole: MemberRole) => {
    if (!selectedOrgId) return;

    setError(null);
    updateMemberRole.mutate({ orgId: selectedOrgId, userId, role: newRole });
  };

  if (orgsLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">
          {t('settings.loadingOrganizations')}
        </span>
      </div>
    );
  }

  if (orgsError) {
    return (
      <div className="py-8">
        <Alert variant="destructive">
          <AlertDescription>
            {orgsError instanceof Error
              ? orgsError.message
              : t('settings.loadError')}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const organizations = orgsResponse?.organizations ?? [];

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert variant="success">
          <AlertDescription className="font-medium">{success}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.title')}</CardTitle>
          <CardDescription>
            {t('settings.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="org-selector">
              {t('settings.selectLabel')}
            </Label>
            <Select value={selectedOrgId} onValueChange={handleOrgSelect}>
              <SelectTrigger id="org-selector">
                <SelectValue
                  placeholder={t('settings.selectPlaceholder')}
                />
              </SelectTrigger>
              <SelectContent>
                {organizations.length > 0 ? (
                  organizations.map((org) => (
                    <SelectItem key={org.id} value={org.id}>
                      {org.name}
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value="no-orgs" disabled>
                    {t('settings.noOrganizations')}
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              {t('settings.selectHelper')}
            </p>
          </div>
        </CardContent>
      </Card>

      {selectedOrg && isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>{t('invitationList.title')}</CardTitle>
            <CardDescription>
              {t('invitationList.description', {
                orgName: selectedOrg.name,
              })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingInvitations ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
                <span className="ml-2">
                  {t('invitationList.loading')}
                </span>
              </div>
            ) : invitations.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {t('invitationList.none')}
              </div>
            ) : (
              <div className="space-y-3">
                {invitations.map((invitation) => (
                  <PendingInvitationItem
                    key={invitation.id}
                    invitation={invitation}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {selectedOrg && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>{t('memberList.title')}</CardTitle>
                <CardDescription>
                  {t('memberList.description', {
                    orgName: selectedOrg.name,
                  })}
                </CardDescription>
              </div>
              {isAdmin && (
                <Button onClick={handleInviteMember} size="sm">
                  <UserPlus className="h-4 w-4 mr-2" />
                  {t('memberList.inviteButton')}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {loadingMembers ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
                <span className="ml-2">
                  {t('memberList.loading')}
                </span>
              </div>
            ) : members.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {t('memberList.none')}
              </div>
            ) : (
              <div className="space-y-3">
                {members.map((member) => (
                  <MemberListItem
                    key={member.user_id}
                    member={member}
                    currentUserId={currentUserId}
                    isAdmin={isAdmin}
                    onRemove={handleRemoveMember}
                    onRoleChange={handleRoleChange}
                    isRemoving={removeMember.isPending}
                    isRoleChanging={updateMemberRole.isPending}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

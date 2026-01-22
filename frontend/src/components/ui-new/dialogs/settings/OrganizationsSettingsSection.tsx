import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  SpinnerIcon,
  PlusIcon,
  UserPlusIcon,
  TrashIcon,
  SignInIcon,
} from '@phosphor-icons/react';
import { useUserOrganizations } from '@/hooks/useUserOrganizations';
import { useOrganizationSelection } from '@/hooks/useOrganizationSelection';
import { useOrganizationMembers } from '@/hooks/useOrganizationMembers';
import { useOrganizationInvitations } from '@/hooks/useOrganizationInvitations';
import { useOrganizationMutations } from '@/hooks/useOrganizationMutations';
import { useUserSystem } from '@/components/ConfigProvider';
import { useAuth } from '@/hooks/auth/useAuth';
import { OAuthDialog } from '@/components/dialogs/global/OAuthDialog';
import { CreateOrganizationDialog } from '@/components/dialogs/org/CreateOrganizationDialog';
import { InviteMemberDialog } from '@/components/dialogs/org/InviteMemberDialog';
import type {
  InviteMemberResult,
  CreateOrganizationResult,
} from '@/components/dialogs';
import { MemberListItem } from '@/components/org/MemberListItem';
import { PendingInvitationItem } from '@/components/org/PendingInvitationItem';
import type { MemberRole } from 'shared/types';
import { MemberRole as MemberRoleEnum } from 'shared/types';
import { cn } from '@/lib/utils';
import { PrimaryButton } from '../../primitives/PrimaryButton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuTriggerButton,
} from '../../primitives/Dropdown';
import { SettingsCard, SettingsField } from './SettingsComponents';

export function OrganizationsSettingsSection() {
  const { t } = useTranslation('organization');
  const { loginStatus } = useUserSystem();
  const { isSignedIn, isLoaded } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Fetch all organizations
  const {
    data: orgsResponse,
    isLoading: orgsLoading,
    error: orgsError,
    refetch: refetchOrgs,
  } = useUserOrganizations();

  // Organization selection
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
  const isPersonalOrg = selectedOrg?.is_personal ?? false;
  const currentUserId =
    loginStatus?.status === 'loggedin' ? loginStatus.profile.user_id : null;

  // Fetch members
  const { data: members = [], isLoading: loadingMembers } =
    useOrganizationMembers(selectedOrgId);

  // Fetch invitations (admin only)
  const { data: invitations = [], isLoading: loadingInvitations } =
    useOrganizationInvitations({
      organizationId: selectedOrgId || null,
      isAdmin,
      isPersonal: isPersonalOrg,
    });

  // Organization mutations
  const {
    removeMember,
    updateMemberRole,
    revokeInvitation,
    deleteOrganization,
  } = useOrganizationMutations({
    onRevokeSuccess: () => {
      setSuccess('Invitation revoked successfully');
      setTimeout(() => setSuccess(null), 3000);
    },
    onRevokeError: (err) => {
      setError(
        err instanceof Error ? err.message : 'Failed to revoke invitation'
      );
    },
    onRemoveSuccess: () => {
      setSuccess('Member removed successfully');
      setTimeout(() => setSuccess(null), 3000);
    },
    onRemoveError: (err) => {
      setError(err instanceof Error ? err.message : 'Failed to remove member');
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
    onDeleteSuccess: async () => {
      setSuccess(t('settings.deleteSuccess'));
      setTimeout(() => setSuccess(null), 3000);
      await refetchOrgs();
      if (orgsResponse?.organizations) {
        const personalOrg = orgsResponse.organizations.find(
          (org) => org.is_personal
        );
        if (personalOrg) {
          handleOrgSelect(personalOrg.id);
        }
      }
    },
    onDeleteError: (err) => {
      setError(err instanceof Error ? err.message : t('settings.deleteError'));
    },
  });

  const handleCreateOrganization = async () => {
    try {
      const result: CreateOrganizationResult =
        await CreateOrganizationDialog.show();

      if (result.action === 'created' && result.organizationId) {
        handleOrgSelect(result.organizationId ?? '');
        setSuccess('Organization created successfully');
        setTimeout(() => setSuccess(null), 3000);
      }
    } catch {
      // Dialog cancelled
    }
  };

  const handleInviteMember = async () => {
    if (!selectedOrgId) return;

    try {
      const result: InviteMemberResult = await InviteMemberDialog.show({
        organizationId: selectedOrgId,
      });

      if (result.action === 'invited') {
        setSuccess('Member invited successfully');
        setTimeout(() => setSuccess(null), 3000);
      }
    } catch {
      // Dialog cancelled
    }
  };

  const handleRevokeInvitation = (invitationId: string) => {
    if (!selectedOrgId) return;
    setError(null);
    revokeInvitation.mutate({ orgId: selectedOrgId, invitationId });
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

  const handleDeleteOrganization = async () => {
    if (!selectedOrgId || !selectedOrg) return;

    const confirmed = window.confirm(
      t('settings.confirmDelete', { orgName: selectedOrg.name })
    );
    if (!confirmed) return;

    setError(null);
    deleteOrganization.mutate(selectedOrgId);
  };

  if (!isLoaded || orgsLoading) {
    return (
      <div className="flex items-center justify-center py-8 gap-2">
        <SpinnerIcon
          className="size-icon-lg animate-spin text-brand"
          weight="bold"
        />
        <span className="text-normal">
          {t('settings.loadingOrganizations')}
        </span>
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-base font-medium text-high">
            {t('loginRequired.title')}
          </h3>
          <p className="text-sm text-low mt-1">
            {t('loginRequired.description')}
          </p>
        </div>
        <PrimaryButton
          variant="secondary"
          value={t('loginRequired.action')}
          onClick={() => void OAuthDialog.show()}
        >
          <SignInIcon className="size-icon-xs mr-1" weight="bold" />
        </PrimaryButton>
      </div>
    );
  }

  if (orgsError) {
    return (
      <div className="py-8">
        <div className="bg-error/10 border border-error/50 rounded-sm p-4 text-error">
          {orgsError instanceof Error
            ? orgsError.message
            : t('settings.loadError')}
        </div>
      </div>
    );
  }

  const organizations = orgsResponse?.organizations ?? [];
  const orgOptions = organizations.map((org) => ({
    value: org.id,
    label: org.name,
  }));

  return (
    <>
      {/* Status messages */}
      {error && (
        <div className="bg-error/10 border border-error/50 rounded-sm p-4 text-error">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-success/10 border border-success/50 rounded-sm p-4 text-success font-medium">
          {success}
        </div>
      )}

      {/* Organization selector */}
      <SettingsCard
        title={t('settings.title')}
        description={t('settings.description')}
        headerAction={
          <PrimaryButton
            variant="secondary"
            value={t('createDialog.createButton')}
            onClick={handleCreateOrganization}
          >
            <PlusIcon className="size-icon-xs mr-1" weight="bold" />
          </PrimaryButton>
        }
      >
        <SettingsField
          label={t('settings.selectLabel')}
          description={t('settings.selectHelper')}
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <DropdownMenuTriggerButton
                label={
                  orgOptions.find((o) => o.value === selectedOrgId)?.label ||
                  t('settings.selectPlaceholder')
                }
                className="w-full justify-between"
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-[var(--radix-dropdown-menu-trigger-width)]">
              {orgOptions.length > 0 ? (
                orgOptions.map((option) => (
                  <DropdownMenuItem
                    key={option.value}
                    onClick={() => handleOrgSelect(option.value)}
                  >
                    {option.label}
                  </DropdownMenuItem>
                ))
              ) : (
                <DropdownMenuItem disabled>
                  {t('settings.noOrganizations')}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </SettingsField>
      </SettingsCard>

      {/* Pending Invitations (admin only) */}
      {selectedOrg && isAdmin && !isPersonalOrg && (
        <SettingsCard
          title={t('invitationList.title')}
          description={t('invitationList.description', {
            orgName: selectedOrg.name,
          })}
        >
          {loadingInvitations ? (
            <div className="flex items-center justify-center py-4 gap-2">
              <SpinnerIcon className="size-icon-sm animate-spin" />
              <span className="text-sm text-low">
                {t('invitationList.loading')}
              </span>
            </div>
          ) : invitations.length === 0 ? (
            <div className="text-center py-4 text-sm text-low">
              {t('invitationList.none')}
            </div>
          ) : (
            <div className="space-y-2">
              {invitations.map((invitation) => (
                <PendingInvitationItem
                  key={invitation.id}
                  invitation={invitation}
                  onRevoke={handleRevokeInvitation}
                  isRevoking={revokeInvitation.isPending}
                />
              ))}
            </div>
          )}
        </SettingsCard>
      )}

      {/* Members */}
      {selectedOrg && (
        <SettingsCard
          title={t('memberList.title')}
          description={t('memberList.description', {
            orgName: selectedOrg.name,
          })}
          headerAction={
            isAdmin && !isPersonalOrg ? (
              <PrimaryButton
                variant="secondary"
                value={t('memberList.inviteButton')}
                onClick={handleInviteMember}
              >
                <UserPlusIcon className="size-icon-xs mr-1" weight="bold" />
              </PrimaryButton>
            ) : undefined
          }
        >
          {loadingMembers ? (
            <div className="flex items-center justify-center py-4 gap-2">
              <SpinnerIcon className="size-icon-sm animate-spin" />
              <span className="text-sm text-low">
                {t('memberList.loading')}
              </span>
            </div>
          ) : members.length === 0 ? (
            <div className="text-center py-4 text-sm text-low">
              {t('memberList.none')}
            </div>
          ) : (
            <div className="space-y-2">
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
        </SettingsCard>
      )}

      {/* Danger Zone */}
      {selectedOrg && isAdmin && !isPersonalOrg && (
        <SettingsCard
          title={t('settings.dangerZone')}
          description={t('settings.dangerZoneDescription')}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-normal">
                {t('settings.deleteOrganization')}
              </p>
              <p className="text-sm text-low">
                {t('settings.deleteOrganizationDescription')}
              </p>
            </div>
            <button
              onClick={handleDeleteOrganization}
              disabled={deleteOrganization.isPending}
              className={cn(
                'flex items-center gap-2 px-base py-half rounded-sm text-sm font-medium',
                'bg-error/10 text-error hover:bg-error/20 border border-error/50',
                'disabled:opacity-50 disabled:cursor-not-allowed transition-colors'
              )}
            >
              {deleteOrganization.isPending ? (
                <SpinnerIcon className="size-icon-xs animate-spin" />
              ) : (
                <TrashIcon className="size-icon-xs" weight="bold" />
              )}
              {t('common:buttons.delete')}
            </button>
          </div>
        </SettingsCard>
      )}
    </>
  );
}

// Alias for backwards compatibility
export { OrganizationsSettingsSection as OrganizationsSettingsSectionContent };

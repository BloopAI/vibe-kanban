import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import type { OrganizationWithRole } from 'shared/types';
import { AppBarUserPopover } from '../primitives/AppBarUserPopover';
import { SettingsDialog } from '../dialogs/SettingsDialog';
import { useAuth } from '@/hooks/auth/useAuth';
import { useUserSystem } from '@/components/ConfigProvider';
import { OAuthDialog } from '@/components/dialogs/global/OAuthDialog';
import { oauthApi } from '@/lib/api';
import { useOrganizationStore } from '@/stores/useOrganizationStore';
import { organizationKeys } from '@/hooks/organizationKeys';

interface AppBarUserPopoverContainerProps {
  organizations: OrganizationWithRole[];
  selectedOrgId: string;
  onOrgSelect: (orgId: string) => void;
  onCreateOrg: () => void;
}

export function AppBarUserPopoverContainer({
  organizations,
  selectedOrgId,
  onOrgSelect,
  onCreateOrg,
}: AppBarUserPopoverContainerProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const { isSignedIn } = useAuth();
  const { loginStatus, reloadSystem } = useUserSystem();
  const clearSelectedOrgId = useOrganizationStore((s) => s.clearSelectedOrgId);
  const setSelectedOrgId = useOrganizationStore((s) => s.setSelectedOrgId);
  const [open, setOpen] = useState(false);
  const [avatarError, setAvatarError] = useState(false);

  // Extract avatar URL from first provider
  const avatarUrl =
    loginStatus?.status === 'loggedin'
      ? (loginStatus.profile.providers[0]?.avatar_url ?? null)
      : null;

  const handleSignIn = async () => {
    // OAuthDialog handles reloadSystem() and cache invalidation on success
    await OAuthDialog.show();
  };

  const handleLogout = async () => {
    try {
      await oauthApi.logout();

      // Clear organization selection
      clearSelectedOrgId();

      // Clear organization query caches so stale data doesn't persist
      queryClient.removeQueries({ queryKey: organizationKeys.all });

      await reloadSystem();

      // Navigate away from project routes after logout
      if (location.pathname.startsWith('/projects/')) {
        navigate('/workspaces');
      }
    } catch (err) {
      console.error('Error logging out:', err);
    }
  };

  const handleOrgSettings = async (orgId: string) => {
    setSelectedOrgId(orgId);
    await SettingsDialog.show({ initialSection: 'organizations' });
  };

  return (
    <AppBarUserPopover
      isSignedIn={isSignedIn}
      avatarUrl={avatarUrl}
      avatarError={avatarError}
      organizations={organizations}
      selectedOrgId={selectedOrgId}
      open={open}
      onOpenChange={setOpen}
      onOrgSelect={onOrgSelect}
      onCreateOrg={onCreateOrg}
      onOrgSettings={handleOrgSettings}
      onSignIn={handleSignIn}
      onLogout={handleLogout}
      onAvatarError={() => setAvatarError(true)}
    />
  );
}

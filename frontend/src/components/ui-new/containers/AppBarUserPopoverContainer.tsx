import { useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import type { OrganizationWithRole } from 'shared/types';
import { AppBarUserPopover } from '../primitives/AppBarUserPopover';
import { useAuth } from '@/hooks/auth/useAuth';
import { useUserSystem } from '@/components/ConfigProvider';
import { OAuthDialog } from '@/components/dialogs/global/OAuthDialog';
import { oauthApi } from '@/lib/api';

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

  // Extract avatar URL from first provider
  const avatarUrl =
    loginStatus?.status === 'loggedin'
      ? (loginStatus.profile.providers[0]?.avatar_url ?? null)
      : null;

  const handleSignIn = async () => {
    const profile = await OAuthDialog.show();
    if (profile) {
      await reloadSystem();
    }
  };

  const handleLogout = async () => {
    try {
      await oauthApi.logout();

      // Clear user-related query caches so stale data doesn't persist
      queryClient.removeQueries({ queryKey: ['user', 'organizations'] });
      queryClient.removeQueries({ queryKey: ['organizations'] });

      await reloadSystem();

      // Navigate away from project routes after logout
      if (location.pathname.startsWith('/projects/')) {
        navigate('/workspaces');
      }
    } catch (err) {
      console.error('Error logging out:', err);
    }
  };

  return (
    <AppBarUserPopover
      isSignedIn={isSignedIn}
      avatarUrl={avatarUrl}
      organizations={organizations}
      selectedOrgId={selectedOrgId}
      onOrgSelect={onOrgSelect}
      onCreateOrg={onCreateOrg}
      onSignIn={handleSignIn}
      onLogout={handleLogout}
    />
  );
}

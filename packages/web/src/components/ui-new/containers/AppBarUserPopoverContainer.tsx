import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import type { OrganizationWithRole } from 'shared/types';
import { AppBarUserPopover } from '@vibe/ui/components/AppBarUserPopover';
import { SettingsDialog } from '@/dialogs/settings/SettingsDialog';
import { useAuth } from '@/hooks/auth/useAuth';
import { useUserSystem } from '@/shared/hooks/useUserSystem';
import { useOrganizationStore } from '@/shared/stores/useOrganizationStore';
import { useActions } from '@/contexts/ActionsContext';
import { Actions } from '@/components/ui-new/actions';
import { toMigrate } from '@/shared/lib/routes/navigation';

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
  const { executeAction } = useActions();
  const { isSignedIn } = useAuth();
  const { loginStatus } = useUserSystem();
  const setSelectedOrgId = useOrganizationStore((s) => s.setSelectedOrgId);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [avatarError, setAvatarError] = useState(false);

  // Extract avatar URL from first provider
  const avatarUrl =
    loginStatus?.status === 'loggedin'
      ? (loginStatus.profile.providers[0]?.avatar_url ?? null)
      : null;

  const handleSignIn = async () => {
    await executeAction(Actions.SignIn);
  };

  const handleLogout = async () => {
    await executeAction(Actions.SignOut);
  };

  const handleOrgSettings = async (orgId: string) => {
    setSelectedOrgId(orgId);
    await SettingsDialog.show({ initialSection: 'organizations' });
  };

  const handleMigrate = () => {
    setOpen(false);
    navigate(toMigrate());
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
      onMigrate={handleMigrate}
    />
  );
}

import { useCallback, useState } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import type { OrganizationWithRole } from "shared/types";
import { AppBarUserPopover } from "@vibe/ui/components/AppBarUserPopover";
import { logout } from "@remote/shared/lib/api";
import { SettingsDialog } from "@/shared/dialogs/settings/SettingsDialog";
import { useAuth } from "@/shared/hooks/auth/useAuth";
import { REMOTE_SETTINGS_SECTIONS } from "@remote/shared/constants/settings";

interface RemoteAppBarUserPopoverContainerProps {
  organizations: OrganizationWithRole[];
  selectedOrgId: string;
  onOrgSelect: (orgId: string) => void;
}

function toNextPath({
  pathname,
  searchStr,
  hash,
}: Pick<ReturnType<typeof useLocation>, "pathname" | "searchStr" | "hash">) {
  return `${pathname}${searchStr}${hash}`;
}

export function RemoteAppBarUserPopoverContainer({
  organizations,
  selectedOrgId,
  onOrgSelect,
}: RemoteAppBarUserPopoverContainerProps) {
  const { isSignedIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [avatarError, setAvatarError] = useState(false);

  const handleSignIn = useCallback(() => {
    const next = toNextPath(location);

    navigate({
      to: "/account",
      search: next !== "/" ? { next } : undefined,
    });
  }, [location, navigate]);

  const handleLogout = useCallback(async () => {
    try {
      await logout();
    } catch (error) {
      console.error("Failed to log out in remote web:", error);
    }

    navigate({
      to: "/account",
      replace: true,
    });
  }, [navigate]);

  const handleOrgSettings = useCallback(
    async (orgId: string) => {
      onOrgSelect(orgId);
      await SettingsDialog.show({
        initialSection: "organizations",
        initialState: { organizationId: orgId },
        sections: REMOTE_SETTINGS_SECTIONS,
      });
    },
    [onOrgSelect],
  );

  return (
    <AppBarUserPopover
      isSignedIn={isSignedIn}
      avatarUrl={null}
      avatarError={avatarError}
      organizations={organizations}
      selectedOrgId={selectedOrgId}
      open={open}
      onOpenChange={setOpen}
      onOrgSelect={onOrgSelect}
      onOrgSettings={(orgId) => {
        void handleOrgSettings(orgId);
      }}
      onSignIn={handleSignIn}
      onLogout={() => {
        void handleLogout();
      }}
      onAvatarError={() => setAvatarError(true)}
    />
  );
}

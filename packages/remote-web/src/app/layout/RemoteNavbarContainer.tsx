import { useCallback, useEffect, useMemo, type ReactNode } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import {
  MOBILE_TABS,
  Navbar,
  type MobileTabId,
} from "@vibe/ui/components/Navbar";
import { SettingsDialog } from "@/shared/dialogs/settings/SettingsDialog";
import { REMOTE_SETTINGS_SECTIONS } from "@remote/shared/constants/settings";
import { useMobileActiveTab } from "@/shared/stores/useUiPreferencesStore";

interface RemoteNavbarContainerProps {
  organizationName: string | null;
  mobileMode?: boolean;
  onOpenDrawer?: () => void;
  mobileUserSlot?: ReactNode;
}

export function RemoteNavbarContainer({
  organizationName,
  mobileMode,
  onOpenDrawer,
  mobileUserSlot,
}: RemoteNavbarContainerProps) {
  const location = useLocation();

  const [mobileActiveTab, setMobileActiveTab] = useMobileActiveTab();

  const remoteMobileTabs = useMemo(
    () =>
      MOBILE_TABS.filter((t) => t.id !== "preview" && t.id !== "workspaces"),
    [],
  );

  const isOnWorkspaceView = /^\/workspaces\/[^/]+/.test(location.pathname);

  useEffect(() => {
    if (isOnWorkspaceView) {
      setMobileActiveTab("chat");
    }
  }, [isOnWorkspaceView, setMobileActiveTab]);
  const navigate = useNavigate();

  const isOnProjectPage = location.pathname.startsWith("/projects/");
  const projectId = isOnProjectPage ? location.pathname.split("/")[2] : null;
  const isOnProjectSubRoute =
    isOnProjectPage &&
    (location.pathname.includes("/issues/") ||
      location.pathname.includes("/workspaces/"));

  const workspaceTitle = useMemo(() => {
    if (isOnProjectPage) {
      return organizationName ?? "Project";
    }

    if (location.pathname.startsWith("/workspaces")) {
      return "Workspaces";
    }

    return "Organizations";
  }, [location.pathname, organizationName, isOnProjectPage]);

  const handleNavigateBack = useCallback(() => {
    if (isOnProjectPage && projectId) {
      // On project sub-route: go back to project root
      navigate({
        to: "/projects/$projectId",
        params: { projectId },
      });
    } else {
      // Non-project page: go home (NOT /workspaces — remote-web stubs)
      navigate({ to: "/" });
    }
  }, [navigate, isOnProjectPage, projectId]);

  const handleOpenSettings = useCallback(() => {
    SettingsDialog.show({ sections: REMOTE_SETTINGS_SECTIONS });
  }, []);

  return (
    <Navbar
      workspaceTitle={workspaceTitle}
      mobileMode={mobileMode}
      mobileUserSlot={mobileUserSlot}
      isOnProjectPage={isOnProjectPage}
      isOnProjectSubRoute={isOnProjectSubRoute}
      onNavigateBack={handleNavigateBack}
      onOpenDrawer={onOpenDrawer}
      onOpenSettings={handleOpenSettings}
      mobileActiveTab={mobileActiveTab as MobileTabId}
      onMobileTabChange={(tab) => setMobileActiveTab(tab)}
      mobileTabs={remoteMobileTabs}
      showMobileTabs={isOnWorkspaceView}
    />
  );
}

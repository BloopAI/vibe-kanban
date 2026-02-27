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
import { useMobileWorkspaceTitle } from "@remote/shared/stores/useMobileWorkspaceTitle";

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
  const mobileWorkspaceTitle = useMobileWorkspaceTitle((s) => s.title);

  const [mobileActiveTab, setMobileActiveTab] = useMobileActiveTab();

  const remoteMobileTabs = useMemo(
    () =>
      MOBILE_TABS.filter((t) => t.id !== "preview" && t.id !== "workspaces"),
    [],
  );

  const isOnWorkspaceView = /^\/workspaces\/[^/]+/.test(location.pathname);
  const isOnWorkspaceList =
    location.pathname === "/workspaces" || location.pathname === "/workspaces/";

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
    // Inside a workspace: show workspace name from store
    if (isOnWorkspaceView) {
      return mobileWorkspaceTitle ?? undefined;
    }
    // Home page or workspace list: no section title (Row 2 hidden)
    return undefined;
  }, [
    location.pathname,
    organizationName,
    isOnProjectPage,
    isOnWorkspaceView,
    mobileWorkspaceTitle,
  ]);

  const mobileShowBack = isOnWorkspaceView || isOnWorkspaceList;

  const handleNavigateBack = useCallback(() => {
    if (isOnProjectPage && projectId) {
      navigate({
        to: "/projects/$projectId",
        params: { projectId },
      });
    } else if (isOnWorkspaceView) {
      // Inside workspace: go back to workspace list
      navigate({ to: "/workspaces" });
    } else {
      // Workspace list or other: go home
      navigate({ to: "/" });
    }
  }, [navigate, isOnProjectPage, projectId, isOnWorkspaceView]);

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
      mobileShowBack={mobileShowBack}
      onOpenSettings={handleOpenSettings}
      onOpenDrawer={isOnProjectPage ? onOpenDrawer : undefined}
      mobileActiveTab={mobileActiveTab as MobileTabId}
      onMobileTabChange={(tab) => setMobileActiveTab(tab)}
      mobileTabs={remoteMobileTabs}
      showMobileTabs={isOnWorkspaceView}
    />
  );
}

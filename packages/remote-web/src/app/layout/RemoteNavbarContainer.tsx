import { useCallback, useMemo, type ReactNode } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { Navbar } from "@vibe/ui/components/Navbar";
import { SettingsDialog } from "@/shared/dialogs/settings/SettingsDialog";

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
    SettingsDialog.show();
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
    />
  );
}

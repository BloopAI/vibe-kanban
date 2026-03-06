import { useCallback, useEffect, useMemo, type ReactNode } from "react";
import { useLocation, useNavigate, useParams } from "@tanstack/react-router";
import {
  MOBILE_TABS,
  Navbar,
  type MobileTabId,
  type NavbarSectionItem,
} from "@vibe/ui/components/Navbar";
import { SettingsDialog } from "@/shared/dialogs/settings/SettingsDialog";
import { CommandBarDialog } from "@/shared/dialogs/command-bar/CommandBarDialog";
import { REMOTE_SETTINGS_SECTIONS } from "@remote/shared/constants/settings";
import { useMobileActiveTab } from "@/shared/stores/useUiPreferencesStore";
import { useMobileWorkspaceTitle } from "@remote/shared/stores/useMobileWorkspaceTitle";
import { useActions } from "@/shared/hooks/useActions";
import { useWorkspaceContext } from "@/shared/hooks/useWorkspaceContext";
import { useActionVisibilityContext } from "@/shared/hooks/useActionVisibilityContext";
import { NavbarActionGroups } from "@/shared/actions";
import {
  NavbarDivider,
  type ActionDefinition,
  type NavbarItem as ActionNavbarItem,
  type ActionVisibilityContext,
  isSpecialIcon,
  getActionIcon,
  getActionTooltip,
  isActionActive,
  isActionEnabled,
  isActionVisible,
} from "@/shared/types/actions";

/**
 * Check if a NavbarItem is a divider
 */
function isDivider(item: ActionNavbarItem): item is typeof NavbarDivider {
  return "type" in item && item.type === "divider";
}

/**
 * Filter navbar items by visibility, keeping dividers but removing them
 * if they would appear at the start, end, or consecutively.
 */
function filterNavbarItems(
  items: readonly ActionNavbarItem[],
  ctx: ActionVisibilityContext,
): ActionNavbarItem[] {
  const filtered = items.filter((item) => {
    if (isDivider(item)) return true;
    if (!isActionVisible(item, ctx)) return false;
    return !isSpecialIcon(getActionIcon(item, ctx));
  });

  const result: ActionNavbarItem[] = [];
  for (const item of filtered) {
    if (isDivider(item)) {
      if (result.length > 0 && !isDivider(result[result.length - 1])) {
        result.push(item);
      }
    } else {
      result.push(item);
    }
  }

  if (result.length > 0 && isDivider(result[result.length - 1])) {
    result.pop();
  }

  return result;
}

function toNavbarSectionItems(
  items: readonly ActionNavbarItem[],
  ctx: ActionVisibilityContext,
  onExecuteAction: (action: ActionDefinition) => void,
): NavbarSectionItem[] {
  return items.reduce<NavbarSectionItem[]>((result, item) => {
    if (isDivider(item)) {
      result.push({ type: "divider" });
      return result;
    }

    const icon = getActionIcon(item, ctx);
    if (isSpecialIcon(icon)) {
      return result;
    }

    result.push({
      type: "action",
      id: item.id,
      icon,
      isActive: isActionActive(item, ctx),
      tooltip: getActionTooltip(item, ctx),
      shortcut: item.shortcut,
      disabled: !isActionEnabled(item, ctx),
      onClick: () => onExecuteAction(item),
    });
    return result;
  }, []);
}

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
  const { hostId } = useParams({ strict: false });
  const mobileWorkspaceTitle = useMobileWorkspaceTitle((s) => s.title);
  const { executeAction } = useActions();
  const { workspace: selectedWorkspace } = useWorkspaceContext();
  const actionCtx = useActionVisibilityContext();

  const [mobileActiveTab, setMobileActiveTab] = useMobileActiveTab();

  const remoteMobileTabs = useMemo(
    () =>
      MOBILE_TABS.filter((t) => t.id !== "preview" && t.id !== "workspaces"),
    [],
  );

  const isOnWorkspaceView = /^\/hosts\/[^/]+\/workspaces\/[^/]+/.test(
    location.pathname,
  );
  const isOnWorkspaceList = /^\/hosts\/[^/]+\/workspaces\/?$/.test(
    location.pathname,
  );

  useEffect(() => {
    if (isOnWorkspaceView) {
      setMobileActiveTab("chat");
    }
  }, [isOnWorkspaceView, setMobileActiveTab]);
  const navigate = useNavigate();

  const isOnProjectPage = /^\/projects\/[^/]+/.test(location.pathname);
  const pathSegments = location.pathname.split("/").filter(Boolean);
  const projectSegmentIndex = pathSegments.indexOf("projects");
  const projectId =
    projectSegmentIndex === -1
      ? null
      : (pathSegments[projectSegmentIndex + 1] ?? null);
  const isOnProjectSubRoute =
    isOnProjectPage &&
    (location.pathname.includes("/issues/") ||
      location.pathname.includes("/workspaces/"));

  const handleExecuteAction = useCallback(
    (action: ActionDefinition) => {
      if (action.requiresTarget && selectedWorkspace?.id) {
        executeAction(action, selectedWorkspace.id);
      } else {
        executeAction(action);
      }
    },
    [executeAction, selectedWorkspace?.id],
  );

  const rightItems = useMemo(
    () =>
      toNavbarSectionItems(
        filterNavbarItems(NavbarActionGroups.right, actionCtx),
        actionCtx,
        handleExecuteAction,
      ),
    [actionCtx, handleExecuteAction],
  );

  const workspaceTitle = useMemo(() => {
    if (isOnProjectPage) {
      return organizationName ?? "Project";
    }
    if (isOnWorkspaceView) {
      return mobileWorkspaceTitle ?? undefined;
    }
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
      if (!hostId) {
        navigate({ to: "/" });
        return;
      }
      navigate({ to: "/hosts/$hostId/workspaces", params: { hostId } });
    } else {
      navigate({ to: "/" });
    }
  }, [navigate, hostId, isOnProjectPage, projectId, isOnWorkspaceView]);

  const handleOpenSettings = useCallback(() => {
    SettingsDialog.show({ sections: REMOTE_SETTINGS_SECTIONS });
  }, []);

  const handleOpenCommandBar = useCallback(() => {
    CommandBarDialog.show();
  }, []);

  return (
    <Navbar
      workspaceTitle={workspaceTitle}
      rightItems={isOnProjectPage ? rightItems : undefined}
      mobileMode={mobileMode}
      mobileUserSlot={mobileUserSlot}
      isOnProjectPage={isOnProjectPage}
      isOnProjectSubRoute={isOnProjectSubRoute}
      onNavigateBack={handleNavigateBack}
      mobileShowBack={mobileShowBack}
      onOpenSettings={handleOpenSettings}
      onOpenCommandBar={handleOpenCommandBar}
      onOpenDrawer={isOnProjectPage ? onOpenDrawer : undefined}
      mobileActiveTab={mobileActiveTab as MobileTabId}
      onMobileTabChange={(tab) => setMobileActiveTab(tab)}
      mobileTabs={remoteMobileTabs}
      showMobileTabs={isOnWorkspaceView}
    />
  );
}

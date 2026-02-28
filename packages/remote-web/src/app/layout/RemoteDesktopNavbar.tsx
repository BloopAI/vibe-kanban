import { useMemo, useCallback } from "react";
import { useLocation } from "@tanstack/react-router";
import { useWorkspaceContext } from "@/shared/hooks/useWorkspaceContext";
import { useActions } from "@/shared/hooks/useActions";
import { useSyncErrorContext } from "@/shared/hooks/useSyncErrorContext";
import { Navbar, type NavbarSectionItem } from "@vibe/ui/components/Navbar";
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
import { useActionVisibilityContext } from "@/shared/hooks/useActionVisibilityContext";
import { SettingsDialog } from "@/shared/dialogs/settings/SettingsDialog";
import { REMOTE_SETTINGS_SECTIONS } from "@remote/shared/constants/settings";

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

/**
 * Desktop-only navbar for remote workspace pages.
 *
 * This component is ONLY mounted on workspace detail routes (/workspaces/:id)
 * where all required providers (ActionsProvider, WorkspaceProvider, etc.) are available.
 *
 * Mobile navbar is handled separately by RemoteNavbarContainer.
 */
export function RemoteDesktopNavbar() {
  const { executeAction } = useActions();
  const { workspace: selectedWorkspace } = useWorkspaceContext();
  const syncErrorContext = useSyncErrorContext();
  const location = useLocation();

  const isOnProjectPage = location.pathname.startsWith("/projects/");

  const actionCtx = useActionVisibilityContext();

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

  const isMigratePage = actionCtx.layoutMode === "migrate";

  const leftItems = useMemo(
    () =>
      isMigratePage
        ? []
        : toNavbarSectionItems(
            filterNavbarItems(NavbarActionGroups.left, actionCtx),
            actionCtx,
            handleExecuteAction,
          ),
    [actionCtx, handleExecuteAction, isMigratePage],
  );

  const rightItems = useMemo(
    () =>
      isMigratePage
        ? []
        : toNavbarSectionItems(
            filterNavbarItems(NavbarActionGroups.right, actionCtx),
            actionCtx,
            handleExecuteAction,
          ),
    [actionCtx, handleExecuteAction, isMigratePage],
  );

  const handleOpenSettings = useCallback(() => {
    SettingsDialog.show({ sections: REMOTE_SETTINGS_SECTIONS });
  }, []);

  return (
    <Navbar
      workspaceTitle={selectedWorkspace?.branch}
      leftItems={leftItems}
      rightItems={rightItems}
      syncErrors={syncErrorContext?.errors}
      isOnProjectPage={isOnProjectPage}
      onOpenSettings={handleOpenSettings}
    />
  );
}

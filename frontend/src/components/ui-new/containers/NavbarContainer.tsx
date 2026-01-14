import { useMemo, useCallback } from 'react';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { useActions } from '@/contexts/ActionsContext';
import { Navbar } from '../views/Navbar';
import {
  NavbarActionGroups,
  NavbarDivider,
  type ActionDefinition,
  type NavbarItem,
  type ActionVisibilityContext,
} from '../actions';
import {
  useActionVisibilityContext,
  isActionVisible,
} from '../actions/useActionVisibility';

/**
 * Check if a NavbarItem is a divider
 */
function isDivider(item: NavbarItem): item is typeof NavbarDivider {
  return 'type' in item && item.type === 'divider';
}

/**
 * Filter navbar items by visibility, keeping dividers but removing them
 * if they would appear at the start, end, or consecutively.
 */
function filterNavbarItems(
  items: readonly NavbarItem[],
  ctx: ActionVisibilityContext
): NavbarItem[] {
  // Filter actions by visibility, keep dividers
  const filtered = items.filter((item) => {
    if (isDivider(item)) return true;
    return isActionVisible(item, ctx);
  });

  // Remove leading/trailing dividers and consecutive dividers
  const result: NavbarItem[] = [];
  for (const item of filtered) {
    if (isDivider(item)) {
      // Only add divider if we have items before it and last item wasn't a divider
      if (result.length > 0 && !isDivider(result[result.length - 1])) {
        result.push(item);
      }
    } else {
      result.push(item);
    }
  }

  // Remove trailing divider
  if (result.length > 0 && isDivider(result[result.length - 1])) {
    result.pop();
  }

  return result;
}

export function NavbarContainer() {
  const { executeAction } = useActions();
  const { workspace: selectedWorkspace, isCreateMode } = useWorkspaceContext();

  // Get action visibility context (includes all state for visibility/active/enabled)
  const actionCtx = useActionVisibilityContext();

  // Action handler - all actions go through the standard executeAction
  const handleExecuteAction = useCallback(
    (action: ActionDefinition) => {
      if (action.requiresTarget && selectedWorkspace?.id) {
        executeAction(action, selectedWorkspace.id);
      } else {
        executeAction(action);
      }
    },
    [executeAction, selectedWorkspace?.id]
  );

  // Filter visible actions for each section
  const leftItems = useMemo(
    () => filterNavbarItems(NavbarActionGroups.left, actionCtx),
    [actionCtx]
  );

  const rightItems = useMemo(
    () => filterNavbarItems(NavbarActionGroups.right, actionCtx),
    [actionCtx]
  );

  const navbarTitle = isCreateMode
    ? 'Create Workspace'
    : selectedWorkspace?.branch;

  return (
    <Navbar
      workspaceTitle={navbarTitle}
      leftItems={leftItems}
      rightItems={rightItems}
      actionContext={actionCtx}
      onExecuteAction={handleExecuteAction}
    />
  );
}

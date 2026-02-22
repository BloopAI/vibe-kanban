import { useMemo, useCallback } from 'react';
import { useLocation, useNavigate } from '@tanstack/react-router';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { useUserContext } from '@/contexts/remote/UserContext';
import { useActions } from '@/contexts/ActionsContext';
import { useUserOrganizations } from '@/hooks/useUserOrganizations';
import { useOrganizationStore } from '@/stores/useOrganizationStore';
import { Navbar } from '../views/Navbar';
import { RemoteIssueLink } from './RemoteIssueLink';
import { AppBarUserPopoverContainer } from './AppBarUserPopoverContainer';
import { CommandBarDialog } from '@/components/ui-new/dialogs/CommandBarDialog';
import { SettingsDialog } from '@/components/ui-new/dialogs/SettingsDialog';
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
import {
  toProject,
  toProjectIssue,
  toWorkspaces,
} from '@/lib/routes/navigation';

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

interface NavbarContainerProps {
  mobileMode: boolean;
}

export function NavbarContainer({ mobileMode }: NavbarContainerProps) {
  const navigate = useNavigate();
  const { executeAction } = useActions();
  const { workspace: selectedWorkspace, isCreateMode } = useWorkspaceContext();
  const { workspaces } = useUserContext();
  const location = useLocation();
  const isOnProjectPage = location.pathname.startsWith('/projects/');

  // Find remote workspace linked to current local workspace
  const linkedRemoteWorkspace = useMemo(() => {
    if (!selectedWorkspace?.id) return null;
    return (
      workspaces.find((w) => w.local_workspace_id === selectedWorkspace.id) ??
      null
    );
  }, [workspaces, selectedWorkspace?.id]);

  const { data: orgsData } = useUserOrganizations();
  const selectedOrgId = useOrganizationStore((s) => s.selectedOrgId);
  const orgName =
    orgsData?.organizations.find((o) => o.id === selectedOrgId)?.name ?? '';

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

  const isMigratePage = actionCtx.layoutMode === 'migrate';

  // Filter visible actions for each section (empty on migrate page)
  const leftItems = useMemo(
    () =>
      isMigratePage
        ? []
        : filterNavbarItems(NavbarActionGroups.left, actionCtx),
    [actionCtx, isMigratePage]
  );

  const rightItems = useMemo(
    () =>
      isMigratePage
        ? []
        : filterNavbarItems(NavbarActionGroups.right, actionCtx),
    [actionCtx, isMigratePage]
  );

  const navbarTitle = isCreateMode
    ? 'Create Workspace'
    : isMigratePage
      ? 'Migrate'
      : isOnProjectPage
        ? orgName
        : selectedWorkspace?.branch;

  const userPopoverSlot = mobileMode ? (
    <AppBarUserPopoverContainer
      organizations={orgsData?.organizations ?? []}
      selectedOrgId={selectedOrgId ?? ''}
      onOrgSelect={useOrganizationStore.getState().setSelectedOrgId}
      onCreateOrg={() => {}}
    />
  ) : undefined;

  const handleOpenCommandBar = useCallback(() => {
    CommandBarDialog.show();
  }, []);

  const handleOpenSettings = useCallback(() => {
    SettingsDialog.show();
  }, []);

  const handleNavigateBack = useCallback(() => {
    navigate(toWorkspaces());
  }, [navigate]);

  const handleNavigateToBoard = useCallback(() => {
    const projectId = linkedRemoteWorkspace?.project_id;
    if (!projectId) return;
    const issueId = linkedRemoteWorkspace?.issue_id;
    if (issueId) {
      navigate(toProjectIssue(projectId, issueId));
    } else {
      navigate(toProject(projectId));
    }
  }, [linkedRemoteWorkspace, navigate]);

  return (
    <Navbar
      workspaceTitle={navbarTitle}
      leftItems={leftItems}
      rightItems={rightItems}
      leftSlot={
        linkedRemoteWorkspace?.issue_id ? (
          <RemoteIssueLink
            projectId={linkedRemoteWorkspace.project_id}
            issueId={linkedRemoteWorkspace.issue_id}
          />
        ) : null
      }
      actionContext={actionCtx}
      onExecuteAction={handleExecuteAction}
      mobileMode={mobileMode}
      mobileUserSlot={userPopoverSlot}
      isOnProjectPage={isOnProjectPage}
      onOpenCommandBar={mobileMode ? handleOpenCommandBar : undefined}
      onOpenSettings={mobileMode ? handleOpenSettings : undefined}
      onNavigateToBoard={
        mobileMode && linkedRemoteWorkspace?.project_id
          ? handleNavigateToBoard
          : undefined
      }
      onNavigateBack={
        mobileMode && isOnProjectPage ? handleNavigateBack : undefined
      }
    />
  );
}

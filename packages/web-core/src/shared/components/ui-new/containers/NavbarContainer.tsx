import { useMemo, useCallback } from 'react';
import { useWorkspaceContext } from '@/shared/hooks/useWorkspaceContext';
import { useUserContext } from '@/shared/hooks/useUserContext';
import { useActions } from '@/shared/hooks/useActions';
import { useSyncErrorContext } from '@/shared/hooks/useSyncErrorContext';
import { useUserOrganizations } from '@/shared/hooks/useUserOrganizations';
import { useOrganizationStore } from '@/shared/stores/useOrganizationStore';
import {
  Navbar,
  type NavbarSectionItem,
  type NavbarBreadcrumbItem,
  type MobileTabId,
} from '@vibe/ui/components/Navbar';
import { useAllOrganizationProjects } from '@/shared/hooks/useAllOrganizationProjects';
import { useShape } from '@/shared/integrations/electric/hooks';
import { PROJECT_ISSUES_SHAPE } from 'shared/remote-types';
import { RemoteIssueLink } from './RemoteIssueLink';
import { AppBarUserPopoverContainer } from './AppBarUserPopoverContainer';
import { NavbarActionGroups } from '@/shared/actions';
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
} from '@/shared/types/actions';
import { useActionVisibilityContext } from '@/shared/hooks/useActionVisibilityContext';
import { useMobileActiveTab } from '@/shared/stores/useUiPreferencesStore';
import { CommandBarDialog } from '@/shared/dialogs/command-bar/CommandBarDialog';
import { SettingsDialog } from '@/shared/dialogs/settings/SettingsDialog';
import { getProjectDestination } from '@/shared/lib/routes/appNavigation';
import { useAppNavigation } from '@/shared/hooks/useAppNavigation';
import { useCurrentAppDestination } from '@/shared/hooks/useCurrentAppDestination';

/**
 * Check if a NavbarItem is a divider
 */
function isDivider(item: ActionNavbarItem): item is typeof NavbarDivider {
  return 'type' in item && item.type === 'divider';
}

/**
 * Filter navbar items by visibility, keeping dividers but removing them
 * if they would appear at the start, end, or consecutively.
 */
function filterNavbarItems(
  items: readonly ActionNavbarItem[],
  ctx: ActionVisibilityContext
): ActionNavbarItem[] {
  // Filter actions by visibility, keep dividers
  const filtered = items.filter((item) => {
    if (isDivider(item)) return true;
    if (!isActionVisible(item, ctx)) return false;
    return !isSpecialIcon(getActionIcon(item, ctx));
  });

  // Remove leading/trailing dividers and consecutive dividers
  const result: ActionNavbarItem[] = [];
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

function toNavbarSectionItems(
  items: readonly ActionNavbarItem[],
  ctx: ActionVisibilityContext,
  onExecuteAction: (action: ActionDefinition) => void
): NavbarSectionItem[] {
  return items.reduce<NavbarSectionItem[]>((result, item) => {
    if (isDivider(item)) {
      result.push({ type: 'divider' });
      return result;
    }

    const icon = getActionIcon(item, ctx);
    if (isSpecialIcon(icon)) {
      return result;
    }

    result.push({
      type: 'action',
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

export function NavbarContainer({
  mobileMode = false,
  onCreateOrg,
  onOrgSelect,
  onOpenDrawer,
}: {
  mobileMode?: boolean;
  onCreateOrg?: () => void;
  onOrgSelect?: (orgId: string) => void;
  onOpenDrawer?: () => void;
}) {
  const { executeAction } = useActions();
  const { workspace: selectedWorkspace, isCreateMode } = useWorkspaceContext();
  const { workspaces } = useUserContext();
  const syncErrorContext = useSyncErrorContext();
  const appNavigation = useAppNavigation();
  const destination = useCurrentAppDestination();
  const projectDestination = useMemo(
    () => getProjectDestination(destination),
    [destination]
  );
  const isOnProjectPage = projectDestination !== null;
  const projectId = projectDestination?.projectId ?? null;
  const isOnProjectSubRoute =
    projectDestination !== null && projectDestination.kind !== 'project';
  const [mobileActiveTab, setMobileActiveTab] = useMobileActiveTab();

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
        : toNavbarSectionItems(
            filterNavbarItems(NavbarActionGroups.left, actionCtx),
            actionCtx,
            handleExecuteAction
          ),
    [actionCtx, handleExecuteAction, isMigratePage]
  );

  const rightItems = useMemo(
    () =>
      isMigratePage
        ? []
        : toNavbarSectionItems(
            filterNavbarItems(NavbarActionGroups.right, actionCtx),
            actionCtx,
            handleExecuteAction
          ),
    [actionCtx, handleExecuteAction, isMigratePage]
  );

  const navbarTitle = isCreateMode
    ? 'Create Workspace'
    : isMigratePage
      ? 'Migrate'
      : isOnProjectPage
        ? orgName
        : selectedWorkspace?.branch;

  // Breadcrumbs: Project / Issue / Workspace (only on workspace pages with linked project)
  const linkedProjectId = linkedRemoteWorkspace?.project_id ?? null;
  const linkedIssueId = linkedRemoteWorkspace?.issue_id ?? null;
  const shouldResolveBreadcrumbData =
    !isOnProjectPage && !isCreateMode && !isMigratePage && !!linkedProjectId;
  const shouldResolveIssueBreadcrumb =
    shouldResolveBreadcrumbData && !!linkedIssueId;

  const { data: allProjects, isLoading: isProjectsLoading } =
    useAllOrganizationProjects({
      enabled: shouldResolveBreadcrumbData,
    });
  const { data: projectIssues, isLoading: isProjectIssuesLoading } = useShape(
    PROJECT_ISSUES_SHAPE,
    { project_id: linkedProjectId || '' },
    { enabled: shouldResolveIssueBreadcrumb }
  );
  const linkedProject = allProjects.find((p) => p.id === linkedProjectId);
  const isWaitingForProjectBreadcrumb =
    shouldResolveBreadcrumbData && !linkedProject && isProjectsLoading;
  const isWaitingForIssueBreadcrumb =
    shouldResolveIssueBreadcrumb && isProjectIssuesLoading;
  const isWaitingForBreadcrumbData =
    isWaitingForProjectBreadcrumb || isWaitingForIssueBreadcrumb;

  const breadcrumbs = useMemo((): NavbarBreadcrumbItem[] | undefined => {
    if (
      !shouldResolveBreadcrumbData ||
      !linkedProjectId ||
      isWaitingForBreadcrumbData
    ) {
      return undefined;
    }

    const project = linkedProject;
    if (!project) return undefined;

    const items: NavbarBreadcrumbItem[] = [
      {
        label: project.name,
        onClick: () => appNavigation.goToProject(linkedProjectId),
      },
    ];

    if (linkedIssueId) {
      const issue = projectIssues.find((i) => i.id === linkedIssueId);
      if (issue) {
        items.push({
          label: issue.simple_id,
          onClick: () =>
            appNavigation.goToProjectIssue(linkedProjectId, linkedIssueId),
        });
      }
    }

    const workspaceLabel =
      selectedWorkspace?.name || selectedWorkspace?.branch || '';
    if (workspaceLabel) {
      items.push({ label: workspaceLabel });
    }

    return items.length > 1 ? items : undefined;
  }, [
    shouldResolveBreadcrumbData,
    linkedProjectId,
    linkedIssueId,
    linkedProject,
    isWaitingForBreadcrumbData,
    projectIssues,
    selectedWorkspace?.name,
    selectedWorkspace?.branch,
    appNavigation,
  ]);

  // Mobile-specific callbacks
  const handleOpenCommandBar = useCallback(() => {
    CommandBarDialog.show();
  }, []);

  const handleOpenSettings = useCallback(() => {
    SettingsDialog.show();
  }, []);

  const handleNavigateBack = useCallback(() => {
    if (isOnProjectPage && projectId) {
      // On project sub-route: go back to project root (kanban board)
      appNavigation.goToProject(projectId);
    } else {
      // Non-project page: go to workspaces
      appNavigation.goToWorkspaces();
    }
  }, [isOnProjectPage, projectId, appNavigation]);

  const handleNavigateToBoard = useMemo(() => {
    if (!isOnProjectPage || !projectId) return null;
    return () => {
      appNavigation.goToProject(projectId);
    };
  }, [isOnProjectPage, projectId, appNavigation]);

  // Build user popover slot for mobile mode
  const userPopoverSlot = useMemo(() => {
    if (!mobileMode) return undefined;
    return (
      <AppBarUserPopoverContainer
        organizations={orgsData?.organizations ?? []}
        selectedOrgId={selectedOrgId ?? ''}
        onOrgSelect={onOrgSelect ?? (() => {})}
        onCreateOrg={onCreateOrg ?? (() => {})}
      />
    );
  }, [
    mobileMode,
    orgsData?.organizations,
    selectedOrgId,
    onCreateOrg,
    onOrgSelect,
  ]);
  return (
    <Navbar
      workspaceTitle={navbarTitle}
      breadcrumbs={breadcrumbs}
      leftItems={leftItems}
      rightItems={rightItems}
      syncErrors={syncErrorContext?.errors}
      mobileMode={mobileMode}
      mobileUserSlot={userPopoverSlot}
      isOnProjectPage={isOnProjectPage}
      isOnProjectSubRoute={isOnProjectSubRoute}
      onOpenCommandBar={handleOpenCommandBar}
      onOpenSettings={handleOpenSettings}
      onNavigateBack={handleNavigateBack}
      onNavigateToBoard={handleNavigateToBoard}
      onOpenDrawer={onOpenDrawer}
      mobileActiveTab={mobileActiveTab as MobileTabId}
      onMobileTabChange={(tab) => setMobileActiveTab(tab)}
      leftSlot={
        !breadcrumbs &&
        !isWaitingForBreadcrumbData &&
        linkedRemoteWorkspace?.issue_id ? (
          <RemoteIssueLink
            projectId={linkedRemoteWorkspace.project_id}
            issueId={linkedRemoteWorkspace.issue_id}
          />
        ) : null
      }
    />
  );
}

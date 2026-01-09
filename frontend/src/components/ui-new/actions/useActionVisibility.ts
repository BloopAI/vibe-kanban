import { useMemo } from 'react';
import { useLayoutStore } from '@/stores/useLayoutStore';
import { useDiffViewStore, useDiffViewMode } from '@/stores/useDiffViewStore';
import { useUiPreferencesStore } from '@/stores/useUiPreferencesStore';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { useUserSystem } from '@/components/ConfigProvider';
import { useDevServer } from '@/hooks/useDevServer';
import type { Workspace } from 'shared/types';
import type {
  ActionVisibilityContext,
  ActionDefinition,
  ActionIcon,
  DevServerState,
} from './index';
import { resolveLabel } from './index';
import type { CommandBarPage } from './pages';

/**
 * Hook that builds the visibility context from stores/context.
 * Used by both NavbarContainer and CommandBarDialog to evaluate
 * action visibility and state conditions.
 */
export function useActionVisibilityContext(): ActionVisibilityContext {
  const layout = useLayoutStore();
  const { workspace, workspaceId, isCreateMode, repos } = useWorkspaceContext();
  const diffPaths = useDiffViewStore((s) => s.diffPaths);
  const diffViewMode = useDiffViewMode();
  const expanded = useUiPreferencesStore((s) => s.expanded);
  const { config } = useUserSystem();
  const { isStarting, isStopping, runningDevServer } =
    useDevServer(workspaceId);

  return useMemo(() => {
    // Compute isAllDiffsExpanded
    const diffKeys = diffPaths.map((p) => `diff:${p}`);
    const isAllDiffsExpanded =
      diffKeys.length > 0 && diffKeys.every((k) => expanded[k] !== false);

    // Compute dev server state
    const devServerState: DevServerState = isStarting
      ? 'starting'
      : isStopping
        ? 'stopping'
        : runningDevServer
          ? 'running'
          : 'stopped';

    return {
      isChangesMode: layout.isChangesMode,
      isLogsMode: layout.isLogsMode,
      isPreviewMode: layout.isPreviewMode,
      isSidebarVisible: layout.isSidebarVisible,
      isMainPanelVisible: layout.isMainPanelVisible,
      isGitPanelVisible: layout.isGitPanelVisible,
      isCreateMode,
      hasWorkspace: !!workspace,
      workspaceArchived: workspace?.archived ?? false,
      hasDiffs: diffPaths.length > 0,
      diffViewMode,
      isAllDiffsExpanded,
      editorType: config?.editor?.editor_type ?? null,
      devServerState,
      runningDevServerId: runningDevServer?.id ?? null,
      hasGitRepos: repos.length > 0,
      hasMultipleRepos: repos.length > 1,
    };
  }, [
    layout.isChangesMode,
    layout.isLogsMode,
    layout.isPreviewMode,
    layout.isSidebarVisible,
    layout.isMainPanelVisible,
    layout.isGitPanelVisible,
    isCreateMode,
    workspace,
    repos,
    diffPaths,
    diffViewMode,
    expanded,
    config?.editor?.editor_type,
    isStarting,
    isStopping,
    runningDevServer,
  ]);
}

/**
 * Helper to check if an action is visible given the current context.
 * If the action has no isVisible condition, it's always visible.
 */
export function isActionVisible(
  action: ActionDefinition,
  ctx: ActionVisibilityContext
): boolean {
  return action.isVisible ? action.isVisible(ctx) : true;
}

/**
 * Helper to check if a page is visible given the current context.
 * If the page has no isVisible condition, it's always visible.
 */
export function isPageVisible(
  page: CommandBarPage,
  ctx: ActionVisibilityContext
): boolean {
  return page.isVisible ? page.isVisible(ctx) : true;
}

/**
 * Helper to check if an action is active given the current context.
 * If the action has no isActive callback, returns false.
 */
export function isActionActive(
  action: ActionDefinition,
  ctx: ActionVisibilityContext
): boolean {
  return action.isActive ? action.isActive(ctx) : false;
}

/**
 * Helper to check if an action is enabled given the current context.
 * If the action has no isEnabled callback, returns true (enabled by default).
 */
export function isActionEnabled(
  action: ActionDefinition,
  ctx: ActionVisibilityContext
): boolean {
  return action.isEnabled ? action.isEnabled(ctx) : true;
}

/**
 * Get the icon for an action, considering dynamic icon callbacks.
 * Falls back to the static icon property.
 */
export function getActionIcon(
  action: ActionDefinition,
  ctx: ActionVisibilityContext
): ActionIcon {
  return action.getIcon ? action.getIcon(ctx) : action.icon;
}

/**
 * Get the tooltip for an action, considering dynamic tooltip callbacks.
 * Falls back to the resolved label.
 */
export function getActionTooltip(
  action: ActionDefinition,
  ctx: ActionVisibilityContext
): string {
  return action.getTooltip ? action.getTooltip(ctx) : resolveLabel(action);
}

/**
 * Get the label for an action, considering dynamic label callbacks.
 * Falls back to the resolved static label.
 */
export function getActionLabel(
  action: ActionDefinition,
  ctx: ActionVisibilityContext,
  workspace?: Workspace
): string {
  return action.getLabel
    ? action.getLabel(ctx)
    : resolveLabel(action, workspace);
}

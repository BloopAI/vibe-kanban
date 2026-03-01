import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useLocation } from '@tanstack/react-router';
import type { IssuePriority } from 'shared/remote-types';
import { parseProjectSidebarRoute } from '@/shared/lib/routes/projectSidebarRoutes';
import type { ProjectIssueCreateOptions } from '@/shared/lib/routes/appNavigation';
import { useAppNavigation } from '@/shared/hooks/useAppNavigation';
import {
  buildKanbanCreateDefaultsKey,
  clearKanbanCreateDefaults,
  patchKanbanCreateDefaults,
  setKanbanCreateDefaults,
  useKanbanCreateDefaults,
} from '@/shared/stores/useKanbanCreateDefaultsStore';

function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

/**
 * Hook for project-kanban right sidebar navigation.
 * URL is the single source of truth for sidebar mode.
 *
 * URL patterns:
 * - View issue: /projects/:projectId/issues/:issueId
 * - View issue workspace: /projects/:projectId/issues/:issueId/workspaces/:workspaceId
 * - Create issue: /projects/:projectId/issues/new
 * - Create workspace (linked): /projects/:projectId/issues/:issueId/workspaces/create/:draftId
 * - Create workspace (standalone): /projects/:projectId/workspaces/create/:draftId
 * - No issue: /projects/:projectId
 */
export function useKanbanNavigation() {
  const location = useLocation();
  const appNavigation = useAppNavigation();

  const routeState = useMemo(
    () => parseProjectSidebarRoute(location.pathname),
    [location.pathname]
  );

  const projectId = routeState?.projectId ?? null;
  const hostId = routeState?.hostId ?? null;
  const issueId = useMemo(() => {
    if (!routeState) return null;
    if (routeState.type === 'issue') return routeState.issueId;
    if (routeState.type === 'issue-workspace') return routeState.issueId;
    if (routeState.type === 'workspace-create') return routeState.issueId;
    return null;
  }, [routeState]);

  const workspaceId =
    routeState?.type === 'issue-workspace' ? routeState.workspaceId : null;
  const rawDraftId =
    routeState?.type === 'workspace-create' ? routeState.draftId : null;
  const draftId = rawDraftId && isValidUuid(rawDraftId) ? rawDraftId : null;
  const hasInvalidWorkspaceCreateDraftId =
    routeState?.type === 'workspace-create' && rawDraftId !== null && !draftId;

  const isCreateMode = routeState?.type === 'issue-create';
  const isWorkspaceCreateMode =
    routeState?.type === 'workspace-create' && draftId !== null;
  const isPanelOpen = !!routeState && routeState.type !== 'closed';

  const createDefaultsKey = useMemo(() => {
    if (!projectId) return null;
    return buildKanbanCreateDefaultsKey(hostId, projectId);
  }, [hostId, projectId]);
  const createDefaults = useKanbanCreateDefaults(createDefaultsKey);

  const previousDefaultsKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const previousKey = previousDefaultsKeyRef.current;
    if (previousKey && previousKey !== createDefaultsKey) {
      clearKanbanCreateDefaults(previousKey);
    }
    previousDefaultsKeyRef.current = createDefaultsKey;
  }, [createDefaultsKey]);

  const createDefaultStatusId = createDefaults?.statusId ?? null;
  const createDefaultPriority =
    (createDefaults?.priority as IssuePriority | null | undefined) ?? null;
  const createDefaultAssigneeIds = createDefaults?.assigneeIds ?? null;
  const createDefaultParentIssueId = createDefaults?.parentIssueId ?? null;

  const openIssue = useCallback(
    (id: string) => {
      if (!projectId) return;
      if (isCreateMode && createDefaultsKey) {
        clearKanbanCreateDefaults(createDefaultsKey);
      }
      appNavigation.navigate(appNavigation.toProjectIssue(projectId, id));
    },
    [projectId, isCreateMode, createDefaultsKey, appNavigation]
  );

  const openIssueWorkspace = useCallback(
    (id: string, workspaceAttemptId: string) => {
      if (!projectId) return;
      appNavigation.navigate(
        appNavigation.toProjectIssueWorkspace(projectId, id, workspaceAttemptId)
      );
    },
    [projectId, appNavigation]
  );

  const openWorkspaceCreate = useCallback(
    (workspaceDraftId: string, options?: { issueId?: string | null }) => {
      if (!projectId) return;
      const targetIssueId = options?.issueId ?? issueId;
      if (targetIssueId) {
        appNavigation.navigate(
          appNavigation.toProjectIssueWorkspaceCreate(
            projectId,
            targetIssueId,
            workspaceDraftId
          )
        );
        return;
      }

      appNavigation.navigate(
        appNavigation.toProjectWorkspaceCreate(projectId, workspaceDraftId)
      );
    },
    [projectId, issueId, appNavigation]
  );

  const closePanel = useCallback(() => {
    if (!projectId) return;
    if (isCreateMode && createDefaultsKey) {
      clearKanbanCreateDefaults(createDefaultsKey);
    }
    appNavigation.navigate(appNavigation.toProject(projectId));
  }, [projectId, isCreateMode, createDefaultsKey, appNavigation]);

  const startCreate = useCallback(
    (options?: ProjectIssueCreateOptions) => {
      if (!projectId || !createDefaultsKey) return;

      setKanbanCreateDefaults(createDefaultsKey, {
        statusId: options?.statusId,
        priority: options?.priority,
        assigneeIds: options?.assigneeIds,
        parentIssueId: options?.parentIssueId,
      });
      appNavigation.navigate(appNavigation.toProjectIssueCreate(projectId));
    },
    [projectId, createDefaultsKey, appNavigation]
  );

  const updateCreateDefaults = useCallback(
    (options: {
      statusId?: string;
      priority?: IssuePriority | null;
      assigneeIds?: string[];
      parentIssueId?: string;
    }) => {
      if (!projectId || !isCreateMode || !createDefaultsKey) return;

      const patch: Partial<ProjectIssueCreateOptions> = {};
      if (options.statusId !== undefined) {
        patch.statusId = options.statusId;
      }
      if (options.priority !== undefined) {
        patch.priority = options.priority ?? undefined;
      }
      if (options.assigneeIds !== undefined) {
        patch.assigneeIds = options.assigneeIds;
      }
      if (options.parentIssueId !== undefined) {
        patch.parentIssueId = options.parentIssueId;
      }
      if (Object.keys(patch).length === 0) {
        return;
      }

      patchKanbanCreateDefaults(createDefaultsKey, patch);
    },
    [projectId, isCreateMode, createDefaultsKey]
  );

  const resetCreateDefaults = useCallback(() => {
    if (!createDefaultsKey) return;
    clearKanbanCreateDefaults(createDefaultsKey);
  }, [createDefaultsKey]);

  const resolvedHostId = hostId;

  return {
    hostId: resolvedHostId,
    projectId,
    issueId,
    workspaceId,
    draftId,
    sidebarMode: routeState?.type ?? null,
    isCreateMode,
    isWorkspaceCreateMode,
    hasInvalidWorkspaceCreateDraftId,
    isPanelOpen,
    createDefaultStatusId,
    createDefaultPriority,
    createDefaultAssigneeIds,
    createDefaultParentIssueId,
    openIssue,
    openIssueWorkspace,
    openWorkspaceCreate,
    closePanel,
    startCreate,
    updateCreateDefaults,
    resetCreateDefaults,
  };
}

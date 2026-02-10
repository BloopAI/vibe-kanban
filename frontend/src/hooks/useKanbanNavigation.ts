import { useCallback, useMemo } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import type { IssuePriority } from 'shared/remote-types';
import {
  buildIssueCreatePath,
  buildIssuePath,
  buildIssueWorkspacePath,
  buildProjectRootPath,
  buildWorkspaceCreatePath,
  parseProjectSidebarRoute,
} from '@/lib/routes/projectSidebarRoutes';

/**
 * Hook for project-kanban right sidebar navigation.
 * URL is the single source of truth for sidebar mode.
 *
 * URL patterns:
 * - View issue: /projects/:projectId/issues/:issueId
 * - View issue workspace: /projects/:projectId/issues/:issueId/workspaces/:workspaceId
 * - Create issue: /projects/:projectId/issues/new?statusId=xxx&priority=high
 * - Create workspace (linked): /projects/:projectId/issues/:issueId/workspaces/create/:draftId
 * - Create workspace (standalone): /projects/:projectId/workspaces/create/:draftId
 * - No issue: /projects/:projectId
 */
export function useKanbanNavigation() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const routeState = useMemo(
    () => parseProjectSidebarRoute(location.pathname),
    [location.pathname]
  );

  const projectId = routeState?.projectId ?? null;

  const issueId = useMemo(() => {
    if (!routeState) return null;
    if (routeState.type === 'issue') return routeState.issueId;
    if (routeState.type === 'issue-workspace') return routeState.issueId;
    if (routeState.type === 'workspace-create') return routeState.issueId;
    return null;
  }, [routeState]);

  const workspaceId =
    routeState?.type === 'issue-workspace' ? routeState.workspaceId : null;
  const draftId =
    routeState?.type === 'workspace-create' ? routeState.draftId : null;

  const isLegacyCreateMode =
    routeState?.type === 'closed' && searchParams.get('mode') === 'create';
  const isCreateMode = routeState?.type === 'issue-create' || isLegacyCreateMode;
  const isWorkspaceCreateMode = routeState?.type === 'workspace-create';
  const isPanelOpen =
    !!routeState && (routeState.type !== 'closed' || isLegacyCreateMode);

  const createDefaultStatusId = searchParams.get('statusId');
  const createDefaultPriority = searchParams.get(
    'priority'
  ) as IssuePriority | null;
  const createDefaultAssigneeIds =
    searchParams.get('assignees')?.split(',').filter(Boolean) ?? null;
  const createDefaultParentIssueId = searchParams.get('parentIssueId');

  const openIssue = useCallback(
    (id: string) => {
      if (!projectId) return;
      navigate(buildIssuePath(projectId, id));
    },
    [navigate, projectId]
  );

  const openIssueWorkspace = useCallback(
    (id: string, workspaceAttemptId: string) => {
      if (!projectId) return;
      navigate(buildIssueWorkspacePath(projectId, id, workspaceAttemptId));
    },
    [navigate, projectId]
  );

  const openWorkspaceCreate = useCallback(
    (workspaceDraftId: string, options?: { issueId?: string | null }) => {
      if (!projectId) return;
      const targetIssueId = options?.issueId ?? issueId;
      navigate(buildWorkspaceCreatePath(projectId, workspaceDraftId, targetIssueId));
    },
    [navigate, projectId, issueId]
  );

  const closePanel = useCallback(() => {
    if (!projectId) return;
    navigate(buildProjectRootPath(projectId));
  }, [navigate, projectId]);

  const closeWorkspace = useCallback(() => {
    if (!projectId) return;
    if (issueId) {
      navigate(buildIssuePath(projectId, issueId));
      return;
    }
    navigate(buildProjectRootPath(projectId));
  }, [navigate, projectId, issueId]);

  const closeWorkspaceCreate = useCallback(() => {
    if (!projectId) return;
    if (routeState?.type === 'workspace-create' && routeState.issueId) {
      navigate(buildIssuePath(projectId, routeState.issueId));
      return;
    }
    navigate(buildProjectRootPath(projectId));
  }, [navigate, projectId, routeState]);

  const startCreate = useCallback(
    (options?: {
      statusId?: string;
      priority?: IssuePriority;
      assigneeIds?: string[];
      parentIssueId?: string;
    }) => {
      if (!projectId) return;
      navigate(buildIssueCreatePath(projectId, options));
    },
    [navigate, projectId]
  );

  const updateCreateDefaults = useCallback(
    (options: {
      statusId?: string;
      priority?: IssuePriority | null;
      assigneeIds?: string[];
    }) => {
      if (!projectId || !isCreateMode) return;

      const params = new URLSearchParams(searchParams);
      params.delete('mode');
      params.delete('orgId');
      if (options.statusId !== undefined) {
        params.set('statusId', options.statusId);
      }
      if (options.priority !== undefined) {
        if (options.priority === null) {
          params.delete('priority');
        } else {
          params.set('priority', options.priority);
        }
      }
      if (options.assigneeIds !== undefined) {
        params.set('assignees', options.assigneeIds.join(','));
      }

      const path = buildIssueCreatePath(projectId);
      const query = params.toString();
      navigate(query ? `${path}?${query}` : path, { replace: true });
    },
    [navigate, projectId, isCreateMode, searchParams]
  );

  return {
    projectId,
    issueId,
    workspaceId,
    draftId,
    sidebarMode: routeState?.type ?? null,
    isCreateMode,
    isWorkspaceCreateMode,
    isPanelOpen,
    createDefaultStatusId,
    createDefaultPriority,
    createDefaultAssigneeIds,
    createDefaultParentIssueId,
    openIssue,
    openIssueWorkspace,
    openWorkspaceCreate,
    closePanel,
    closeWorkspace,
    closeWorkspaceCreate,
    startCreate,
    updateCreateDefaults,
  };
}

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
  const rawDraftId =
    routeState?.type === 'workspace-create' ? routeState.draftId : null;
  const draftId = rawDraftId && isValidUuid(rawDraftId) ? rawDraftId : null;
  const hasInvalidWorkspaceCreateDraftId =
    routeState?.type === 'workspace-create' && rawDraftId !== null && !draftId;

  const isCreateMode = routeState?.type === 'issue-create';
  const isWorkspaceCreateMode =
    routeState?.type === 'workspace-create' && draftId !== null;
  const isPanelOpen = !!routeState && routeState.type !== 'closed';

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
      navigate(
        buildWorkspaceCreatePath(projectId, workspaceDraftId, targetIssueId)
      );
    },
    [navigate, projectId, issueId]
  );

  const closePanel = useCallback(() => {
    if (!projectId) return;
    navigate(buildProjectRootPath(projectId));
  }, [navigate, projectId]);

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
  };
}

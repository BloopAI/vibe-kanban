import { useCallback } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { IssuePriority } from 'shared/remote-types';

/**
 * Hook for kanban issue navigation.
 * URL is the single source of truth for which issue is open.
 *
 * URL patterns:
 * - View issue: /projects/:projectId/issues/:issueId
 * - Create issue: /projects/:projectId?mode=create&statusId=xxx&priority=high
 * - No issue: /projects/:projectId
 */
export function useKanbanNavigation() {
  const navigate = useNavigate();
  const { projectId, issueId } = useParams<{
    projectId: string;
    issueId?: string;
  }>();
  const [searchParams] = useSearchParams();

  // Derive create mode state from URL
  const isCreateMode = searchParams.get('mode') === 'create';
  const createDefaultStatusId = searchParams.get('statusId');
  const createDefaultPriority = searchParams.get(
    'priority'
  ) as IssuePriority | null;
  const createDefaultAssigneeIds =
    searchParams.get('assignees')?.split(',').filter(Boolean) ?? null;
  const createDefaultParentIssueId = searchParams.get('parentIssueId');

  // Panel is visible if viewing an issue or creating one
  const isPanelOpen = !!issueId || isCreateMode;

  // Navigate to view an issue
  const openIssue = useCallback(
    (id: string) => {
      if (projectId) {
        navigate(`/projects/${projectId}/issues/${id}`);
      }
    },
    [navigate, projectId]
  );

  // Navigate to close the panel
  const closePanel = useCallback(() => {
    if (projectId) {
      navigate(`/projects/${projectId}`);
    }
  }, [navigate, projectId]);

  // Navigate to create mode with optional defaults
  const startCreate = useCallback(
    (options?: {
      statusId?: string;
      priority?: IssuePriority;
      assigneeIds?: string[];
      parentIssueId?: string;
    }) => {
      if (!projectId) return;

      const params = new URLSearchParams({ mode: 'create' });
      if (options?.statusId) params.set('statusId', options.statusId);
      if (options?.priority) params.set('priority', options.priority);
      if (options?.assigneeIds?.length) {
        params.set('assignees', options.assigneeIds.join(','));
      }
      if (options?.parentIssueId)
        params.set('parentIssueId', options.parentIssueId);
      navigate(`/projects/${projectId}?${params.toString()}`);
    },
    [navigate, projectId]
  );

  // Update create defaults (for command bar selections during create)
  const updateCreateDefaults = useCallback(
    (options: {
      statusId?: string;
      priority?: IssuePriority | null;
      assigneeIds?: string[];
    }) => {
      if (!projectId || !isCreateMode) return;

      const params = new URLSearchParams(searchParams);
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
      navigate(`/projects/${projectId}?${params.toString()}`, {
        replace: true,
      });
    },
    [navigate, projectId, isCreateMode, searchParams]
  );

  return {
    // URL state
    projectId: projectId ?? null,
    issueId: issueId ?? null,
    isCreateMode,
    isPanelOpen,

    // Create mode defaults from URL
    createDefaultStatusId,
    createDefaultPriority,
    createDefaultAssigneeIds,
    createDefaultParentIssueId,

    // Navigation actions
    openIssue,
    closePanel,
    startCreate,
    updateCreateDefaults,
  };
}

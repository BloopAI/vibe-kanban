import { useCallback, useMemo } from 'react';
import { useLocation } from '@tanstack/react-router';
import { useAppNavigation } from '@/shared/hooks/useAppNavigation';
import { useProjectContext } from '@/shared/hooks/useProjectContext';
import type { CreateModeInitialState } from '@/shared/types/createMode';
import { persistWorkspaceCreateDraft } from '@/shared/lib/workspaceCreateState';
import { resolveKanbanRouteState } from '@/shared/lib/routes/appNavigation';

export function useProjectWorkspaceCreateDraft() {
  const { projectId } = useProjectContext();
  const location = useLocation();
  const appNavigation = useAppNavigation();
  const destination = useMemo(
    () => appNavigation.resolveFromPath(location.pathname),
    [appNavigation, location.pathname]
  );
  const routeState = useMemo(
    () => resolveKanbanRouteState(destination),
    [destination]
  );

  const openWorkspaceCreateFromState = useCallback(
    async (
      initialState: CreateModeInitialState,
      options?: { issueId?: string | null }
    ): Promise<string | null> => {
      if (!projectId) return null;

      const draftId = await persistWorkspaceCreateDraft(
        initialState,
        crypto.randomUUID()
      );
      if (!draftId) {
        return null;
      }

      const issueId =
        options?.issueId ??
        initialState.linkedIssue?.issueId ??
        routeState.issueId ??
        null;
      if (issueId) {
        appNavigation.goToProjectIssueWorkspaceCreate(
          projectId,
          issueId,
          draftId
        );
      } else {
        appNavigation.goToProjectWorkspaceCreate(projectId, draftId);
      }

      return draftId;
    },
    [projectId, appNavigation, routeState.issueId]
  );

  return {
    openWorkspaceCreateFromState,
  };
}

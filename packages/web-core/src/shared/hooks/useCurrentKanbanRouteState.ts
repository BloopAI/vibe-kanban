import { useMemo } from 'react';
import { useCurrentAppDestination } from '@/shared/hooks/useCurrentAppDestination';
import {
  resolveKanbanRouteState,
  type KanbanRouteState,
} from '@/shared/lib/routes/appNavigation';
import {
  buildKanbanIssueComposerKey,
  useKanbanIssueComposer,
} from '@/shared/stores/useKanbanIssueComposerStore';

export function useCurrentKanbanRouteState(): KanbanRouteState {
  const destination = useCurrentAppDestination();
  const routeState = useMemo(
    () => resolveKanbanRouteState(destination),
    [destination]
  );
  const issueComposerKey = useMemo(() => {
    if (!routeState.projectId) {
      return null;
    }

    return buildKanbanIssueComposerKey(routeState.hostId, routeState.projectId);
  }, [routeState.hostId, routeState.projectId]);
  const issueComposer = useKanbanIssueComposer(issueComposerKey);
  const isCreateMode = issueComposer !== null;

  return useMemo(
    () => ({
      ...routeState,
      isCreateMode,
      isPanelOpen: routeState.isPanelOpen || isCreateMode,
    }),
    [routeState, isCreateMode]
  );
}

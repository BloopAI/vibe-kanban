import { useMemo } from 'react';
import { useCurrentAppDestination } from '@/shared/hooks/useCurrentAppDestination';
import {
  resolveKanbanRouteState,
  type KanbanRouteState,
} from '@/shared/lib/routes/appNavigation';

export function useCurrentKanbanRouteState(): KanbanRouteState {
  const destination = useCurrentAppDestination();

  return useMemo(() => resolveKanbanRouteState(destination), [destination]);
}

import { useCallback, useMemo } from 'react';
import { useJsonPatchWsStream } from './useJsonPatchWsStream';
import type { ProjectGroup } from 'shared/types';

type ProjectGroupsState = {
  groups: Record<string, ProjectGroup>;
};

export interface UseProjectGroupsResult {
  groups: ProjectGroup[];
  groupsById: Record<string, ProjectGroup>;
  isLoading: boolean;
  isConnected: boolean;
  error: Error | null;
}

export function useProjectGroups(): UseProjectGroupsResult {
  const endpoint = '/api/project-groups/stream/ws';

  const initialData = useCallback(
    (): ProjectGroupsState => ({ groups: {} }),
    []
  );

  const { data, isConnected, isInitialized, error } =
    useJsonPatchWsStream<ProjectGroupsState>(endpoint, true, initialData);

  const groupsById = useMemo(() => data?.groups ?? {}, [data]);

  const groups = useMemo(() => {
    return Object.values(groupsById).sort((a, b) => a.position - b.position);
  }, [groupsById]);

  const errorObj = useMemo(() => (error ? new Error(error) : null), [error]);

  return {
    groups: groups ?? [],
    groupsById,
    isLoading: !isInitialized && !error,
    isConnected,
    error: errorObj,
  };
}

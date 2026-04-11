import { useCallback, useMemo } from 'react';
import type { Diff, PatchType } from 'shared/types';
import { useJsonPatchWsStream } from '@/shared/hooks/useJsonPatchWsStream';
import { useHostId } from '@/shared/providers/HostIdProvider';

interface RepoDiffEntries {
  [filePath: string]: PatchType;
}

interface DiffEntries {
  [repoName: string]: RepoDiffEntries;
}

type DiffStreamEvent = {
  entries: DiffEntries;
};

export interface UseDiffStreamOptions {
  statsOnly?: boolean;
}

interface UseDiffStreamResult {
  diffs: Diff[];
  error: string | null;
  isInitialized: boolean;
}

export const useDiffStream = (
  workspaceId: string | null,
  enabled: boolean,
  options?: UseDiffStreamOptions
): UseDiffStreamResult => {
  const hostId = useHostId();
  const endpoint = (() => {
    if (!workspaceId) return undefined;
    const apiBasePath = hostId ? `/api/host/${hostId}` : '/api';
    const query = `${apiBasePath}/workspaces/${workspaceId}/git/diff/ws`;
    if (typeof options?.statsOnly === 'boolean') {
      const params = new URLSearchParams();
      params.set('stats_only', String(options.statsOnly));
      return `${query}?${params.toString()}`;
    } else {
      return query;
    }
  })();

  const initialData = useCallback(
    (): DiffStreamEvent => ({
      entries: {},
    }),
    []
  );

  const { data, error, isInitialized } = useJsonPatchWsStream<DiffStreamEvent>(
    endpoint,
    enabled && !!workspaceId,
    initialData
    // No need for injectInitialEntry or deduplicatePatches for diffs
  );

  const diffs = useMemo(() => {
    return Object.values(data?.entries ?? {})
      .flatMap((repoEntries) => Object.values(repoEntries ?? {}))
      .filter(
        (entry): entry is Extract<PatchType, { type: 'DIFF' }> =>
          entry?.type === 'DIFF'
      )
      .map((entry) => entry.content);
  }, [data?.entries]);

  return { diffs, error, isInitialized };
};

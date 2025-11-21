import { useCallback, useMemo } from 'react';
import { useJsonPatchWsStream } from './useJsonPatchWsStream';
import type { Scratch, UpdateScratch } from 'shared/types';

type ScratchState = {
  scratch: Record<string, Scratch>;
};

export interface UseScratchResult {
  scratch: Scratch[];
  scratchById: Record<string, Scratch>;
  isLoading: boolean;
  isConnected: boolean;
  error: string | null;
  updateScratch: (id: string, update: UpdateScratch) => Promise<void>;
}

/**
 * Stream all scratch items via WebSocket (JSON Patch) and expose as array + map.
 * Server sends initial snapshot: replace /scratch with an object keyed by id.
 * Live updates arrive at /scratch/<id> via add/replace/remove operations.
 */
export const useScratch = (): UseScratchResult => {
  const endpoint = `/api/scratch/stream/ws`;

  const initialData = useCallback((): ScratchState => ({ scratch: {} }), []);

  const { data, isConnected, error } = useJsonPatchWsStream<ScratchState>(
    endpoint,
    true,
    initialData
  );

  const scratchById = useMemo(() => data?.scratch ?? {}, [data?.scratch]);

  const scratch = useMemo(
    () =>
      Object.values(scratchById).sort(
        (a, b) =>
          new Date(a.created_at as string).getTime() -
          new Date(b.created_at as string).getTime()
      ),
    [scratchById]
  );

  const updateScratch = useCallback(
    async (id: string, update: UpdateScratch) => {
      const response = await fetch(`/api/scratch/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(update),
      });

      if (!response.ok) {
        throw new Error(`Save failed: ${response.statusText}`);
      }
    },
    []
  );

  const isLoading = !data && !error;

  return {
    scratch,
    scratchById,
    isLoading,
    isConnected,
    error,
    updateScratch,
  };
};

import { useCallback, useMemo } from 'react';
import { useJsonPatchWsStream } from './useJsonPatchWsStream';
import type { Scratch, UpdateScratch } from 'shared/types';

type ScratchState = {
  scratch: Record<string, Scratch>;
};

export interface UseScratchResult {
  scratch: Scratch | null;
  isLoading: boolean;
  isConnected: boolean;
  error: string | null;
  updateScratch: (update: UpdateScratch) => Promise<void>;
}

/**
 * Stream a single scratch item via WebSocket (JSON Patch).
 * Server sends initial snapshot at /scratch with single entry, then live updates at /scratch/{id}.
 */
export const useScratch = (id: string): UseScratchResult => {
  const endpoint = `/api/scratch/${id}/stream/ws`;

  const initialData = useCallback((): ScratchState => ({ scratch: {} }), []);

  const { data, isConnected, error } = useJsonPatchWsStream<ScratchState>(
    endpoint,
    true,
    initialData
  );

  const scratchById = useMemo(() => data?.scratch ?? {}, [data?.scratch]);

  const scratch = useMemo(
    () => (id ? (scratchById[id] ?? null) : null),
    [scratchById, id]
  );

  const updateScratch = useCallback(
    async (update: UpdateScratch) => {
      const response = await fetch(`/api/scratch/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(update),
      });

      if (!response.ok) {
        throw new Error(`Save failed: ${response.statusText}`);
      }
    },
    [id]
  );

  const isLoading = !data && !error;

  return {
    scratch,
    isLoading,
    isConnected,
    error,
    updateScratch,
  };
};

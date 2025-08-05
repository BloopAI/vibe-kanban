import { useCallback } from 'react';
import type { ProcessStartPayload } from '@/types/logs';
import type { Operation } from 'rfc6902';
import { useJsonPatchStream } from './useJsonPatchStream';

interface ProcessConversationData {
  entries: any[]; // Mixed types: NormalizedEntry | ProcessStartPayload | PatchType
  session_id: string | null;
  executor_type: string;
  prompt: string | null;
  summary: string | null;
}

interface UseProcessConversationResult {
  entries: any[]; // Mixed types like the original
  isConnected: boolean;
  error: string | null;
}

export const useProcessConversation = (
  processId: string,
  enabled: boolean
): UseProcessConversationResult => {
  const endpoint = processId ? `/api/execution-processes/${processId}/normalized-logs` : undefined;

  const initialData = useCallback((): ProcessConversationData => ({
    entries: [],
    session_id: null,
    executor_type: '',
    prompt: null,
    summary: null,
  }), []);

  const injectInitialEntry = useCallback((data: ProcessConversationData) => {
    if (processId) {
      // Inject process start marker as the first entry
      const processStartPayload: ProcessStartPayload = {
        processId: processId,
        runReason: 'Manual', // Default value since we don't have process details here
        startedAt: new Date().toISOString(),
        status: 'running',
      };

      const processStartEntry = {
        type: 'PROCESS_START' as const,
        content: processStartPayload,
      };

      data.entries.push(processStartEntry);
    }
  }, [processId]);

  const deduplicatePatches = useCallback((patches: Operation[]) => {
    const processedEntries = new Set<number>();
    
    return patches.filter((patch: any) => {
      // Extract entry index from path like "/entries/123"
      const match = patch.path?.match(/^\/entries\/(\d+)$/);
      if (match && patch.op === 'add') {
        const entryIndex = parseInt(match[1], 10);
        if (processedEntries.has(entryIndex)) {
          return false; // Already processed
        }
        processedEntries.add(entryIndex);
      }
      // Always allow replace operations and non-entry patches
      return true;
    });
  }, []);

  const { data, isConnected, error } = useJsonPatchStream(
    endpoint,
    enabled && !!processId,
    initialData,
    {
      injectInitialEntry,
      deduplicatePatches,
    }
  );

  const entries = data?.entries || [];

  return { entries, isConnected, error };
};

import { useCallback, useMemo } from 'react';
import type { NormalizedConversation, NormalizedEntry, ExecutionProcessSummary } from 'shared/types';
import { useEventSourceManager } from './useEventSourceManager';

interface UseProcessConversationResult {
  entries: NormalizedEntry[];
  isConnected: boolean;
  error: string | null;
}

export const useProcessConversation = (
  processId: string,
  enabled: boolean
): UseProcessConversationResult => {
  const getEndpoint = useCallback((process: ExecutionProcessSummary) => 
    `/api/execution-processes/${process.id}/normalized-logs`, []);

  const initialData = useMemo(() => ({
    entries: [],
    session_id: null,
    executor_type: '',
    prompt: null,
    summary: null,
  } as NormalizedConversation), []);

  const { processData, isConnected, error } = useEventSourceManager({
    processes: processId ? [{ id: processId } as ExecutionProcessSummary] : [],
    enabled,
    getEndpoint,
    initialData,
  });

  const entries = processData[processId]?.entries || [];

  return { entries, isConnected, error };
};

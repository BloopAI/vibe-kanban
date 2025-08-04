import { useMemo, useCallback } from 'react';
import type { ExecutionProcessSummary, NormalizedEntry, PatchType } from 'shared/types';
import type { UnifiedLogEntry } from '@/types/logs';
import { useEventSourceManager } from './useEventSourceManager';

interface UseProcessesLogsResult {
  entries: UnifiedLogEntry[];
  isConnected: boolean;
  error: string | null;
}

const MAX_ENTRIES = 5000;

export const useProcessesLogs = (
  processes: ExecutionProcessSummary[],
  enabled: boolean
): UseProcessesLogsResult => {
  const getEndpoint = useCallback((process: ExecutionProcessSummary) => {
    // Coding agents use normalized logs endpoint, scripts use raw logs endpoint
    // Both endpoints now return PatchType objects via JSON patches
    const isCodingAgent = process.run_reason === 'codingagent';
    return isCodingAgent 
      ? `/api/execution-processes/${process.id}/normalized-logs`
      : `/api/execution-processes/${process.id}/raw-logs`;
  }, []);

  const initialData = useMemo(() => ({ entries: [] }), []);

  const { processData, isConnected, error } = useEventSourceManager({
    processes,
    enabled,
    getEndpoint,
    initialData,
  });

  const entries = useMemo(() => {
    const allEntries: UnifiedLogEntry[] = [];
    
    Object.entries(processData).forEach(([processId, data]) => {
      const process = processes.find(p => p.id === processId);
      if (!process || !data?.entries) return;
      
      data.entries.forEach((patchEntry: PatchType, index: number) => {
        // All entries are PatchType objects with type and content
        let channel: UnifiedLogEntry['channel'];
        let payload: string | NormalizedEntry;

        switch (patchEntry.type) {
          case 'STDOUT':
            channel = 'stdout';
            payload = patchEntry.content;
            break;
          case 'STDERR':
            channel = 'stderr';
            payload = patchEntry.content;
            break;
          case 'NORMALIZED_ENTRY':
            channel = 'normalized';
            payload = patchEntry.content;
            break;
          default:
            // Skip unknown patch types
            return;
        }

        allEntries.push({
          id: `${processId}-${index}`,
          ts: Date.now() - (data.entries.length - index), // Simple ordering
          processId,
          processName: process.run_reason,
          channel,
          payload,
        });
      });
    });

    // Sort by timestamp and limit entries
    return allEntries
      .sort((a, b) => a.ts - b.ts)
      .slice(-MAX_ENTRIES);
  }, [processData, processes]);

  return { entries, isConnected, error };
};

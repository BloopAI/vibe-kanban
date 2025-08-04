import { useMemo, useCallback } from 'react';
import type { ExecutionProcessSummary, NormalizedEntry } from 'shared/types';
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
    // Coding agents use normalized logs, scripts use raw logs
    const isScript = process.run_reason === 'setupscript' || process.run_reason === 'cleanupscript';
    return isScript 
      ? `/api/execution-processes/${process.id}/raw-logs`
      : `/api/execution-processes/${process.id}/normalized-logs`;
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

      const isScript = process.run_reason === 'setupscript' || process.run_reason === 'cleanupscript';
      
      data.entries.forEach((entry: any, index: number) => {
        if (isScript) {
          // Raw logs: entry is a string
          allEntries.push({
            id: `${processId}-${index}`,
            ts: Date.now() - (data.entries.length - index), // Approximate ordering
            processId,
            processName: process.run_reason,
            channel: 'raw',
            payload: entry,
          });
        } else {
          // Normalized logs: entry is NormalizedEntry
          const normalizedEntry = entry as NormalizedEntry;
          allEntries.push({
            id: `${processId}-${index}`,
            ts: normalizedEntry.timestamp ? new Date(normalizedEntry.timestamp).getTime() : Date.now(),
            processId,
            processName: process.run_reason,
            channel: 'normalized',
            payload: normalizedEntry,
          });
        }
      });
    });

    // Sort by timestamp and limit entries
    return allEntries
      .sort((a, b) => a.ts - b.ts)
      .slice(-MAX_ENTRIES);
  }, [processData, processes]);

  return { entries, isConnected, error };
};

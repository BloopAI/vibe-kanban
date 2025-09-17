import { useMemo, useCallback } from 'react';
import type {
  ExecutionProcess,
  NormalizedEntry,
  PatchType,
} from 'shared/types';
import type { UnifiedLogEntry, ProcessStartPayload } from '@/types/logs';
import { useEventSourceManager } from './useEventSourceManager';

interface UseProcessesLogsResult {
  entries: UnifiedLogEntry[];
  isConnected: boolean;
  error: string | null;
}

const MAX_ENTRIES = 5000;

export const useProcessesLogs = (
  processes: ExecutionProcess[],
  enabled: boolean
): UseProcessesLogsResult => {
  const getEndpoint = useCallback((process: ExecutionProcess) => {
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
    let entryCounter = 0;

    // Iterate through processes in order, adding process marker followed by logs
    processes.forEach((process) => {
      const data = processData[process.id];
      if (!data?.entries) return;

      // Add process start marker first
      const processStartPayload: ProcessStartPayload = {
        processId: process.id,
        runReason: process.run_reason,
        startedAt: process.started_at,
        status: process.status,
        action: process.executor_action,
      };

      allEntries.push({
        id: `${process.id}-start`,
        ts: entryCounter++,
        processId: process.id,
        processName: process.run_reason,
        channel: 'process_start',
        payload: processStartPayload,
      });

      // Then add all logs for this process (skip the injected PROCESS_START entry)
      data.entries.forEach(
        (
          patchEntry:
            | PatchType
            | { type: 'PROCESS_START'; content: ProcessStartPayload },
          index: number
        ) => {
          // Skip the injected PROCESS_START entry since we handle it above
          if (patchEntry.type === 'PROCESS_START') return;

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
            id: `${process.id}-${index}`,
            ts: entryCounter++,
            processId: process.id,
            processName: process.run_reason,
            channel,
            payload,
          });
        }
      );
    });

    // Limit entries (no sorting needed since we build in order)
    return allEntries.slice(-MAX_ENTRIES);
  }, [processData, processes]);

  return { entries, isConnected, error };
};

import { useEffect, useState, useRef } from 'react';
import type { PatchType } from 'shared/types';

type LogEntry = Extract<PatchType, { type: 'STDOUT' } | { type: 'STDERR' }>;

interface UseLogStreamResult {
  logs: LogEntry[];
  error: string | null;
}

// Simple in-memory cache for logs
const logCache = new Map<string, LogEntry[]>();
const MAX_CACHE_ENTRIES = 10;
const MAX_LOGS_PER_PROCESS = 5000;

export const useLogStream = (processId: string): UseLogStreamResult => {
  const cacheKey = processId;
  const [logs, setLogs] = useState<LogEntry[]>(
    () => logCache.get(cacheKey) || []
  );
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!processId) {
      return;
    }

    const eventSource = new EventSource(
      `/api/execution-processes/${processId}/raw-logs`
    );
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setError(null);
    };

    const addLogEntry = (entry: LogEntry) => {
      setLogs((prev) => {
        const newLogs = [...prev, entry];
        // Limit log length to prevent memory issues
        const limitedLogs = newLogs.slice(-MAX_LOGS_PER_PROCESS);

        // Update cache
        logCache.set(cacheKey, limitedLogs);

        // Clean up old cache entries if needed
        if (logCache.size > MAX_CACHE_ENTRIES) {
          const oldestKey = logCache.keys().next().value;
          if (oldestKey) {
            logCache.delete(oldestKey);
          }
        }

        return limitedLogs;
      });
    };

    // Handle json_patch events (new format from server)
    eventSource.addEventListener('json_patch', (event) => {
      try {
        const patches = JSON.parse(event.data);
        patches.forEach((patch: any) => {
          const value = patch?.value;
          if (!value || !value.type) return;

          switch (value.type) {
            case 'STDOUT':
            case 'STDERR':
              addLogEntry({ type: value.type, content: value.content });
              break;
            // Ignore other patch types (NORMALIZED_ENTRY, DIFF, etc.)
            default:
              break;
          }
        });
      } catch (e) {
        console.error('Failed to parse json_patch:', e);
      }
    });

    eventSource.addEventListener('finished', () => {
      eventSource.close();
    });

    eventSource.onerror = () => {
      setError('Connection failed');
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [processId, cacheKey]);

  return { logs, error };
};

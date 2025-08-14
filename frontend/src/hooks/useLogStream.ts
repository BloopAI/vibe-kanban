import { useEffect, useState, useRef } from 'react';
import type { PatchType } from 'shared/types';

type LogEntry = Extract<PatchType, { type: 'STDOUT' } | { type: 'STDERR' }>;

interface UseLogStreamResult {
  logs: LogEntry[];
  error: string | null;
}

export const useLogStream = (processId: string): UseLogStreamResult => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!processId) {
      return;
    }

    // Clear logs when process changes
    setLogs([]);
    setError(null);

    const eventSource = new EventSource(
      `/api/execution-processes/${processId}/raw-logs`
    );
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setError(null);
    };

    const addLogEntry = (entry: LogEntry) => {
      setLogs((prev) => [...prev, entry]);
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
  }, [processId]);

  return { logs, error };
};

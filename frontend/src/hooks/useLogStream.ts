import { useEffect, useState, useRef } from 'react';

interface UseLogStreamResult {
  logs: string[];
  isConnected: boolean;
  error: string | null;
}

// Simple in-memory cache for logs
const logCache = new Map<string, string[]>();
const MAX_CACHE_ENTRIES = 10;
const MAX_LOGS_PER_PROCESS = 5000;

export const useLogStream = (
  processId: string,
  enabled: boolean
): UseLogStreamResult => {
  const cacheKey = processId;
  const [logs, setLogs] = useState<string[]>(
    () => logCache.get(cacheKey) || []
  );
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!enabled || !processId) {
      return;
    }

    const eventSource = new EventSource(
      `/api/execution-processes/${processId}/raw-logs`
    );
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setIsConnected(true);
      setError(null);
    };

    const addLogLine = (line: string) => {
      setLogs((prev) => {
        const newLogs = [...prev, line];
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
              addLogLine(`stdout: ${value.content}`);
              break;
            case 'STDERR':
              addLogLine(`stderr: ${value.content}`);
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
      addLogLine('--- Stream finished ---');
      eventSource.close();
      setIsConnected(false);
    });

    eventSource.onerror = () => {
      setError('Connection failed');
      setIsConnected(false);
      eventSource.close();
    };

    return () => {
      eventSource.close();
      setIsConnected(false);
    };
  }, [processId, enabled]);

  // Don't reset cached logs when disabled - just update connection state
  useEffect(() => {
    if (!enabled) {
      setError(null);
      setIsConnected(false);
    }
  }, [enabled]);

  return { logs, isConnected, error };
};

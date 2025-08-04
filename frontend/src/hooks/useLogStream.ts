import { useEffect, useState, useRef } from 'react';

interface UseLogStreamResult {
  logs: string[];
  isConnected: boolean;
  error: string | null;
}

export const useLogStream = (processId: string, enabled: boolean): UseLogStreamResult => {
  const [logs, setLogs] = useState<string[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!enabled || !processId) {
      return;
    }

    const eventSource = new EventSource(`/api/execution-processes/${processId}/raw-logs`);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setIsConnected(true);
      setError(null);
    };

    eventSource.onmessage = (event) => {
      // Handle default messages
      setLogs(prev => [...prev, event.data]);
    };

    eventSource.addEventListener('stdout', (event) => {
      setLogs(prev => [...prev, `stdout: ${event.data}`]);
    });

    eventSource.addEventListener('stderr', (event) => {
      setLogs(prev => [...prev, `stderr: ${event.data}`]);
    });

    eventSource.addEventListener('finished', () => {
      setLogs(prev => [...prev, '--- Stream finished ---']);
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

  // Reset logs when disabled
  useEffect(() => {
    if (!enabled) {
      setLogs([]);
      setError(null);
      setIsConnected(false);
    }
  }, [enabled]);

  return { logs, isConnected, error };
};

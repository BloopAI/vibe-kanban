import { useEffect, useState, useRef } from 'react';
import type { ExecutionProcessSummary } from 'shared/types';
import type { UnifiedLogEntry } from '@/types/logs';

interface UseUnifiedLogsResult {
  entries: UnifiedLogEntry[];
  isConnected: boolean;
  error: string | null;
}

const MAX_ENTRIES = 5000;

export const useUnifiedLogs = (
  processes: ExecutionProcessSummary[],
  enabled: boolean
): UseUnifiedLogsResult => {
  const [entries, setEntries] = useState<UnifiedLogEntry[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourcesRef = useRef<Map<string, EventSource>>(new Map());

  const addEntry = (entry: Omit<UnifiedLogEntry, 'id'>) => {
    const newEntry: UnifiedLogEntry = {
      ...entry,
      id: `${entry.processId}-${Date.now()}-${Math.random()}`,
    };
    
    setEntries(prev => [...prev, newEntry].slice(-MAX_ENTRIES));
  };

  useEffect(() => {
    if (!enabled || !processes.length) {
      eventSourcesRef.current.forEach(es => es.close());
      eventSourcesRef.current.clear();
      setEntries([]);
      setIsConnected(false);
      setError(null);
      return;
    }

    const currentIds = new Set(processes.map(p => p.id));
    
    // Remove old connections
    eventSourcesRef.current.forEach((es, id) => {
      if (!currentIds.has(id)) {
        es.close();
        eventSourcesRef.current.delete(id);
      }
    });

    // Add new connections
    processes.forEach(process => {
      if (eventSourcesRef.current.has(process.id)) return;

      const eventSource = new EventSource(`/api/execution-processes/${process.id}/raw-logs`);
      
      const handleMessage = (event: MessageEvent, channel: 'raw' | 'stdout' | 'stderr') => {
        addEntry({
          ts: Date.now(),
          processId: process.id,
          processName: process.run_reason,
          channel,
          payload: event.data,
        });
      };

      eventSource.onmessage = (e) => handleMessage(e, 'raw');
      eventSource.addEventListener('stdout', (e) => handleMessage(e, 'stdout'));
      eventSource.addEventListener('stderr', (e) => handleMessage(e, 'stderr'));
      eventSource.onopen = () => setError(null);
      eventSource.onerror = () => setError('Connection failed');
      eventSource.addEventListener('finished', () => {
        eventSource.close();
        eventSourcesRef.current.delete(process.id);
      });

      eventSourcesRef.current.set(process.id, eventSource);
    });

    setIsConnected(eventSourcesRef.current.size > 0);

    return () => {
      eventSourcesRef.current.forEach(es => es.close());
      eventSourcesRef.current.clear();
    };
  }, [processes, enabled]);

  return { entries, isConnected, error };
};

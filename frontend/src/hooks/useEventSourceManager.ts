import { useEffect, useState, useRef } from 'react';
import { applyPatch } from 'rfc6902';
import type { ExecutionProcess } from 'shared/types';
import type { ProcessStartPayload } from '@/types/logs';

interface ProcessData {
  [processId: string]: any;
}

interface UseEventSourceManagerParams {
  processes: ExecutionProcess[];
  enabled: boolean;
  getEndpoint: (process: ExecutionProcess) => string;
  initialData?: any;
}

interface UseEventSourceManagerResult {
  processData: ProcessData;
  isConnected: boolean;
  error: string | null;
}

export const useEventSourceManager = ({
  processes,
  enabled,
  getEndpoint,
  initialData = null,
}: UseEventSourceManagerParams): UseEventSourceManagerResult => {
  const [processData, setProcessData] = useState<ProcessData>({});
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourcesRef = useRef<Map<string, EventSource>>(new Map());
  const processDataRef = useRef<ProcessData>({});
  const processedEntriesRef = useRef<Map<string, Set<number>>>(new Map());

  useEffect(() => {
    if (!enabled || !processes.length) {
      // Close all connections and reset state
      eventSourcesRef.current.forEach((es) => es.close());
      eventSourcesRef.current.clear();
      setProcessData({});
      setIsConnected(false);
      setError(null);
      processDataRef.current = {};
      processedEntriesRef.current.clear();
      return;
    }

    const currentIds = new Set(processes.map((p) => p.id));

    // Remove old connections
    eventSourcesRef.current.forEach((es, id) => {
      if (!currentIds.has(id)) {
        es.close();
        eventSourcesRef.current.delete(id);
        delete processDataRef.current[id];
        processedEntriesRef.current.delete(id);
      }
    });

    // Add new connections
    processes.forEach((process) => {
      if (eventSourcesRef.current.has(process.id)) return;

      const endpoint = getEndpoint(process);

      // Initialize process data
      if (!processDataRef.current[process.id]) {
        processDataRef.current[process.id] = initialData
          ? structuredClone(initialData)
          : { entries: [] };

        // Inject process start marker as the first entry
        const processStartPayload: ProcessStartPayload = {
          processId: process.id,
          runReason: process.run_reason,
          startedAt: process.started_at,
          status: process.status,
        };

        const processStartEntry = {
          type: 'PROCESS_START' as const,
          content: processStartPayload,
        };

        processDataRef.current[process.id].entries.push(processStartEntry);
      }

      const eventSource = new EventSource(endpoint);

      eventSource.onopen = () => {
        setError(null);
      };

      eventSource.addEventListener('json_patch', (event) => {
        try {
          const patches = JSON.parse(event.data);

          // Initialize tracking for this process if needed
          if (!processedEntriesRef.current.has(process.id)) {
            processedEntriesRef.current.set(process.id, new Set());
          }

          applyPatch(processDataRef.current[process.id], patches);

          // Trigger re-render with updated data
          setProcessData({ ...processDataRef.current });
        } catch (err) {
          console.error('Failed to apply JSON patch:', err);
          setError('Failed to process log update');
        }
      });

      eventSource.addEventListener('finished', () => {
        eventSource.close();
        eventSourcesRef.current.delete(process.id);
        setIsConnected(eventSourcesRef.current.size > 0);
      });

      eventSource.onerror = () => {
        setError('Connection failed');
        eventSource.close();
        eventSourcesRef.current.delete(process.id);
        setIsConnected(eventSourcesRef.current.size > 0);
      };

      eventSourcesRef.current.set(process.id, eventSource);
    });

    setIsConnected(eventSourcesRef.current.size > 0);

    return () => {
      eventSourcesRef.current.forEach((es) => es.close());
      eventSourcesRef.current.clear();
    };
  }, [processes, enabled, getEndpoint, initialData]);

  return { processData, isConnected, error };
};

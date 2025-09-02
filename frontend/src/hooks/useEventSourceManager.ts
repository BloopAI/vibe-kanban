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
  const processesRef = useRef<ExecutionProcess[]>([]);
  const enabledRef = useRef<boolean>(enabled);
  const getEndpointRef = useRef(getEndpoint);
  const retryCountsRef = useRef<Map<string, number>>(new Map());
  const retryTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map()
  );

  // Keep latest values in refs for retry handlers
  useEffect(() => {
    processesRef.current = processes;
  }, [processes]);
  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);
  useEffect(() => {
    getEndpointRef.current = getEndpoint;
  }, [getEndpoint]);

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

    // Helper to open an EventSource with auto-retry on transient failures (e.g., race before store is ready)
    const openEventSource = (process: ExecutionProcess) => {
      // If disabled or process no longer present, don't connect
      if (!enabledRef.current) return;
      if (!processesRef.current.find((p) => p.id === process.id)) return;

      const endpoint = getEndpointRef.current(process);

      // Reinitialize process data on each (re)connect to avoid duplicating history
      processDataRef.current[process.id] = initialData
        ? structuredClone(initialData)
        : { entries: [] };
      processedEntriesRef.current.delete(process.id);

      // Inject process start marker as the first entry (client-side only)
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

      const eventSource = new EventSource(endpoint);

      eventSource.onopen = () => {
        setError(null);
        setIsConnected(true);
        retryCountsRef.current.set(process.id, 0);
      };

      eventSource.addEventListener('json_patch', (event) => {
        try {
          const patches = JSON.parse(event.data);

          if (!processedEntriesRef.current.has(process.id)) {
            processedEntriesRef.current.set(process.id, new Set());
          }
          applyPatch(processDataRef.current[process.id], patches);
          setProcessData({ ...processDataRef.current });
        } catch (err) {
          console.error('Failed to apply JSON patch:', err);
          setError('Failed to process log update');
        }
      });

      eventSource.addEventListener('finished', () => {
        eventSource.close();
        eventSourcesRef.current.delete(process.id);
        retryCountsRef.current.delete(process.id);
        const t = retryTimersRef.current.get(process.id);
        if (t) {
          clearTimeout(t);
          retryTimersRef.current.delete(process.id);
        }
        setIsConnected(eventSourcesRef.current.size > 0);
      });

      eventSource.onerror = () => {
        setError('Connection failed');
        eventSource.close();
        eventSourcesRef.current.delete(process.id);

        const nextAttempt = (retryCountsRef.current.get(process.id) || 0) + 1;
        retryCountsRef.current.set(process.id, nextAttempt);

        const maxAttempts = 6;
        if (
          nextAttempt <= maxAttempts &&
          enabledRef.current &&
          processesRef.current.find((p) => p.id === process.id)
        ) {
          const delay = Math.min(1500, 250 * 2 ** (nextAttempt - 1));
          const timer = setTimeout(() => openEventSource(process), delay);
          const prevTimer = retryTimersRef.current.get(process.id);
          if (prevTimer) clearTimeout(prevTimer);
          retryTimersRef.current.set(process.id, timer);
        } else {
          setIsConnected(eventSourcesRef.current.size > 0);
        }
      };

      eventSourcesRef.current.set(process.id, eventSource);
    };

    // Add new connections
    processes.forEach((process) => {
      if (eventSourcesRef.current.has(process.id)) return;
      openEventSource(process);
    });

    setIsConnected(eventSourcesRef.current.size > 0);

    return () => {
      // Cleanup all event sources and any pending retry timers
      eventSourcesRef.current.forEach((es) => es.close());
      eventSourcesRef.current.clear();
      retryTimersRef.current.forEach((t) => clearTimeout(t));
      retryTimersRef.current.clear();
    };
  }, [processes, enabled, getEndpoint, initialData]);

  return { processData, isConnected, error };
};

import { useEffect, useState, useRef } from 'react';
import { applyPatch } from 'rfc6902';
import type { Operation } from 'rfc6902';

interface UseJsonPatchStreamOptions<T> {
  /**
   * Called once when the stream starts to inject initial data
   */
  injectInitialEntry?: (data: T) => void;
  /**
   * Filter/deduplicate patches before applying them
   */
  deduplicatePatches?: (patches: Operation[]) => Operation[];
}

interface UseJsonPatchStreamResult<T> {
  data: T | undefined;
  isConnected: boolean;
  error: string | null;
}

/**
 * Generic hook for consuming SSE streams that send JSON patches
 */
export const useJsonPatchStream = <T>(
  endpoint: string | undefined,
  enabled: boolean,
  initialData: () => T,
  options: UseJsonPatchStreamOptions<T> = {}
): UseJsonPatchStreamResult<T> => {
  const [data, setData] = useState<T | undefined>(undefined);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const dataRef = useRef<T | undefined>(undefined);
  const retryTimerRef = useRef<number | null>(null);
  const retryAttemptsRef = useRef<number>(0);
  const [retryNonce, setRetryNonce] = useState(0);

  function scheduleReconnect() {
    if (retryTimerRef.current) return; // already scheduled
    // Exponential backoff with cap: 1s, 2s, 4s, 8s (max), then stay at 8s
    const attempt = retryAttemptsRef.current;
    const delay = Math.min(8000, 1000 * Math.pow(2, attempt));
    retryTimerRef.current = window.setTimeout(() => {
      retryTimerRef.current = null;
      setRetryNonce((n) => n + 1);
    }, delay);
  }

  useEffect(() => {
    if (!enabled || !endpoint) {
      // Close connection and reset state
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (retryTimerRef.current) {
        window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      retryAttemptsRef.current = 0;
      setData(undefined);
      setIsConnected(false);
      setError(null);
      dataRef.current = undefined;
      return;
    }

    // Initialize data
    if (!dataRef.current) {
      dataRef.current = initialData();

      // Inject initial entry if provided
      if (options.injectInitialEntry) {
        options.injectInitialEntry(dataRef.current);
      }

      setData({ ...dataRef.current });
    }

    // Create EventSource if it doesn't exist
    if (!eventSourceRef.current) {
      const eventSource = new EventSource(endpoint);

      eventSource.onopen = () => {
        setError(null);
        setIsConnected(true);
        // Reset backoff on successful connection
        retryAttemptsRef.current = 0;
        if (retryTimerRef.current) {
          window.clearTimeout(retryTimerRef.current);
          retryTimerRef.current = null;
        }
      };

      eventSource.addEventListener('json_patch', (event) => {
        try {
          const patches: Operation[] = JSON.parse(event.data);
          const filtered = options.deduplicatePatches
            ? options.deduplicatePatches(patches)
            : patches;

          if (!filtered.length || !dataRef.current) return;

          // Deep clone the current state before mutating it
          dataRef.current = structuredClone(dataRef.current);

          // Apply patch (mutates the clone in place)
          applyPatch(dataRef.current as any, filtered);

          // React re-render: dataRef.current is already a new object
          setData(dataRef.current);
        } catch (err) {
          console.error('Failed to apply JSON patch:', err);
          setError('Failed to process stream update');
        }
      });

      eventSource.addEventListener('finished', () => {
        eventSource.close();
        eventSourceRef.current = null;
        setIsConnected(false);
        // Treat finished as terminal and schedule reconnect; servers may rotate
        retryAttemptsRef.current += 1;
        scheduleReconnect();
      });

      eventSource.onerror = () => {
        setError('Connection failed');
        // Close and schedule reconnect
        try {
          eventSource.close();
        } catch {
          /* empty */
        }
        eventSourceRef.current = null;
        setIsConnected(false);
        retryAttemptsRef.current += 1;
        scheduleReconnect();
      };

      eventSourceRef.current = eventSource;
    }

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (retryTimerRef.current) {
        window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      dataRef.current = undefined;
      setData(undefined);
    };
  }, [
    endpoint,
    enabled,
    initialData,
    options.injectInitialEntry,
    options.deduplicatePatches,
    retryNonce,
  ]);

  return { data, isConnected, error };
};

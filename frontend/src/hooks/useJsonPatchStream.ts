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

  useEffect(() => {
    if (!enabled || !endpoint) {
      // Close connection and reset state
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
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
      });

      eventSource.onerror = () => {
        setError('Connection failed');
        eventSourceRef.current = null;
        setIsConnected(false);
      };

      eventSourceRef.current = eventSource;
    }

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
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
  ]);

  return { data, isConnected, error };
};

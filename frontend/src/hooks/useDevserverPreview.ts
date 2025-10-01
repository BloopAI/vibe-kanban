import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { useExecutionProcesses } from '@/hooks/useExecutionProcesses';
import { streamJsonPatchEntries } from '@/utils/streamJsonPatchEntries';
import { PatchType } from 'shared/types';
import { stripAnsi } from 'fancy-ansi';

export interface DevserverPreviewState {
  status: 'idle' | 'searching' | 'ready' | 'error';
  url?: string;
  port?: number;
  scheme: 'http' | 'https';
}

interface UseDevserverPreviewOptions {
  projectHasDevScript?: boolean;
  projectId: string; // Required for context-based URL persistence
}

export function useDevserverPreview(
  attemptId?: string | null | undefined,
  options: UseDevserverPreviewOptions = {
    projectId: '',
    projectHasDevScript: false,
  }
): DevserverPreviewState {
  const { executionProcesses, error: processesError } = useExecutionProcesses(
    attemptId || '',
    { showSoftDeleted: false }
  );

  const [state, setState] = useState<DevserverPreviewState>({
    status: 'idle',
    scheme: 'http',
  });

  // Ref to track state for stable callbacks
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const streamRef = useRef<(() => void) | null>(null);
  const streamTokenRef = useRef(0);
  const lastProcessedIndexRef = useRef(0);
  const streamDebounceTimeoutRef = useRef<number | null>(null);
  const pendingEntriesRef = useRef<Array<{ type: string; content: string }>>(
    []
  );

  // URL detection patterns (in order of priority)
  const urlPatterns = useMemo(
    () => [
      // Full URLs with protocol (localhost and IP addresses only)
      /(https?:\/\/(?:\[[0-9a-f:]+\]|localhost|127\.0\.0\.1|0\.0\.0\.0|\d{1,3}(?:\.\d{1,3}){3})(?::\d{2,5})?(?:\/\S*)?)/i,
      // Host:port patterns
      /(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[[0-9a-f:]+\]|(?:\d{1,3}\.){3}\d{1,3}):(\d{2,5})/i,
      // Port mentions
      // /port[^0-9]{0,5}(\d{2,5})/i,
    ],
    []
  );

  const extractUrlFromLine = useCallback(
    (line: string) => {
      // Try full URL pattern first
      const fullUrlMatch = urlPatterns[0].exec(stripAnsi(line));
      if (fullUrlMatch) {
        try {
          const url = new URL(fullUrlMatch[1]);
          // Normalize 0.0.0.0 and :: to localhost for preview
          if (
            url.hostname === '0.0.0.0' ||
            url.hostname === '::' ||
            url.hostname === '[::]'
          ) {
            url.hostname = 'localhost';
          }
          return {
            url: url.toString(),
            port: parseInt(url.port) || (url.protocol === 'https:' ? 443 : 80),
            scheme:
              url.protocol === 'https:'
                ? ('https' as const)
                : ('http' as const),
          };
        } catch {
          // Invalid URL, continue to other patterns
        }
      }

      // Try host:port pattern
      const hostPortMatch = urlPatterns[1].exec(line);
      if (hostPortMatch) {
        const port = parseInt(hostPortMatch[1]);
        const scheme = /https/i.test(line) ? 'https' : 'http';
        return {
          url: `${scheme}://localhost:${port}`,
          port,
          scheme: scheme as 'http' | 'https',
        };
      }

      return null;
    },
    [urlPatterns]
  );

  const processPendingEntries = useCallback(
    (currentToken: number) => {
      // Ignore if this is from a stale stream
      if (currentToken !== streamTokenRef.current) return;

      // Use ref instead of state deps to avoid dependency churn
      const currentState = stateRef.current;
      if (currentState.status === 'ready' && currentState.url) return;

      // Process all pending entries
      for (const entry of pendingEntriesRef.current) {
        const urlInfo = extractUrlFromLine(entry.content);
        if (urlInfo) {
          setState((prev) => {
            // Only update if we don't already have a URL for this stream
            if (prev.status === 'ready' && prev.url) return prev;

            return {
              status: 'ready',
              url: urlInfo.url,
              port: urlInfo.port,
              scheme: urlInfo.scheme,
            };
          });

          break; // Stop after finding first URL
        }
      }

      // Clear processed entries
      pendingEntriesRef.current = [];
    },
    [extractUrlFromLine]
  );

  const debouncedProcessEntries = useCallback(
    (currentToken: number) => {
      if (streamDebounceTimeoutRef.current) {
        clearTimeout(streamDebounceTimeoutRef.current);
      }

      streamDebounceTimeoutRef.current = window.setTimeout(() => {
        processPendingEntries(currentToken);
      }, 200); // Process when stream is quiet for 200ms
    },
    [processPendingEntries]
  );

  const startLogStream = useCallback(
    async (processId: string) => {
      // Close any existing stream
      if (streamRef.current) {
        streamRef.current();
        streamRef.current = null;
      }

      // Increment token to invalidate previous streams
      const currentToken = ++streamTokenRef.current;

      try {
        const url = `/api/execution-processes/${processId}/raw-logs/ws`;

        streamJsonPatchEntries<PatchType>(url, {
          onEntries: (entries) => {
            // Only process new entries since last time
            const startIndex = lastProcessedIndexRef.current;
            const newEntries = entries.slice(startIndex);

            // Add new entries to pending buffer
            newEntries.forEach((entry) => {
              if (entry.type === 'STDOUT' || entry.type === 'STDERR') {
                pendingEntriesRef.current.push(entry);
              }
            });

            lastProcessedIndexRef.current = entries.length;

            // Debounce processing - only process when stream is quiet
            debouncedProcessEntries(currentToken);
          },
          onFinished: () => {
            if (currentToken === streamTokenRef.current) {
              streamRef.current = null;
            }
          },
          onError: (error) => {
            console.warn(
              `Error streaming logs for process ${processId}:`,
              error
            );
            if (currentToken === streamTokenRef.current) {
              streamRef.current = null;
            }
          },
        });

        // Store a cleanup function (note: streamJsonPatchEntries doesn't return one,
        // so we'll rely on the token system for now)
        streamRef.current = () => {
          // The stream doesn't provide a direct way to close,
          // but the token system will ignore future callbacks
        };
      } catch (error) {
        console.warn(
          `Failed to start log stream for process ${processId}:`,
          error
        );
      }
    },
    [debouncedProcessEntries]
  );

  // Find the latest devserver process
  const selectedProcess = useMemo(() => {
    const devserverProcesses = executionProcesses.filter(
      (process) =>
        process.run_reason === 'devserver' && process.status === 'running'
    );

    if (devserverProcesses.length === 0) return null;

    return devserverProcesses.sort(
      (a, b) =>
        new Date(b.created_at as unknown as string).getTime() -
        new Date(a.created_at as unknown as string).getTime()
    )[0];
  }, [executionProcesses]);

  // Update state based on current conditions
  useEffect(() => {
    if (processesError) {
      setState((prev) => ({ ...prev, status: 'error' }));
      return;
    }

    if (!selectedProcess) {
      setState((prev) => {
        if (prev.status === 'ready') return prev;
        return {
          ...prev,
          status: options.projectHasDevScript ? 'searching' : 'idle',
        };
      });
      return;
    }

    setState((prev) => {
      if (prev.status === 'ready') return prev;
      return { ...prev, status: 'searching' };
    });
  }, [selectedProcess, processesError, options.projectHasDevScript]);

  // Start streaming logs when selected process changes
  useEffect(() => {
    const processId = selectedProcess?.id;
    if (!processId) {
      if (streamRef.current) {
        streamRef.current();
        streamRef.current = null;
      }
      return;
    }

    // Only set if something actually changes to prevent churn
    setState((prev) => {
      if (
        prev.status === 'searching' &&
        prev.url === undefined &&
        prev.port === undefined
      )
        return prev;
      return { ...prev, status: 'searching', url: undefined, port: undefined };
    });

    // Reset processed index for new stream
    lastProcessedIndexRef.current = 0;

    // Clear any pending debounced processing
    if (streamDebounceTimeoutRef.current) {
      clearTimeout(streamDebounceTimeoutRef.current);
      streamDebounceTimeoutRef.current = null;
    }

    // Clear pending entries
    pendingEntriesRef.current = [];

    startLogStream(processId);
  }, [selectedProcess?.id, startLogStream]);

  // Reset state when attempt changes
  useEffect(() => {
    setState({
      status: 'idle',
      scheme: 'http',
      // Clear url/port so we can re-detect
      url: undefined,
      port: undefined,
    });

    lastProcessedIndexRef.current = 0;

    // Clear any pending debounced processing
    if (streamDebounceTimeoutRef.current) {
      clearTimeout(streamDebounceTimeoutRef.current);
      streamDebounceTimeoutRef.current = null;
    }

    // Clear pending entries
    pendingEntriesRef.current = [];

    if (streamRef.current) {
      streamRef.current();
      streamRef.current = null;
    }

    streamTokenRef.current++;
  }, [attemptId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current();
      }
    };
  }, []);

  return state;
}

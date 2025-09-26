import { useEffect, useMemo, useState, useRef } from 'react';
import { useExecutionProcesses } from '@/hooks/useExecutionProcesses';
import { streamJsonPatchEntries } from '@/utils/streamJsonPatchEntries';
import { PatchType } from 'shared/types';

export interface DevserverPreviewState {
  status: 'idle' | 'searching' | 'ready' | 'error';
  url?: string;
  port?: number;
  scheme: 'http' | 'https';
}

interface UseDevserverPreviewOptions {
  projectHasDevScript?: boolean;
}

export function useDevserverPreview(
  attemptId?: string | null | undefined,
  options: UseDevserverPreviewOptions = {}
): DevserverPreviewState {
  const { executionProcesses, error: processesError } = useExecutionProcesses(
    attemptId || '',
    { showSoftDeleted: false }
  );

  const [state, setState] = useState<DevserverPreviewState>({
    status: 'idle',
    scheme: 'http',
  });

  const streamRef = useRef<(() => void) | null>(null);
  const streamTokenRef = useRef(0);
  const processedLinesRef = useRef(new Set<string>());
  const processedLinesQueueRef = useRef<string[]>([]);

  // URL detection patterns (in order of priority)
  const urlPatterns = useMemo(() => [
    // Full URLs with protocol
    /(https?:\/\/(?:\[[0-9a-f:]+\]|[a-z0-9.-]+|\d{1,3}(?:\.\d{1,3}){3})(?::\d{2,5})?(?:\/\S*)?)/i,
    // Host:port patterns
    /(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[[0-9a-f:]+\]|(?:\d{1,3}\.){3}\d{1,3}):(\d{2,5})/i,
    // Port mentions
    /port[^0-9]{0,5}(\d{2,5})/i,
  ], []);

  const extractUrlFromLine = (line: string) => {
    // Try full URL pattern first
    const fullUrlMatch = urlPatterns[0].exec(line);
    if (fullUrlMatch) {
      try {
        const url = new URL(fullUrlMatch[1]);
        // Normalize 0.0.0.0 and :: to localhost for preview
        if (url.hostname === '0.0.0.0' || url.hostname === '::' || url.hostname === '[::]') {
          url.hostname = 'localhost';
        }
        return {
          url: url.toString(),
          port: parseInt(url.port) || (url.protocol === 'https:' ? 443 : 80),
          scheme: url.protocol === 'https:' ? 'https' as const : 'http' as const,
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

    // Try port mention pattern
    const portMatch = urlPatterns[2].exec(line);
    if (portMatch) {
      const port = parseInt(portMatch[1]);
      const scheme = /https/i.test(line) ? 'https' : 'http';
      return {
        url: `${scheme}://localhost:${port}`,
        port,
        scheme: scheme as 'http' | 'https',
      };
    }

    return null;
  };

  const addToProcessedLines = (line: string) => {
    if (!processedLinesRef.current.has(line)) {
      processedLinesRef.current.add(line);
      processedLinesQueueRef.current.push(line);
      
      // Keep bounded (max 1000 lines per process)
      if (processedLinesQueueRef.current.length > 1000) {
        const oldLine = processedLinesQueueRef.current.shift()!;
        processedLinesRef.current.delete(oldLine);
      }
    }
  };

  const processLogLine = (line: string, currentToken: number) => {
    // Ignore if this is from a stale stream
    if (currentToken !== streamTokenRef.current) return;

    addToProcessedLines(line);
    
    const urlInfo = extractUrlFromLine(line);
    if (!urlInfo) return;

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
  };

  const startLogStream = async (processId: string) => {
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
          entries.forEach((entry) => {
            if (entry.type === 'STDOUT' || entry.type === 'STDERR') {
              processLogLine(entry.content, currentToken);
            }
          });
        },
        onFinished: () => {
          if (currentToken === streamTokenRef.current) {
            streamRef.current = null;
          }
        },
        onError: (error) => {
          console.warn(`Error streaming logs for process ${processId}:`, error);
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
      console.warn(`Failed to start log stream for process ${processId}:`, error);
    }
  };

  // Find the latest devserver process
  const selectedProcess = useMemo(() => {
    const devserverProcesses = executionProcesses.filter(
      (process) => process.run_reason === 'devserver'
    );

    if (devserverProcesses.length === 0) return null;

    // Prefer running processes, then sort by created_at descending
    const runningProcesses = devserverProcesses.filter(
      (process) => process.status === 'running'
    );
    
    const candidateProcesses = runningProcesses.length > 0 
      ? runningProcesses 
      : devserverProcesses;

    return candidateProcesses.sort(
      (a, b) => new Date(b.created_at as unknown as string).getTime() - 
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
    if (!selectedProcess) {
      if (streamRef.current) {
        streamRef.current();
        streamRef.current = null;
      }
      return;
    }

    // Clear processed lines for new process
    processedLinesRef.current.clear();
    processedLinesQueueRef.current.length = 0;

    // Reset URL state for new process
    setState((prev) => ({
      ...prev,
      status: 'searching',
      url: undefined,
      port: undefined,
    }));

    startLogStream(selectedProcess.id);
  }, [selectedProcess?.id]);

  // Reset state when attempt changes
  useEffect(() => {
    setState({
      status: 'idle',
      scheme: 'http',
    });
    
    processedLinesRef.current.clear();
    processedLinesQueueRef.current.length = 0;
    
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

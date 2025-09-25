import { useEffect, useMemo, useState, useRef } from 'react';
import { useAttemptExecution } from '@/hooks/useAttemptExecution';
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
  const { attemptData } = useAttemptExecution(attemptId || undefined);
  const [state, setState] = useState<DevserverPreviewState>({
    status: 'idle',
    scheme: 'http',
  });

  const processedLogs = useRef(new Set<string>());
  const activeControllers = useRef(new Map<string, AbortController>());

  const devserverRegex = useMemo(
    () => /(?:localhost|127\.0\.0\.1|0\.0\.0\.0):(\d+)[^\d]*/i,
    []
  );

  const updateFromLogLine = (line: string) => {
    const match = devserverRegex.exec(line);
    if (!match) return;

    const port = Number(match[1]);
    const scheme = /https/i.test(line) ? 'https' : 'http';
    const url = `${scheme}://localhost:${port}`;

    setState((prev) => {
      if (prev.url === url && prev.status === 'ready') return prev;
      return {
        status: 'ready',
        url,
        port,
        scheme,
      };
    });
  };

  const processRawLogs = async (processId: string) => {
    if (activeControllers.current.has(processId)) {
      return;
    }

    const controller = new AbortController();
    activeControllers.current.set(processId, controller);

    try {
      const url = `/api/execution-processes/${processId}/raw-logs/ws`;

      streamJsonPatchEntries<PatchType>(url, {
        onEntries: (entries) => {
          entries.forEach((entry) => {
            if (entry.type === 'STDOUT' || entry.type === 'STDERR') {
              const logId = `${processId}-${entry.content}`;
              if (!processedLogs.current.has(logId)) {
                processedLogs.current.add(logId);
                updateFromLogLine(entry.content);
              }
            }
          });
        },
        onFinished: () => {
          activeControllers.current.delete(processId);
        },
        onError: (error) => {
          console.warn(`Error streaming logs for process ${processId}:`, error);
          activeControllers.current.delete(processId);
        },
      });
    } catch (error) {
      console.warn(
        `Failed to start log stream for process ${processId}:`,
        error
      );
      activeControllers.current.delete(processId);
    }
  };

  // Monitor processes and their logs
  useEffect(() => {
    if (!attemptData?.processes) return;

    const devLikeProcesses = attemptData.processes.filter((process) => {
      // Check if it's a setup script (which might contain dev server commands)
      // or if it's explicitly a dev server process
      return (
        process.run_reason === 'setupscript' ||
        process.run_reason === 'devserver'
      );
    });

    const hasDevLikeProcess = devLikeProcesses.length > 0;
    const shouldBeSearching = hasDevLikeProcess || options.projectHasDevScript;

    // Update status to searching if we have dev-like processes
    setState((prev) => {
      if (prev.status === 'ready') return prev;
      return {
        ...prev,
        status: shouldBeSearching ? 'searching' : 'idle',
      };
    });

    // Process logs from dev-like processes
    devLikeProcesses.forEach((process) => {
      if (process.status === 'running' || process.status === 'completed') {
        processRawLogs(process.id);
      }
    });

    return () => {
      // Cleanup active controllers when dependencies change
      activeControllers.current.forEach((controller) => {
        controller.abort();
      });
      activeControllers.current.clear();
    };
  }, [attemptData?.processes, options.projectHasDevScript]);

  // Reset state when attempt changes
  useEffect(() => {
    if (attemptId) {
      setState({
        status: 'idle',
        scheme: 'http',
      });
      processedLogs.current.clear();

      // Cleanup any existing controllers
      activeControllers.current.forEach((controller) => {
        controller.abort();
      });
      activeControllers.current.clear();
    }
  }, [attemptId]);

  return state;
}

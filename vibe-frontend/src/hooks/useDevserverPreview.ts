import { useEffect, useMemo, useState } from 'react';
import { useExecutionProcessesContext } from '@/contexts/ExecutionProcessesContext';

export interface DevserverPreviewState {
  status: 'idle' | 'searching' | 'ready' | 'error';
  url?: string;
  port?: number;
  scheme: 'http' | 'https';
}

interface UseDevserverPreviewOptions {
  projectHasDevScript?: boolean;
  projectId: string; // Required for context-based URL persistence
  lastKnownUrl?: {
    url: string;
    port?: number;
    scheme: 'http' | 'https';
  };
}

export function useDevserverPreview(
  attemptId?: string | null | undefined,
  options: UseDevserverPreviewOptions = {
    projectId: '',
    projectHasDevScript: false,
  }
): DevserverPreviewState {
  const { projectHasDevScript = false, lastKnownUrl } = options;
  const {
    executionProcessesVisible: executionProcesses,
    error: processesError,
  } = useExecutionProcessesContext();

  const [state, setState] = useState<DevserverPreviewState>({
    status: 'idle',
    scheme: 'http',
  });

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

  useEffect(() => {
    if (processesError) {
      setState((prev) => ({ ...prev, status: 'error' }));
      return;
    }

    if (!selectedProcess) {
      setState((prev) => ({
        status: projectHasDevScript ? 'searching' : 'idle',
        scheme: prev.scheme ?? 'http',
        url: undefined,
        port: undefined,
      }));
      return;
    }

    if (lastKnownUrl) {
      setState((prev) => {
        if (
          prev.status === 'ready' &&
          prev.url === lastKnownUrl.url &&
          prev.port === lastKnownUrl.port &&
          prev.scheme === lastKnownUrl.scheme
        ) {
          return prev;
        }

        return {
          status: 'ready',
          url: lastKnownUrl.url,
          port: lastKnownUrl.port,
          scheme: lastKnownUrl.scheme ?? 'http',
        };
      });
      return;
    }

    setState((prev) => ({
      status: 'searching',
      scheme: prev.scheme ?? 'http',
      url: undefined,
      port: undefined,
    }));
  }, [processesError, selectedProcess, lastKnownUrl, projectHasDevScript]);

  useEffect(() => {
    setState({
      status: 'idle',
      scheme: 'http',
      url: undefined,
      port: undefined,
    });
  }, [attemptId]);

  return state;
}

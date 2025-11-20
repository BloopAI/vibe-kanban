import { useState } from 'react';
import useWebSocket from 'react-use-websocket';
import type { PatchType } from 'shared/types';
import { DEFAULT_WEBSOCKET_OPTIONS, toWsUrl } from '@/utils/websocket';

type LogEntry = Extract<PatchType, { type: 'STDOUT' } | { type: 'STDERR' }>;

interface UseLogStreamResult {
  logs: LogEntry[];
  error: string | null;
}

type WsMsg =
  | { JsonPatch: Array<{ value?: PatchType }> }
  | { finished: boolean };

export const useLogStream = (processId: string): UseLogStreamResult => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  const endpoint = processId
    ? `/api/execution-processes/${processId}/raw-logs/ws`
    : null;
  const wsUrl = toWsUrl(endpoint);

  const { getWebSocket } = useWebSocket(wsUrl, {
    ...DEFAULT_WEBSOCKET_OPTIONS,
    onOpen: () => {
      setError(null);
      setLogs([]);
    },
    onMessage: (event) => {
      try {
        const data: WsMsg = JSON.parse(event.data);

        if ('JsonPatch' in data) {
          const patches = data.JsonPatch;
          patches.forEach((patch) => {
            const value = patch?.value;
            if (!value || !value.type) return;

            switch (value.type) {
              case 'STDOUT':
              case 'STDERR':
                setLogs((prev) => [
                  ...prev,
                  { type: value.type, content: value.content },
                ]);
                break;
              default:
                break;
            }
          });
        } else if ('finished' in data && data.finished) {
          getWebSocket()?.close();
        }
      } catch (e) {
        console.error('Failed to parse message:', e);
      }
    },
    onError: () => {
      setError('Connection failed');
    },
  });

  return { logs, error };
};

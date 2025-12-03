import { useEffect, useState, useRef, useCallback } from 'react';

/**
 * Connection information from the Hive for streaming logs.
 */
interface ConnectionInfo {
  assignment_id: string;
  node_id: string;
  direct_url: string | null;
  relay_url: string;
  connection_token: string;
  expires_at: string;
}

/**
 * Log entry from the stream.
 */
export interface NodeLogEntry {
  id: number;
  output_type: string;
  content: string;
  timestamp: string;
}

/**
 * Message types from the log stream WebSocket.
 */
type LogStreamMessage =
  | { type: 'logs'; entries: NodeLogEntry[] }
  | { type: 'heartbeat' }
  | { type: 'error'; message: string };

/**
 * Connection type indicating how we're connected.
 */
export type ConnectionType = 'connecting' | 'direct' | 'relay' | 'disconnected';

/**
 * Result of the useNodeLogStream hook.
 */
interface UseNodeLogStreamResult {
  logs: NodeLogEntry[];
  error: string | null;
  connectionType: ConnectionType;
  retry: () => void;
}

/**
 * Hook for streaming logs from a node via the Hive.
 *
 * This hook attempts to:
 * 1. Fetch connection info from the Hive
 * 2. Try direct WebSocket connection to the node (if public_url available)
 * 3. Fall back to Hive relay if direct connection fails
 *
 * @param assignmentId - The assignment ID to stream logs for
 */
export const useNodeLogStream = (
  assignmentId: string | undefined
): UseNodeLogStreamResult => {
  const [logs, setLogs] = useState<NodeLogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [connectionType, setConnectionType] =
    useState<ConnectionType>('connecting');

  const wsRef = useRef<WebSocket | null>(null);
  const retryCountRef = useRef<number>(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isIntentionallyClosed = useRef<boolean>(false);
  const connectionInfoRef = useRef<ConnectionInfo | null>(null);
  // Use a ref to store the connect function to avoid circular dependency
  const connectRef = useRef<() => Promise<void>>();

  /**
   * Fetch connection info from the Hive.
   */
  const fetchConnectionInfo = useCallback(
    async (id: string): Promise<ConnectionInfo | null> => {
      try {
        const response = await fetch(
          `/v1/nodes/assignments/${id}/connection-info`
        );
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `HTTP ${response.status}`);
        }
        return await response.json();
      } catch (e) {
        console.error('Failed to fetch connection info:', e);
        setError(
          e instanceof Error ? e.message : 'Failed to fetch connection info'
        );
        return null;
      }
    },
    []
  );

  /**
   * Try to connect directly to the node.
   */
  const tryDirectConnection = useCallback(
    (info: ConnectionInfo): Promise<WebSocket | null> => {
      return new Promise((resolve) => {
        if (!info.direct_url) {
          resolve(null);
          return;
        }

        try {
          // Build direct WebSocket URL
          const directUrl = new URL(info.direct_url);
          const wsProtocol = directUrl.protocol === 'https:' ? 'wss:' : 'ws:';
          const wsUrl = `${wsProtocol}//${directUrl.host}/api/execution-processes/${assignmentId}/raw-logs/ws?token=${encodeURIComponent(info.connection_token)}`;

          const ws = new WebSocket(wsUrl);
          const timeout = setTimeout(() => {
            ws.close();
            resolve(null);
          }, 5000); // 5 second timeout for direct connection

          ws.onopen = () => {
            clearTimeout(timeout);
            resolve(ws);
          };

          ws.onerror = () => {
            clearTimeout(timeout);
            ws.close();
            resolve(null);
          };

          ws.onclose = () => {
            clearTimeout(timeout);
            resolve(null);
          };
        } catch {
          resolve(null);
        }
      });
    },
    [assignmentId]
  );

  /**
   * Connect to the Hive relay.
   */
  const connectToRelay = useCallback(
    (info: ConnectionInfo): Promise<WebSocket | null> => {
      return new Promise((resolve) => {
        try {
          // Build relay WebSocket URL
          const relayUrl = new URL(info.relay_url);
          const wsProtocol = relayUrl.protocol === 'https:' ? 'wss:' : 'ws:';
          const wsUrl = `${wsProtocol}//${relayUrl.host}${relayUrl.pathname}?token=${encodeURIComponent(info.connection_token)}`;

          const ws = new WebSocket(wsUrl);
          const timeout = setTimeout(() => {
            ws.close();
            resolve(null);
          }, 10000); // 10 second timeout for relay

          ws.onopen = () => {
            clearTimeout(timeout);
            resolve(ws);
          };

          ws.onerror = () => {
            clearTimeout(timeout);
            ws.close();
            resolve(null);
          };
        } catch {
          resolve(null);
        }
      });
    },
    []
  );

  /**
   * Handle incoming WebSocket messages.
   */
  const setupWebSocketHandlers = useCallback((ws: WebSocket) => {
    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as LogStreamMessage;

        switch (message.type) {
          case 'logs':
            setLogs((prev) => [...prev, ...message.entries]);
            break;
          case 'heartbeat':
            // Keep-alive, no action needed
            break;
          case 'error':
            setError(message.message);
            break;
        }
      } catch (e) {
        console.error('Failed to parse WebSocket message:', e);
      }
    };

    ws.onerror = () => {
      setError('WebSocket connection error');
    };

    ws.onclose = (event) => {
      if (!isIntentionallyClosed.current && event.code !== 1000) {
        setConnectionType('disconnected');

        // Retry with exponential backoff
        const next = retryCountRef.current + 1;
        retryCountRef.current = next;
        if (next <= 6) {
          const delay = Math.min(1500, 250 * 2 ** (next - 1));
          retryTimerRef.current = setTimeout(() => {
            // Use ref to call connect to avoid circular dependency
            void connectRef.current?.();
          }, delay);
        } else {
          setError('Connection lost after multiple retries');
        }
      }
    };
  }, []);

  /**
   * Main connection logic.
   */
  const connect = useCallback(async () => {
    if (!assignmentId) return;

    setConnectionType('connecting');
    setError(null);

    // Fetch connection info
    const info = await fetchConnectionInfo(assignmentId);
    if (!info) {
      setConnectionType('disconnected');
      return;
    }
    connectionInfoRef.current = info;

    // Try direct connection first
    let ws = await tryDirectConnection(info);
    if (ws) {
      setConnectionType('direct');
      setLogs([]); // Clear logs on new connection
      retryCountRef.current = 0;
    } else {
      // Fall back to relay
      ws = await connectToRelay(info);
      if (ws) {
        setConnectionType('relay');
        setLogs([]); // Clear logs on new connection
        retryCountRef.current = 0;
      }
    }

    if (!ws) {
      setError('Failed to establish connection');
      setConnectionType('disconnected');
      return;
    }

    wsRef.current = ws;
    isIntentionallyClosed.current = false;
    setupWebSocketHandlers(ws);
  }, [
    assignmentId,
    fetchConnectionInfo,
    tryDirectConnection,
    connectToRelay,
    setupWebSocketHandlers,
  ]);

  // Keep connectRef updated with the latest connect function
  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  /**
   * Manual retry function.
   */
  const retry = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    retryCountRef.current = 0;
    void connect();
  }, [connect]);

  // Effect to manage connection lifecycle
  useEffect(() => {
    if (!assignmentId) {
      setLogs([]);
      setError(null);
      setConnectionType('disconnected');
      return;
    }

    void connect();

    return () => {
      isIntentionallyClosed.current = true;
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
  }, [assignmentId, connect]);

  return { logs, error, connectionType, retry };
};

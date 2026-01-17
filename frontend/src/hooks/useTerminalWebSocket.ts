import { useCallback, useEffect, useRef, useState } from 'react';

// Message type constants
const MESSAGE_TYPES = {
  OUTPUT: 'output',
  ERROR: 'error',
  EXIT: 'exit',
  INPUT: 'input',
  RESIZE: 'resize',
} as const;

interface TerminalMessage {
  type: 'output' | 'error' | 'exit';
  data?: string;
  message?: string;
  code?: number;
}

interface UseTerminalWebSocketOptions {
  endpoint: string | null;
  onData: (data: string) => void;
  onExit?: () => void;
  onError?: (error: string) => void;
  enabled?: boolean;
}

interface UseTerminalWebSocketReturn {
  send: (data: string) => void;
  resize: (cols: number, rows: number) => void;
  isConnected: boolean;
  error: string | null;
}

function encodeBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  const binString = Array.from(bytes, (b) => String.fromCodePoint(b)).join('');
  return btoa(binString);
}

function decodeBase64(base64: string): string {
  const binString = atob(base64);
  const bytes = Uint8Array.from(binString, (c) => c.codePointAt(0)!);
  return new TextDecoder().decode(bytes);
}

export function useTerminalWebSocket({
  endpoint,
  onData,
  onExit,
  onError,
  enabled = true,
}: UseTerminalWebSocketOptions): UseTerminalWebSocketReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Track mount to force WebSocket reconnection on component remount
  const [mountId, setMountId] = useState(0);

  // Callback refs to prevent stale closures
  const onDataRef = useRef(onData);
  const onExitRef = useRef(onExit);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onDataRef.current = onData;
    onExitRef.current = onExit;
    onErrorRef.current = onError;
  }, [onData, onExit, onError]);

  // Increment mountId on mount to trigger WebSocket effect
  useEffect(() => {
    setMountId((prev) => prev + 1);
  }, []);

  useEffect(() => {
    // Close existing connection and reset state if disabled or no endpoint
    if (!enabled || !endpoint) {
      if (wsRef.current) {
        wsRef.current.onopen = null;
        wsRef.current.onmessage = null;
        wsRef.current.onerror = null;
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
      setIsConnected(false);
      setError(null);
      return;
    }

    const wsEndpoint = endpoint.replace(/^http/, 'ws');
    const ws = new WebSocket(wsEndpoint);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[useTerminalWebSocket] WebSocket opened');
      setIsConnected(true);
      setError(null);
    };

    ws.onmessage = (event) => {
      console.log('[useTerminalWebSocket] onmessage received', {
        rawData: event.data,
      });
      try {
        const msg: TerminalMessage = JSON.parse(event.data);
        console.log('[useTerminalWebSocket] parsed message', { msg });
        switch (msg.type) {
          case MESSAGE_TYPES.OUTPUT:
            if (msg.data) {
              const decoded = decodeBase64(msg.data);
              console.log('[useTerminalWebSocket] OUTPUT decoded', {
                decoded,
                onDataRef: onDataRef.current,
              });
              onDataRef.current(decoded);
            }
            break;
          case MESSAGE_TYPES.ERROR:
            console.log('[useTerminalWebSocket] ERROR', {
              message: msg.message,
            });
            onErrorRef.current?.(msg.message || 'Unknown error');
            break;
          case MESSAGE_TYPES.EXIT:
            console.log('[useTerminalWebSocket] EXIT');
            onExitRef.current?.();
            break;
        }
      } catch (e) {
        console.warn('Failed to parse terminal message:', e);
      }
    };

    ws.onerror = () => {
      const errorMsg = 'WebSocket connection error';
      setError(errorMsg);
      onErrorRef.current?.(errorMsg);
    };

    ws.onclose = () => {
      setIsConnected(false);
    };

    // Cleanup: null handlers before close to prevent callbacks during teardown
    return () => {
      ws.onopen = null;
      ws.onmessage = null;
      ws.onerror = null;
      ws.onclose = null;
      ws.close();
      // Don't null wsRef - the readyState check handles closed connections
      // and the next effect run will overwrite with a new WebSocket
    };
    // mountId ensures effect re-runs on component remount
  }, [endpoint, enabled, mountId]);

  const send = useCallback((data: string) => {
    console.log('[useTerminalWebSocket] send called', {
      data,
      wsRef: wsRef.current,
      readyState: wsRef.current?.readyState,
      isOpen: wsRef.current?.readyState === WebSocket.OPEN,
    });
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({ type: MESSAGE_TYPES.INPUT, data: encodeBase64(data) })
      );
      console.log('[useTerminalWebSocket] message sent');
    } else {
      console.log('[useTerminalWebSocket] NOT sent - WebSocket not open');
    }
  }, []);

  const resize = useCallback((cols: number, rows: number) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({ type: MESSAGE_TYPES.RESIZE, cols, rows })
      );
    }
  }, []);

  return {
    send,
    resize,
    isConnected,
    error,
  };
}

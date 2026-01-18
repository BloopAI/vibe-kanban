import { useCallback, useEffect, useRef } from 'react';
import useWebSocket, { ReadyState } from 'react-use-websocket';

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
}

interface UseTerminalWebSocketReturn {
  send: (data: string) => void;
  resize: (cols: number, rows: number) => void;
  isConnected: boolean;
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
}: UseTerminalWebSocketOptions): UseTerminalWebSocketReturn {
  const onDataRef = useRef(onData);
  const onExitRef = useRef(onExit);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onDataRef.current = onData;
    onExitRef.current = onExit;
    onErrorRef.current = onError;
  }, [onData, onExit, onError]);

  const wsEndpoint = endpoint ? endpoint.replace(/^http/, 'ws') : null;

  const { sendMessage, readyState } = useWebSocket(wsEndpoint, {
    onMessage: (event) => {
      try {
        const msg: TerminalMessage = JSON.parse(event.data);
        switch (msg.type) {
          case 'output':
            if (msg.data) {
              onDataRef.current(decodeBase64(msg.data));
            }
            break;
          case 'error':
            onErrorRef.current?.(msg.message || 'Unknown error');
            break;
          case 'exit':
            onExitRef.current?.();
            break;
        }
      } catch {
        // Ignore parse errors
      }
    },
    onError: () => {
      onErrorRef.current?.('WebSocket connection error');
    },
    shouldReconnect: () => false,
  });

  const send = useCallback(
    (data: string) => {
      sendMessage(JSON.stringify({ type: 'input', data: encodeBase64(data) }));
    },
    [sendMessage]
  );

  const resize = useCallback(
    (cols: number, rows: number) => {
      sendMessage(JSON.stringify({ type: 'resize', cols, rows }));
    },
    [sendMessage]
  );

  return {
    send,
    resize,
    isConnected: readyState === ReadyState.OPEN,
  };
}

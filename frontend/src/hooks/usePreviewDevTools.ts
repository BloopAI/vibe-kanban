import { useCallback, useState } from 'react';
import {
  type ConsoleEntry,
  type NetworkEntry,
  type ErrorEntry,
  type NavigationState,
  type PreviewDevToolsMessage,
} from '../types/previewDevTools';

const MAX_CONSOLE_LOGS = 500;
const MAX_NETWORK_REQUESTS = 200;
const MAX_ERRORS = 100;

export interface UsePreviewDevToolsReturn {
  // State
  consoleLogs: ConsoleEntry[];
  networkRequests: NetworkEntry[];
  errors: ErrorEntry[];
  navigation: NavigationState | null;
  isReady: boolean;

  // Actions
  clearConsole: () => void;
  clearNetwork: () => void;
  clearErrors: () => void;
  clearAll: () => void;

  // Message handler (to be called from bridge)
  handleMessage: (message: PreviewDevToolsMessage) => void;
}

/**
 * Hook to manage devtools state for preview iframe.
 * Handles console logs, network requests, errors, and navigation state.
 */
export function usePreviewDevTools(): UsePreviewDevToolsReturn {
  const [consoleLogs, setConsoleLogs] = useState<ConsoleEntry[]>([]);
  const [networkRequests, setNetworkRequests] = useState<NetworkEntry[]>([]);
  const [errors, setErrors] = useState<ErrorEntry[]>([]);
  const [navigation, setNavigation] = useState<NavigationState | null>(null);
  const [isReady, setIsReady] = useState(false);

  // Clear console logs
  const clearConsole = useCallback(() => {
    setConsoleLogs([]);
  }, []);

  // Clear network requests
  const clearNetwork = useCallback(() => {
    setNetworkRequests([]);
  }, []);

  // Clear errors
  const clearErrors = useCallback(() => {
    setErrors([]);
  }, []);

  // Clear all devtools data
  const clearAll = useCallback(() => {
    setConsoleLogs([]);
    setNetworkRequests([]);
    setErrors([]);
  }, []);

  // Handle incoming messages from iframe
  const handleMessage = useCallback((message: PreviewDevToolsMessage) => {
    switch (message.type) {
      case 'console': {
        const entry: ConsoleEntry = {
          id: crypto.randomUUID(),
          level: message.payload.level,
          args: message.payload.args,
          timestamp: message.payload.timestamp,
          stack: message.payload.stack,
        };
        setConsoleLogs((prev) => {
          const updated = [entry, ...prev];
          return updated.length > MAX_CONSOLE_LOGS
            ? updated.slice(0, MAX_CONSOLE_LOGS)
            : updated;
        });
        break;
      }

      case 'network': {
        const { id, phase, ...rest } = message.payload;
        setNetworkRequests((prev) => {
          // If phase is 'end' or 'error', update existing entry
          if (phase === 'end' || phase === 'error') {
            return prev.map((req) =>
              req.id === id ? { ...req, ...rest, phase } : req
            );
          }

          // Otherwise, add new entry (phase === 'start')
          const entry: NetworkEntry = {
            id,
            method: rest.method,
            url: rest.url,
            status: rest.status,
            statusText: rest.statusText,
            duration: rest.duration,
            phase,
            error: rest.error,
            timestamp: rest.timestamp,
          };
          const updated = [entry, ...prev];
          return updated.length > MAX_NETWORK_REQUESTS
            ? updated.slice(0, MAX_NETWORK_REQUESTS)
            : updated;
        });
        break;
      }

      case 'error': {
        const entry: ErrorEntry = {
          id: crypto.randomUUID(),
          message: message.payload.message,
          filename: message.payload.filename,
          lineno: message.payload.lineno,
          colno: message.payload.colno,
          stack: message.payload.stack,
          timestamp: message.payload.timestamp,
        };
        setErrors((prev) => {
          const updated = [entry, ...prev];
          return updated.length > MAX_ERRORS
            ? updated.slice(0, MAX_ERRORS)
            : updated;
        });
        break;
      }

      case 'navigation': {
        setNavigation({
          url: message.payload.url,
          title: message.payload.title,
          canGoBack: message.payload.canGoBack,
          canGoForward: message.payload.canGoForward,
        });
        break;
      }

      case 'ready': {
        setIsReady(true);
        break;
      }

      default: {
        // Exhaustive check - TypeScript will error if new message types are added
        const _exhaustive: never = message;
        console.warn('[usePreviewDevTools] Unknown message type:', _exhaustive);
      }
    }
  }, []);

  return {
    consoleLogs,
    networkRequests,
    errors,
    navigation,
    isReady,
    clearConsole,
    clearNetwork,
    clearErrors,
    clearAll,
    handleMessage,
  };
}

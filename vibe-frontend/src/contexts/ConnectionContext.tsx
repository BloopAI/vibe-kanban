import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

export type ConnectionState = 'online' | 'degraded' | 'offline';

interface ConnectionContextValue {
  /** Current connection state */
  state: ConnectionState;
  /** Timestamp of last successful API call */
  lastOnline: Date | null;
  /** Call this when an API request succeeds */
  reportSuccess: () => void;
  /** Call this when an API request fails */
  reportFailure: (error: Error) => void;
  /** Whether write operations should be allowed (queued if false) */
  isWriteAllowed: boolean;
  /** Number of consecutive failures */
  failureCount: number;
}

const ConnectionContext = createContext<ConnectionContextValue | null>(null);

interface ConnectionProviderProps {
  children: React.ReactNode;
}

// Number of consecutive failures before transitioning to degraded
const FAILURE_THRESHOLD = 2;

export function ConnectionProvider({ children }: ConnectionProviderProps) {
  const [state, setState] = useState<ConnectionState>('online');
  const [lastOnline, setLastOnline] = useState<Date | null>(new Date());
  const [failureCount, setFailureCount] = useState(0);

  // Use ref to track if we're in initial load (don't show errors immediately)
  const isInitialLoad = useRef(true);

  // Listen for browser online/offline events
  useEffect(() => {
    const handleOnline = () => {
      // Browser says we're online, but wait for API success to confirm
      // Don't immediately set to online, just reset failure count
      setFailureCount(0);
    };

    const handleOffline = () => {
      setState('offline');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Check initial state
    if (!navigator.onLine) {
      setState('offline');
    }

    // Mark initial load complete after a short delay
    const timer = setTimeout(() => {
      isInitialLoad.current = false;
    }, 3000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearTimeout(timer);
    };
  }, []);

  const reportSuccess = useCallback(() => {
    setState('online');
    setLastOnline(new Date());
    setFailureCount(0);
    isInitialLoad.current = false;
  }, []);

  const reportFailure = useCallback((error: Error) => {
    // During initial load, be more lenient
    if (isInitialLoad.current) {
      return;
    }

    setFailureCount((prev) => {
      const newCount = prev + 1;

      // Check if this is a network error vs server error
      const isNetworkError =
        error.message.includes('Failed to fetch') ||
        error.message.includes('Network request failed') ||
        error.message.includes('net::ERR_');

      if (isNetworkError && !navigator.onLine) {
        setState('offline');
      } else if (newCount >= FAILURE_THRESHOLD) {
        setState('degraded');
      }

      return newCount;
    });
  }, []);

  const isWriteAllowed = state === 'online';

  const value: ConnectionContextValue = {
    state,
    lastOnline,
    reportSuccess,
    reportFailure,
    isWriteAllowed,
    failureCount,
  };

  return (
    <ConnectionContext.Provider value={value}>
      {children}
    </ConnectionContext.Provider>
  );
}

export function useConnection(): ConnectionContextValue {
  const context = useContext(ConnectionContext);
  if (!context) {
    throw new Error('useConnection must be used within a ConnectionProvider');
  }
  return context;
}

/**
 * Safe version of useConnection that returns default values if not in provider.
 * Useful for components that might render outside the provider during SSR or testing.
 */
export function useConnectionSafe(): ConnectionContextValue {
  const context = useContext(ConnectionContext);
  if (!context) {
    return {
      state: 'online',
      lastOnline: null,
      reportSuccess: () => {},
      reportFailure: () => {},
      isWriteAllowed: true,
      failureCount: 0,
    };
  }
  return context;
}

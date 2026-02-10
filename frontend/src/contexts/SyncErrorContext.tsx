import {
  useContext,
  useState,
  useCallback,
  useMemo,
  useEffect,
  type ReactNode,
} from 'react';
import { createHmrContext } from '@/lib/hmrContext.ts';
import type { SyncError } from '@/lib/electric/types';

/**
 * Represents an error from a specific shape stream.
 */
export interface StreamError {
  streamId: string;
  tableName: string;
  error: SyncError;
  retry: () => void;
}

/**
 * Context value for managing sync errors across the application.
 */
export interface SyncErrorContextValue {
  /** Array of all current stream errors */
  errors: StreamError[];
  /** Quick check if any errors exist */
  hasErrors: boolean;
  /** Register an error for a specific stream */
  registerError: (
    streamId: string,
    tableName: string,
    error: SyncError,
    retry: () => void
  ) => void;
  /** Clear error for a specific stream */
  clearError: (streamId: string) => void;
  /** Retry all failed streams */
  retryAll: () => void;
}

const SyncErrorContext = createHmrContext<SyncErrorContextValue | null>(
  'SyncErrorContext',
  null
);

interface SyncErrorProviderProps {
  children: ReactNode;
}

export function SyncErrorProvider({ children }: SyncErrorProviderProps) {
  const [errorsMap, setErrorsMap] = useState<Map<string, StreamError>>(
    () => new Map()
  );

  const registerError = useCallback(
    (
      streamId: string,
      tableName: string,
      error: SyncError,
      retry: () => void
    ) => {
      setErrorsMap((prev) => {
        const next = new Map(prev);
        next.set(streamId, { streamId, tableName, error, retry });
        return next;
      });
    },
    []
  );

  const clearError = useCallback((streamId: string) => {
    setErrorsMap((prev) => {
      if (!prev.has(streamId)) return prev;
      const next = new Map(prev);
      next.delete(streamId);
      return next;
    });
  }, []);

  const errors = useMemo(() => Array.from(errorsMap.values()), [errorsMap]);

  const hasErrors = errors.length > 0;

  const retryAll = useCallback(() => {
    for (const streamError of errors) {
      streamError.retry();
    }
  }, [errors]);

  // Auto-retry all failed streams when tab becomes visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && errorsMap.size > 0) {
        for (const streamError of errorsMap.values()) {
          streamError.retry();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [errorsMap]);

  const value = useMemo<SyncErrorContextValue>(
    () => ({
      errors,
      hasErrors,
      registerError,
      clearError,
      retryAll,
    }),
    [errors, hasErrors, registerError, clearError, retryAll]
  );

  return (
    <SyncErrorContext.Provider value={value}>
      {children}
    </SyncErrorContext.Provider>
  );
}

/**
 * Hook to access sync error context.
 * Returns null if used outside of SyncErrorProvider (graceful fallback).
 */
export function useSyncErrorContext(): SyncErrorContextValue | null {
  return useContext(SyncErrorContext);
}

/**
 * Hook to access sync error context with required provider.
 * Throws if used outside of SyncErrorProvider.
 */
export function useSyncErrorContextRequired(): SyncErrorContextValue {
  const context = useContext(SyncErrorContext);
  if (!context) {
    throw new Error(
      'useSyncErrorContextRequired must be used within a SyncErrorProvider'
    );
  }
  return context;
}

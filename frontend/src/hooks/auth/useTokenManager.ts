import { useState, useEffect, useCallback } from 'react';
import { tokenManager } from '@/lib/auth/tokenManager';

/**
 * Hook for token management in React components.
 * Provides reactive access to token state and refresh functionality.
 */
export function useTokenManager() {
  const [isRefreshing, setIsRefreshing] = useState(
    tokenManager.getRefreshingState()
  );

  // Subscribe to refresh state changes
  useEffect(() => {
    return tokenManager.subscribe(setIsRefreshing);
  }, []);

  /**
   * Trigger a token refresh. Call this when you receive a 401.
   */
  const triggerRefresh = useCallback(async () => {
    return tokenManager.triggerRefresh();
  }, []);

  /**
   * Get the current token (uses cache if fresh).
   */
  const getToken = useCallback(async () => {
    return tokenManager.getToken();
  }, []);

  return {
    isRefreshing,
    triggerRefresh,
    getToken,
  };
}

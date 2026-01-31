import { oauthApi } from '../api';

const TOKEN_QUERY_KEY = ['auth', 'token'] as const;
const TOKEN_STALE_TIME = 90 * 1000; // 90 seconds (must be < 120s backend token TTL)

type RefreshStateCallback = (isRefreshing: boolean) => void;

class TokenManager {
  private isRefreshing = false;
  private refreshPromise: Promise<string | null> | null = null;
  private subscribers = new Set<RefreshStateCallback>();

  /**
   * Get the current access token.
   * Returns cached token if fresh, or fetches a new one if stale.
   * If a refresh is in progress, waits for it to complete.
   */
  async getToken(): Promise<string | null> {
    // If a refresh is in progress, wait for it
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    // Use React Query's fetchQuery for caching
    const { queryClient } = await import('../../main');

    try {
      const data = await queryClient.fetchQuery({
        queryKey: TOKEN_QUERY_KEY,
        queryFn: () => oauthApi.getToken(),
        staleTime: TOKEN_STALE_TIME,
      });
      return data?.access_token ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Force a token refresh. Call this when you receive a 401 response.
   * Coordinates multiple callers to prevent concurrent refresh attempts.
   *
   * Returns the new token (or null if refresh failed).
   */
  async triggerRefresh(): Promise<string | null> {
    // If already refreshing, return the existing promise
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    // Set refreshing state and notify subscribers
    this.setRefreshing(true);

    this.refreshPromise = this.performRefresh();

    try {
      return await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
      this.setRefreshing(false);
    }
  }

  /**
   * Get the current refreshing state synchronously.
   */
  getRefreshingState(): boolean {
    return this.isRefreshing;
  }

  /**
   * Subscribe to refresh state changes.
   * Returns an unsubscribe function.
   */
  subscribe(callback: RefreshStateCallback): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  private setRefreshing(value: boolean): void {
    this.isRefreshing = value;
    this.subscribers.forEach((cb) => cb(value));
  }

  private async performRefresh(): Promise<string | null> {
    const { queryClient } = await import('../../main');

    // Invalidate the cache to force a fresh fetch
    await queryClient.invalidateQueries({ queryKey: TOKEN_QUERY_KEY });

    // Fetch fresh token
    try {
      const data = await queryClient.fetchQuery({
        queryKey: TOKEN_QUERY_KEY,
        queryFn: () => oauthApi.getToken(),
        staleTime: TOKEN_STALE_TIME,
      });
      return data?.access_token ?? null;
    } catch {
      return null;
    }
  }
}

// Export singleton instance
export const tokenManager = new TokenManager();

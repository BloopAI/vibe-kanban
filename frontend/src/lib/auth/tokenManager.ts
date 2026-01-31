import { oauthApi } from '../api';

const TOKEN_QUERY_KEY = ['auth', 'token'] as const;
const TOKEN_STALE_TIME = 125 * 1000; // 125 seconds (slightly longer than the BE stale time)

type RefreshStateCallback = (isRefreshing: boolean) => void;
type PauseableShape = { pause: () => void; resume: () => void };

class TokenManager {
  private isRefreshing = false;
  private refreshPromise: Promise<string | null> | null = null;
  private subscribers = new Set<RefreshStateCallback>();
  private pauseableShapes = new Set<PauseableShape>();

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
  triggerRefresh(): Promise<string | null> {
    // If already refreshing, return the existing promise (deduplication)
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    // CRITICAL: Assign promise SYNCHRONOUSLY before any async work.
    // This prevents race conditions when multiple 401 handlers call
    // triggerRefresh() nearly simultaneously - they all get the same promise.
    this.refreshPromise = this.doRefresh();
    return this.refreshPromise;
  }

  /**
   * Register an Electric shape for pause/resume during token refresh.
   * When refresh starts, all shapes are paused to prevent 401 spam.
   * When refresh completes, shapes are resumed.
   *
   * Returns an unsubscribe function.
   */
  registerShape(shape: PauseableShape): () => void {
    this.pauseableShapes.add(shape);
    // If currently refreshing, pause immediately
    if (this.isRefreshing) {
      shape.pause();
    }
    return () => this.pauseableShapes.delete(shape);
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

  private async doRefresh(): Promise<string | null> {
    this.setRefreshing(true);
    this.pauseShapes();

    try {
      const { queryClient } = await import('../../main');

      // Invalidate the cache to force a fresh fetch
      await queryClient.invalidateQueries({ queryKey: TOKEN_QUERY_KEY });

      // Fetch fresh token
      const data = await queryClient.fetchQuery({
        queryKey: TOKEN_QUERY_KEY,
        queryFn: () => oauthApi.getToken(),
        staleTime: TOKEN_STALE_TIME,
      });

      const token = data?.access_token ?? null;
      if (token) {
        this.resumeShapes();
      }
      return token;
    } catch {
      return null;
    } finally {
      this.refreshPromise = null;
      this.setRefreshing(false);
    }
  }

  private setRefreshing(value: boolean): void {
    this.isRefreshing = value;
    this.subscribers.forEach((cb) => cb(value));
  }

  private pauseShapes(): void {
    for (const shape of this.pauseableShapes) {
      shape.pause();
    }
  }

  private resumeShapes(): void {
    for (const shape of this.pauseableShapes) {
      shape.resume();
    }
  }
}

// Export singleton instance
export const tokenManager = new TokenManager();

import { oauthApi } from '../api';
import { shouldRefreshAccessToken } from 'shared/jwt';

const TOKEN_QUERY_KEY = ['auth', 'token'] as const;
const TOKEN_STALE_TIME = 125 * 1000;

type RefreshStateCallback = (isRefreshing: boolean) => void;
type PauseableShape = { pause: () => void; resume: () => void };

class TokenManager {
  private isRefreshing = false;
  private refreshPromise: Promise<string | null> | null = null;
  private subscribers = new Set<RefreshStateCallback>();
  private pauseableShapes = new Set<PauseableShape>();

  /**
   * Get a valid access token, refreshing if needeed.
   * Returns null if refresh fails or no token is available.
   */
  async getToken(): Promise<string | null> {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    const { queryClient } = await import('../../main');

    const cachedData = queryClient.getQueryData<{
      access_token?: string;
    }>(TOKEN_QUERY_KEY);
    const cachedToken = cachedData?.access_token;
    if (cachedToken === undefined || shouldRefreshAccessToken(cachedToken)) {
      await queryClient.invalidateQueries({ queryKey: TOKEN_QUERY_KEY });
    }

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
    // CRITICAL: Assign promise SYNCHRONOUSLY so concurrent 401 handlers share one refresh.
    this.refreshPromise ??= this.doRefresh();
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

      await queryClient.invalidateQueries({ queryKey: TOKEN_QUERY_KEY });

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

export const tokenManager = new TokenManager();

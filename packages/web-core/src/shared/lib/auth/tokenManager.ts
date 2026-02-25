import { ApiError, oauthApi } from '@/shared/lib/api';
import { queryClient } from '@/shared/lib/queryClient';
import { shouldRefreshAccessToken } from 'shared/jwt';

const TOKEN_QUERY_KEY = ['auth', 'token'] as const;
const TOKEN_STALE_TIME = 125 * 1000;
const AUTH_DEBUG_PREFIX = '[auth-debug][local-web][token-manager]';

type RefreshStateCallback = (isRefreshing: boolean) => void;
type PauseableShape = { pause: () => void; resume: () => void };

function isUnauthorizedError(error: unknown): boolean {
  return error instanceof ApiError && error.statusCode === 401;
}

function authDebug(message: string, data?: unknown): void {
  if (data === undefined) {
    console.debug(`${AUTH_DEBUG_PREFIX} ${message}`);
    return;
  }
  console.debug(`${AUTH_DEBUG_PREFIX} ${message}`, data);
}

class TokenManager {
  private isRefreshing = false;
  private refreshPromise: Promise<string | null> | null = null;
  private subscribers = new Set<RefreshStateCallback>();
  private pauseableShapes = new Set<PauseableShape>();

  /**
   * Get a valid access token, refreshing if needed.
   * Returns null immediately if the user is not logged in.
   */
  async getToken(): Promise<string | null> {
    authDebug('getToken called', {
      refreshPromiseActive: Boolean(this.refreshPromise),
      isRefreshing: this.isRefreshing,
    });
    if (this.refreshPromise) {
      authDebug('getToken returning in-flight refresh promise');
      return this.refreshPromise;
    }

    // Skip token fetch if user is not logged in — avoids unnecessary 401s
    // from Electric shapes or other background requests after logout.
    const cachedSystem = queryClient.getQueryData<{
      login_status?: { status: string };
    }>(['user-system']);
    authDebug('getToken read cached user-system state', { cachedSystem });
    if (cachedSystem && cachedSystem.login_status?.status !== 'loggedin') {
      authDebug(
        'getToken returning null because cached login status is not loggedin'
      );
      return null;
    }

    const cachedData = queryClient.getQueryData<{
      access_token?: string;
    }>(TOKEN_QUERY_KEY);
    const cachedToken = cachedData?.access_token;
    authDebug('getToken read cached token query', {
      cachedData,
      cachedToken,
      shouldRefresh: cachedToken ? shouldRefreshAccessToken(cachedToken) : null,
    });
    if (!cachedToken || shouldRefreshAccessToken(cachedToken)) {
      authDebug(
        'getToken invalidating token query because token missing or stale'
      );
      await queryClient.invalidateQueries({ queryKey: TOKEN_QUERY_KEY });
    }

    try {
      const data = await queryClient.fetchQuery({
        queryKey: TOKEN_QUERY_KEY,
        queryFn: () => oauthApi.getToken(),
        staleTime: TOKEN_STALE_TIME,
      });
      authDebug('getToken fetchQuery resolved', { data });
      return data?.access_token ?? null;
    } catch (error) {
      authDebug('getToken fetchQuery failed', { error });
      if (isUnauthorizedError(error)) {
        authDebug(
          'getToken encountered unauthorized error, invoking handleUnauthorized'
        );
        await this.handleUnauthorized();
      }
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
    authDebug('triggerRefresh called', {
      existingRefreshPromise: Boolean(this.refreshPromise),
      isRefreshing: this.isRefreshing,
    });
    // CRITICAL: Assign promise SYNCHRONOUSLY so concurrent 401 handlers share one refresh.
    this.refreshPromise ??= this.doRefresh();
    authDebug('triggerRefresh returning refresh promise', {
      refreshPromiseActive: Boolean(this.refreshPromise),
    });
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
    authDebug('shape registered for auth refresh coordination', {
      totalShapes: this.pauseableShapes.size,
      currentlyRefreshing: this.isRefreshing,
    });
    // If currently refreshing, pause immediately
    if (this.isRefreshing) {
      authDebug('shape paused immediately because refresh is already active');
      shape.pause();
    }
    return () => {
      this.pauseableShapes.delete(shape);
      authDebug('shape unregistered from auth refresh coordination', {
        totalShapes: this.pauseableShapes.size,
      });
    };
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
    authDebug('doRefresh started');
    // Skip refresh if user is already logged out — avoids unnecessary 401s
    // from Electric shapes or other background requests after logout.
    const cachedSystem = queryClient.getQueryData<{
      login_status?: { status: string };
    }>(['user-system']);
    authDebug('doRefresh read cached user-system state', { cachedSystem });
    if (cachedSystem && cachedSystem.login_status?.status !== 'loggedin') {
      // Pause shapes so they stop making requests while logged out
      authDebug(
        'doRefresh aborting because cached login status is not loggedin; pausing shapes'
      );
      this.pauseShapes();
      return null;
    }

    this.setRefreshing(true);
    this.pauseShapes();

    try {
      // Invalidate the cache to force a fresh fetch
      authDebug('doRefresh invalidating token query');
      await queryClient.invalidateQueries({ queryKey: TOKEN_QUERY_KEY });

      // Fetch fresh token
      const data = await queryClient.fetchQuery({
        queryKey: TOKEN_QUERY_KEY,
        queryFn: () => oauthApi.getToken(),
        staleTime: TOKEN_STALE_TIME,
      });
      authDebug('doRefresh fetchQuery resolved', { data });

      const token = data?.access_token ?? null;
      if (token) {
        authDebug(
          'doRefresh obtained refreshed access token; resuming shapes',
          {
            token,
          }
        );
        this.resumeShapes();
      } else {
        authDebug('doRefresh completed without token');
      }
      return token;
    } catch (error) {
      authDebug('doRefresh failed', { error });
      if (isUnauthorizedError(error)) {
        authDebug(
          'doRefresh encountered unauthorized error, invoking handleUnauthorized'
        );
        await this.handleUnauthorized();
      }
      return null;
    } finally {
      this.refreshPromise = null;
      authDebug('doRefresh finalized; cleared refreshPromise');
      this.setRefreshing(false);
    }
  }

  private async handleUnauthorized(): Promise<void> {
    // Check if the user was previously logged in before we invalidate.
    // If they're already logged out, 401s are expected — don't show the dialog.
    const cachedSystem = queryClient.getQueryData<{
      login_status?: { status: string };
    }>(['user-system']);
    const wasLoggedIn = cachedSystem?.login_status?.status === 'loggedin';
    authDebug('handleUnauthorized invoked', { cachedSystem, wasLoggedIn });

    // Pause shapes — session is invalid, prevent further 401s
    this.pauseShapes();

    // Reload system state so the UI transitions to logged-out
    authDebug('handleUnauthorized invalidating user-system query');
    await queryClient.invalidateQueries({ queryKey: ['user-system'] });

    // Only show the login dialog if the user was previously logged in
    // (i.e., their session expired unexpectedly). Don't prompt users who
    // intentionally logged out or were never logged in.
    if (wasLoggedIn) {
      authDebug(
        'handleUnauthorized opening OAuth dialog for previously logged-in user'
      );
      const { OAuthDialog } = await import(
        '@/shared/dialogs/global/OAuthDialog'
      );
      void OAuthDialog.show({});
    } else {
      authDebug(
        'handleUnauthorized not showing OAuth dialog (user already logged out)'
      );
    }
  }

  private setRefreshing(value: boolean): void {
    authDebug('setRefreshing', {
      value,
      subscriberCount: this.subscribers.size,
    });
    this.isRefreshing = value;
    this.subscribers.forEach((cb) => cb(value));
  }

  private pauseShapes(): void {
    authDebug('pauseShapes invoked', { shapeCount: this.pauseableShapes.size });
    for (const shape of this.pauseableShapes) {
      shape.pause();
    }
  }

  private resumeShapes(): void {
    authDebug('resumeShapes invoked', {
      shapeCount: this.pauseableShapes.size,
    });
    for (const shape of this.pauseableShapes) {
      shape.resume();
    }
  }
}

// Export singleton instance
export const tokenManager = new TokenManager();

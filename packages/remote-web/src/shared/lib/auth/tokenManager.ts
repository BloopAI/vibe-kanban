import {
  getAccessToken,
  getRefreshToken,
  storeTokens,
  clearAccessToken,
  clearTokens,
} from "@remote/shared/lib/auth";
import { shouldRefreshAccessToken } from "shared/jwt";
import { refreshTokens } from "@remote/shared/lib/api";

const TOKEN_REFRESH_TIMEOUT_MS = 80_000;
const TOKEN_REFRESH_MAX_ATTEMPTS = 3;
const AUTH_DEBUG_PREFIX = "[auth-debug][remote-web][token-manager]";

function authDebug(message: string, data?: unknown): void {
  if (data === undefined) {
    console.debug(`${AUTH_DEBUG_PREFIX} ${message}`);
    return;
  }
  console.debug(`${AUTH_DEBUG_PREFIX} ${message}`, data);
}

async function refreshWithRetry(refreshToken: string) {
  authDebug("refreshWithRetry called", {
    refreshToken,
    maxAttempts: TOKEN_REFRESH_MAX_ATTEMPTS,
    timeoutMs: TOKEN_REFRESH_TIMEOUT_MS,
  });
  for (let attempt = 1; attempt <= TOKEN_REFRESH_MAX_ATTEMPTS; attempt++) {
    const backoffMs = Math.min(500 * 2 ** (attempt - 1), 2000);
    let timeoutId: ReturnType<typeof setTimeout>;
    authDebug("refresh attempt starting", { attempt, backoffMs, refreshToken });
    try {
      const result = await Promise.race([
        refreshTokens(refreshToken),
        new Promise<never>((_, reject) => {
          timeoutId = setTimeout(
            () => reject(new Error("Token refresh timed out")),
            TOKEN_REFRESH_TIMEOUT_MS,
          );
        }),
      ]);
      authDebug("refresh attempt succeeded", {
        attempt,
        accessToken: result.access_token,
        refreshToken: result.refresh_token,
      });
      return result;
    } catch (error) {
      authDebug("refresh attempt failed", { attempt, error });
      const isTimeout =
        error instanceof Error && error.message === "Token refresh timed out";
      if (isTimeout) throw error;

      const status = (error as { status?: number }).status;
      const isRetryable =
        !status || status >= 500 || error instanceof TypeError;
      authDebug("refresh attempt retry classification", {
        attempt,
        status,
        isRetryable,
        backoffMs,
      });
      if (isRetryable && attempt < TOKEN_REFRESH_MAX_ATTEMPTS) {
        authDebug("refresh attempt backing off before retry", {
          attempt,
          backoffMs,
        });
        await new Promise((r) => setTimeout(r, backoffMs));
        continue;
      }
      throw error;
    } finally {
      authDebug("refresh attempt clearing timeout", { attempt });
      clearTimeout(timeoutId!);
    }
  }
  authDebug("refreshWithRetry exhausted attempts");
  throw new Error("Token refresh failed after retries");
}

let refreshPromise: Promise<string> | null = null;

async function doTokenRefresh(): Promise<string> {
  authDebug("doTokenRefresh called");
  const current = await getAccessToken();
  authDebug("doTokenRefresh current access token state", {
    current,
    shouldRefresh: current ? shouldRefreshAccessToken(current) : null,
  });
  if (current && !shouldRefreshAccessToken(current)) {
    authDebug("doTokenRefresh returning existing non-expired token", { current });
    return current;
  }

  const refreshToken = await getRefreshToken();
  authDebug("doTokenRefresh loaded refresh token", { refreshToken });
  if (!refreshToken) {
    authDebug("doTokenRefresh missing refresh token; clearing tokens");
    await clearTokens();
    throw new Error("No refresh token available");
  }

  authDebug("doTokenRefresh requesting refreshed tokens", { refreshToken });
  const tokens = await refreshWithRetry(refreshToken);
  authDebug("doTokenRefresh received refreshed token pair", {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
  });
  await storeTokens(tokens.access_token, tokens.refresh_token);
  authDebug("doTokenRefresh stored refreshed token pair");
  return tokens.access_token;
}

function handleTokenRefresh(): Promise<string> {
  authDebug("handleTokenRefresh called", {
    refreshPromiseActive: Boolean(refreshPromise),
  });
  if (refreshPromise) {
    authDebug("handleTokenRefresh reusing in-flight refresh promise");
    return refreshPromise;
  }

  const innerPromise =
    typeof navigator.locks?.request === "function"
      ? navigator.locks
          .request("rf-token-refresh", doTokenRefresh)
          .then((t) => t)
      : doTokenRefresh();

  const promise = innerPromise
    .catch(async (error: unknown) => {
      authDebug("handleTokenRefresh inner promise rejected", { error });
      await clearTokens();
      authDebug("handleTokenRefresh cleared tokens after refresh failure");

      const status = (error as { status?: number }).status;
      authDebug("handleTokenRefresh error status classification", { status });
      if (status === 401) {
        authDebug("handleTokenRefresh returning session expired error");
        throw new Error("Session expired. Please sign in again.");
      }

      authDebug("handleTokenRefresh returning generic session refresh error");
      throw new Error("Session refresh failed. Please sign in again.");
    })
    .finally(() => {
      authDebug("handleTokenRefresh finally clearing shared refresh promise");
      refreshPromise = null;
    });

  refreshPromise = promise;
  authDebug("handleTokenRefresh stored shared refresh promise");
  return promise;
}

export async function getToken(): Promise<string> {
  authDebug("getToken called");
  const accessToken = await getAccessToken();
  authDebug("getToken loaded access token", { accessToken });
  if (!accessToken) {
    authDebug("getToken missing access token, checking refresh token");
    if (!(await getRefreshToken())) throw new Error("Not authenticated");
    authDebug("getToken found refresh token; delegating to handleTokenRefresh");
    return handleTokenRefresh();
  }
  if (shouldRefreshAccessToken(accessToken)) {
    authDebug("getToken access token needs refresh; delegating to handleTokenRefresh", {
      accessToken,
    });
    return handleTokenRefresh();
  }
  authDebug("getToken returning existing access token", { accessToken });
  return accessToken;
}

export async function triggerRefresh(): Promise<string> {
  authDebug("triggerRefresh called; clearing cached access token");
  await clearAccessToken();
  authDebug("triggerRefresh invoking handleTokenRefresh");
  return handleTokenRefresh();
}

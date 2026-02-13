import {
  getAccessToken,
  getRefreshToken,
  storeTokens,
  clearAccessToken,
  clearTokens,
} from "./auth";
import { shouldRefreshAccessToken } from "shared/jwt";
import { refreshTokens } from "./api";

const TOKEN_REFRESH_TIMEOUT_MS = 80_000;
const TOKEN_REFRESH_MAX_ATTEMPTS = 3;

async function refreshWithRetry(refreshToken: string) {
  for (let attempt = 1; attempt <= TOKEN_REFRESH_MAX_ATTEMPTS; attempt++) {
    const backoffMs = Math.min(500 * 2 ** (attempt - 1), 2000);
    let timeoutId: ReturnType<typeof setTimeout>;
    try {
      return await Promise.race([
        refreshTokens(refreshToken),
        new Promise<never>((_, reject) => {
          timeoutId = setTimeout(
            () => reject(new Error("Token refresh timed out")),
            TOKEN_REFRESH_TIMEOUT_MS,
          );
        }),
      ]);
    } catch (error) {
      const isTimeout =
        error instanceof Error && error.message === "Token refresh timed out";
      if (isTimeout) throw error;

      const status = (error as { status?: number }).status;
      const isRetryable =
        !status || status >= 500 || error instanceof TypeError;
      if (isRetryable && attempt < TOKEN_REFRESH_MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, backoffMs));
        continue;
      }
      throw error;
    } finally {
      clearTimeout(timeoutId!);
    }
  }
  throw new Error("Token refresh failed after retries");
}

let refreshPromise: Promise<string> | null = null;

async function doTokenRefresh(): Promise<string> {
  const current = getAccessToken();
  if (current && !shouldRefreshAccessToken(current)) return current;

  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    clearTokens();
    throw new Error("No refresh token available");
  }

  const tokens = await refreshWithRetry(refreshToken);
  storeTokens(tokens.access_token, tokens.refresh_token);
  return tokens.access_token;
}

function handleTokenRefresh(): Promise<string> {
  if (refreshPromise) return refreshPromise;

  // a single refresh token must never be used twice, lock across tabs
  const innerPromise =
    typeof navigator.locks?.request === "function"
      ? navigator.locks
          .request("rf-token-refresh", doTokenRefresh)
          .then((t) => t)
      : doTokenRefresh();

  const promise = innerPromise
    .catch((error: unknown) => {
      const status = (error as { status?: number }).status;
      if (status === 401) {
        clearTokens();
        throw new Error("Session expired");
      }
      throw error;
    })
    .finally(() => {
      refreshPromise = null;
    });

  refreshPromise = promise;
  return promise;
}

export async function getToken(): Promise<string> {
  const accessToken = getAccessToken();
  if (!accessToken) {
    if (!getRefreshToken()) throw new Error("Not authenticated");
    return handleTokenRefresh();
  }
  if (shouldRefreshAccessToken(accessToken)) return handleTokenRefresh();
  return accessToken;
}

export function triggerRefresh(): Promise<string> {
  clearAccessToken();
  return handleTokenRefresh();
}

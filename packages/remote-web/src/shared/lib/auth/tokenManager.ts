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
  const current = await getAccessToken();
  if (current && !shouldRefreshAccessToken(current)) return current;

  const refreshToken = await getRefreshToken();
  if (!refreshToken) {
    await clearTokens();
    throw new Error("No refresh token available");
  }

  const tokens = await refreshWithRetry(refreshToken);
  await storeTokens(tokens.access_token, tokens.refresh_token);
  return tokens.access_token;
}

function handleTokenRefresh(): Promise<string> {
  if (refreshPromise) return refreshPromise;

  const innerPromise =
    typeof navigator.locks?.request === "function"
      ? navigator.locks
          .request("rf-token-refresh", doTokenRefresh)
          .then((t) => t)
      : doTokenRefresh();

  const promise = innerPromise
    .catch(async (error: unknown) => {
      await clearTokens();

      const status = (error as { status?: number }).status;
      if (status === 401) {
        throw new Error("Session expired. Please sign in again.");
      }

      throw new Error("Session refresh failed. Please sign in again.");
    })
    .finally(() => {
      refreshPromise = null;
    });

  refreshPromise = promise;
  return promise;
}

export async function getToken(): Promise<string> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    if (!(await getRefreshToken())) throw new Error("Not authenticated");
    return handleTokenRefresh();
  }
  if (shouldRefreshAccessToken(accessToken)) return handleTokenRefresh();
  return accessToken;
}

export async function triggerRefresh(): Promise<string> {
  await clearAccessToken();
  return handleTokenRefresh();
}

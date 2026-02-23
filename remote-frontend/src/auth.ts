// Auth token storage utilities using localStorage for persistent sessions

const ACCESS_TOKEN_KEY = "rf_access_token";
const REFRESH_TOKEN_KEY = "rf_refresh_token";
const LOGIN_PATH = "/account";

export function storeTokens(accessToken: string, refreshToken: string): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function clearAccessToken(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
}

export function clearTokens(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

export function isLoggedIn(): boolean {
  return getAccessToken() !== null && getRefreshToken() !== null;
}

export function currentRelativePath(): string {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

export function sanitizeNextPath(
  next: string | null | undefined,
): string | null {
  if (!next) return null;
  if (!next.startsWith("/")) return null;
  if (next.startsWith("//")) return null;
  return next;
}

export function buildLoginUrl(next?: string | null): string {
  const url = new URL(LOGIN_PATH, window.location.origin);
  const safeNext = sanitizeNextPath(next);
  if (safeNext && safeNext !== LOGIN_PATH && safeNext !== "/account/complete") {
    url.searchParams.set("next", safeNext);
  }
  return `${url.pathname}${url.search}`;
}

export function redirectToLogin(next?: string | null): void {
  window.location.assign(buildLoginUrl(next));
}

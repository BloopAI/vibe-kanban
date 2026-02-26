import type { RelaySessionAuthCodeResponse } from 'shared/remote-types';
import { getAuthRuntime } from '@/shared/lib/auth/runtime';

const BUILD_TIME_API_BASE = import.meta.env.VITE_VK_SHARED_API_BASE || '';
const BUILD_TIME_RELAY_API_BASE = import.meta.env.VITE_RELAY_API_BASE_URL || '';
const USE_REMOTE_API_BASE_FALLBACK = !BUILD_TIME_RELAY_API_BASE;

let _relayApiBase: string = BUILD_TIME_RELAY_API_BASE || BUILD_TIME_API_BASE;

export function setRelayApiBase(base: string | null | undefined) {
  if (base) {
    _relayApiBase = base;
  }
}

export function getRelayApiUrl(): string {
  return _relayApiBase;
}

export function syncRelayApiBaseWithRemote(base: string | null | undefined) {
  if (USE_REMOTE_API_BASE_FALLBACK) {
    setRelayApiBase(base);
  }
}

export async function createRelaySessionAuthCode(
  sessionId: string
): Promise<RelaySessionAuthCodeResponse> {
  const response = await makeAuthenticatedRequest(
    getRelayApiUrl(),
    `/v1/relay/sessions/${sessionId}/auth-code`,
    { method: 'POST' }
  );
  if (!response.ok) {
    throw await parseErrorResponse(
      response,
      'Failed to create relay session auth code'
    );
  }

  return (await response.json()) as RelaySessionAuthCodeResponse;
}

async function makeAuthenticatedRequest(
  baseUrl: string,
  path: string,
  options: RequestInit = {},
  retryOn401 = true
): Promise<Response> {
  const authRuntime = getAuthRuntime();
  const token = await authRuntime.getToken();
  if (!token) {
    throw new Error('Not authenticated');
  }

  const headers = new Headers(options.headers ?? {});
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  headers.set('Authorization', `Bearer ${token}`);
  headers.set('X-Client-Version', __APP_VERSION__);
  headers.set('X-Client-Type', 'frontend');

  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (response.status === 401 && retryOn401) {
    const newToken = await authRuntime.triggerRefresh();
    if (newToken) {
      headers.set('Authorization', `Bearer ${newToken}`);
      return fetch(`${baseUrl}${path}`, {
        ...options,
        headers,
        credentials: 'include',
      });
    }

    throw new Error('Session expired. Please log in again.');
  }

  return response;
}

async function parseErrorResponse(
  response: Response,
  fallbackMessage: string
): Promise<Error> {
  try {
    const body = await response.json();
    const message = body.error || body.message || fallbackMessage;
    return new Error(`${message} (${response.status} ${response.statusText})`);
  } catch {
    return new Error(
      `${fallbackMessage} (${response.status} ${response.statusText})`
    );
  }
}

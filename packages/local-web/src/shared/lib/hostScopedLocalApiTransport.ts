import { toPathAndQuery } from '@/shared/lib/localApiTransport';

const HOSTS_SEGMENT = 'hosts';

const HOST_RUNTIME_API_PREFIXES = [
  '/api/sessions',
  '/api/workspaces',
  '/api/execution-processes',
  '/api/filesystem',
  '/api/repos',
  '/api/images',
  '/api/approvals',
  '/api/search',
  '/api/terminal',
  '/api/scratch',
  '/api/agents/discovered-options/ws',
  '/api/agents/preset-options',
] as const;

function resolveRouteHostId(): string | null {
  const segments = window.location.pathname.split('/').filter(Boolean);
  const hostsIndex = segments.indexOf(HOSTS_SEGMENT);
  if (hostsIndex === -1) {
    return null;
  }
  return segments[hostsIndex + 1] ?? null;
}

function isApiPrefixMatch(pathAndQuery: string, prefix: string): boolean {
  return (
    pathAndQuery === prefix ||
    pathAndQuery.startsWith(`${prefix}/`) ||
    pathAndQuery.startsWith(`${prefix}?`)
  );
}

function shouldProxyHostRuntimePath(pathAndQuery: string): boolean {
  if (!pathAndQuery.startsWith('/api/')) {
    return false;
  }

  if (pathAndQuery.startsWith('/api/host/')) {
    return false;
  }

  return HOST_RUNTIME_API_PREFIXES.some((prefix) =>
    isApiPrefixMatch(pathAndQuery, prefix)
  );
}

function toHostRuntimePath(pathAndQuery: string, hostId: string): string {
  if (!pathAndQuery.startsWith('/api/')) {
    return pathAndQuery;
  }

  const suffix = pathAndQuery.slice('/api'.length);
  return `/api/host/${hostId}${suffix}`;
}

function toAbsoluteWsUrl(pathOrUrl: string): string {
  if (/^wss?:\/\//i.test(pathOrUrl)) {
    return pathOrUrl;
  }

  if (/^https?:\/\//i.test(pathOrUrl)) {
    return pathOrUrl.replace(/^http/i, 'ws');
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const normalizedPath = pathOrUrl.startsWith('/')
    ? pathOrUrl
    : `/${pathOrUrl}`;
  return `${protocol}//${window.location.host}${normalizedPath}`;
}

export async function requestViaHostScopedLocalApi(
  pathOrUrl: string,
  requestInit: RequestInit = {}
): Promise<Response> {
  const hostId = resolveRouteHostId();
  if (!hostId) {
    return fetch(pathOrUrl, requestInit);
  }

  const pathAndQuery = toPathAndQuery(pathOrUrl);
  if (!shouldProxyHostRuntimePath(pathAndQuery)) {
    return fetch(pathOrUrl, requestInit);
  }

  return fetch(toHostRuntimePath(pathAndQuery, hostId), requestInit);
}

export async function openWebSocketViaHostScopedLocalApi(
  pathOrUrl: string
): Promise<WebSocket> {
  const hostId = resolveRouteHostId();
  if (!hostId) {
    return new WebSocket(toAbsoluteWsUrl(pathOrUrl));
  }

  const pathAndQuery = toPathAndQuery(pathOrUrl);
  if (!shouldProxyHostRuntimePath(pathAndQuery)) {
    return new WebSocket(toAbsoluteWsUrl(pathOrUrl));
  }

  const hostPath = toHostRuntimePath(pathAndQuery, hostId);
  return new WebSocket(toAbsoluteWsUrl(hostPath));
}

import { getCurrentHostId } from '@/shared/providers/HostIdProvider';

export interface LocalApiTransport {
  request: (pathOrUrl: string, init?: RequestInit) => Promise<Response>;
  openWebSocket: (pathOrUrl: string) => Promise<WebSocket> | WebSocket;
}

const LOCAL_ONLY_API_PREFIXES = ['/api/open-remote-editor/'];

function isAbsoluteUrl(pathOrUrl: string): boolean {
  return /^https?:\/\//i.test(pathOrUrl) || /^wss?:\/\//i.test(pathOrUrl);
}

function toPathAndQuery(pathOrUrl: string): string {
  if (isAbsoluteUrl(pathOrUrl)) {
    const url = new URL(pathOrUrl);
    return `${url.pathname}${url.search}`;
  }
  return pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
}

function toAbsoluteWsUrl(pathOrUrl: string): string {
  if (/^wss?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl.replace(/^http/i, 'ws');

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const path = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
  return `${protocol}//${window.location.host}${path}`;
}

/** Prefix `/api/…` paths with `/api/host/{hostId}` when a host is active. */
function applyHostScope(pathOrUrl: string): string {
  const hostId = getCurrentHostId();
  if (!hostId) return pathOrUrl;

  const path = toPathAndQuery(pathOrUrl);
  // These endpoints must always hit the local backend because they rely on
  // local-only credentials/state.
  if (LOCAL_ONLY_API_PREFIXES.some((prefix) => path.startsWith(prefix))) {
    return pathOrUrl;
  }

  if (!path.startsWith('/api/') || path.startsWith('/api/host/'))
    return pathOrUrl;

  const suffix = path.slice('/api'.length);
  return `/api/host/${hostId}${suffix}`;
}

const defaultTransport: LocalApiTransport = {
  request: (pathOrUrl, init = {}) => fetch(pathOrUrl, init),
  openWebSocket: (pathOrUrl) => new WebSocket(toAbsoluteWsUrl(pathOrUrl)),
};

let transport: LocalApiTransport = defaultTransport;

export function setLocalApiTransport(nextTransport: LocalApiTransport | null) {
  transport = nextTransport ?? defaultTransport;
}

export async function makeLocalApiRequest(
  pathOrUrl: string,
  init: RequestInit = {}
): Promise<Response> {
  return transport.request(applyHostScope(pathOrUrl), init);
}

export async function openLocalApiWebSocket(
  pathOrUrl: string
): Promise<WebSocket> {
  return transport.openWebSocket(applyHostScope(pathOrUrl));
}

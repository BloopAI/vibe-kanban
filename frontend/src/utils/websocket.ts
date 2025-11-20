import { Options } from 'react-use-websocket';

export const DEFAULT_WEBSOCKET_OPTIONS: Options = {
  share: true,
  shouldReconnect: () => true,
  reconnectInterval: (attempt) => Math.min(8000, 1000 * Math.pow(2, attempt)),
  retryOnError: true,
};

export function toWsUrl(endpoint?: string | null): string | null {
  if (!endpoint) return null;
  try {
    // If it's a full URL, replace protocol
    if (endpoint.startsWith('http')) {
      const url = new URL(endpoint);
      url.protocol = url.protocol.replace('http', 'ws');
      return url.toString();
    }
    // If it's a relative path, construct it using window.location
    if (endpoint.startsWith('/')) {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${protocol}//${window.location.host}${endpoint}`;
    }
    return endpoint;
  } catch {
    return null;
  }
}

const DEFAULT_SHAPE_HOST = 'http://localhost:5133';
const DEFAULT_SHAPE_PATH = '/v1/shape';

const cleanUrl = (value?: string | null) => {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol === 'ws:') {
      url.protocol = 'http:';
    } else if (url.protocol === 'wss:') {
      url.protocol = 'https:';
    }
    url.pathname = DEFAULT_SHAPE_PATH;
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return undefined;
  }
};

const defaultHostFallback = import.meta.env.DEV
  ? '/electric-shape'
  : `${DEFAULT_SHAPE_HOST}${DEFAULT_SHAPE_PATH}`;

const resolvedShapeUrl =
  import.meta.env.VITE_ELECTRIC_SHAPE_URL ||
  cleanUrl(import.meta.env.VITE_ELECTRIC_SERVICE_URL) ||
  defaultHostFallback;

const normalizeToAbsolute = (value: string) => {
  if (value.startsWith('/')) {
    if (typeof window !== 'undefined' && window.location) {
      return `${window.location.origin}${value}`;
    }
    return `http://localhost${value}`;
  }
  return value;
};

const resolvedHeaders = (() => {
  const token = import.meta.env.VITE_ELECTRIC_SERVICE_TOKEN;
  if (!token) return undefined;
  return {
    Authorization: `Bearer ${token}`,
  } as Record<string, string>;
})();

export const electricShapeUrl = normalizeToAbsolute(resolvedShapeUrl);
export const electricShapeHeaders = resolvedHeaders;

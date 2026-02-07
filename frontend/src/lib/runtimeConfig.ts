type RuntimeConfig = {
  sharedApiBase?: string;
};

function readRuntimeConfig(): RuntimeConfig | undefined {
  if (typeof window === 'undefined') return undefined;

  const config = window.__VK_CONFIG__;
  if (!config || typeof config !== 'object') return undefined;

  return config;
}

export function getRemoteApiBaseUrl(): string {
  const config = readRuntimeConfig();

  if (config && Object.prototype.hasOwnProperty.call(config, 'sharedApiBase')) {
    return config.sharedApiBase ?? '';
  }

  return import.meta.env.VITE_VK_SHARED_API_BASE || '';
}

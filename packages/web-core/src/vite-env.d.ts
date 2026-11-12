/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_VK_SHARED_API_BASE?: string;
  readonly VITE_RELAY_API_BASE_URL?: string;
  readonly VITE_POSTHOG_API_KEY?: string;
  readonly VITE_POSTHOG_API_ENDPOINT?: string;
  readonly VITE_SENTRY_DSN?: string;
}

declare const __APP_VERSION__: string;

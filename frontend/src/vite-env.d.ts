/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

interface Window {
  __VK_CONFIG__?: {
    sharedApiBase?: string;
  };
}

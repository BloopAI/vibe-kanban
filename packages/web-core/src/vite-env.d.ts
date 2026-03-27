/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_VK_SHARED_API_BASE?: string;
  readonly VITE_RELAY_API_BASE_URL?: string;
}

declare const __APP_VERSION__: string;

declare module '*?worker&url' {
  const url: string;
  export default url;
}

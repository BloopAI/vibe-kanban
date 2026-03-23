// vite.config.ts
import { sentryVitePlugin } from "@sentry/vite-plugin";
import { createLogger, defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import path from "path";
import pkg from "./package.json";

function createFilteredLogger() {
  const logger = createLogger();
  const originalError = logger.error.bind(logger);

  let lastRestartLog = 0;
  const DEBOUNCE_MS = 2000;

  logger.error = (msg, options) => {
    const isProxyError =
      msg.includes("ws proxy socket error") ||
      msg.includes("ws proxy error:") ||
      msg.includes("http proxy error:");

    if (isProxyError) {
      const now = Date.now();
      if (now - lastRestartLog > DEBOUNCE_MS) {
        logger.warn("Proxy connection closed, auto-reconnecting...");
        lastRestartLog = now;
      }
      return;
    }
    originalError(msg, options);
  };

  return logger;
}

export default defineConfig({
  customLogger: createFilteredLogger(),
  publicDir: path.resolve(__dirname, '../public'),
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    tanstackRouter({
      target: "react",
      autoCodeSplitting: false,
    }),
    react({
      babel: {
        plugins: [
          [
            'babel-plugin-react-compiler',
            {
              target: '18',
              sources: [
                path.resolve(__dirname, 'src'),
                path.resolve(__dirname, '../web-core/src'),
              ],
              environment: {
                enableResetCacheOnSourceFileChanges: true,
              },
            },
          ],
        ],
      },
    }),
    sentryVitePlugin({ org: 'bloop-ai', project: 'vibe-kanban' }),
  ],
  resolve: {
    alias: [
      {
        find: '@web',
        replacement: path.resolve(__dirname, 'src'),
      },
      {
        find: /^@\//,
        replacement: `${path.resolve(__dirname, '../web-core/src')}/`,
      },
      {
        find: 'shared',
        replacement: path.resolve(__dirname, '../../shared'),
      },
    ],
  },
  server: {
    port: parseInt(process.env.FRONTEND_PORT || '3000'),
    proxy: {
      '/api': {
        target: `http://localhost:${process.env.BACKEND_PORT || '3001'}`,
        changeOrigin: true,
        ws: true,
      },
    },
    fs: {
      allow: [path.resolve(__dirname, '.'), path.resolve(__dirname, '../..')],
    },
    open: process.env.VITE_OPEN === 'true',
    allowedHosts: [
      '.trycloudflare.com', // allow all cloudflared tunnels
    ],
  },
  optimizeDeps: {
    exclude: ['wa-sqlite'],
  },
  build: { sourcemap: true },
});

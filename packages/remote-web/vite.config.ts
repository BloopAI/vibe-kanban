import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import pkg from "./package.json";

export default defineConfig({
  publicDir: path.resolve(__dirname, "../public"),
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
            "babel-plugin-react-compiler",
            {
              target: "18",
              sources: [
                path.resolve(__dirname, "src"),
                path.resolve(__dirname, "../web-core/src"),
              ],
              environment: {
                enableResetCacheOnSourceFileChanges: true,
              },
            },
          ],
        ],
      },
    }),
  ],
  resolve: {
    alias: [
      {
        find: "@remote",
        replacement: path.resolve(__dirname, "src"),
      },
      {
        find: /^@\//,
        replacement: `${path.resolve(__dirname, "../web-core/src")}/`,
      },
      {
        find: "shared",
        replacement: path.resolve(__dirname, "../../shared"),
      },
    ],
  },
  server: {
    port: 3002,
    allowedHosts: [
      ".trycloudflare.com", // allow all cloudflared tunnels
    ],
    fs: {
      allow: [path.resolve(__dirname, "."), path.resolve(__dirname, "../..")],
    },
  },
});

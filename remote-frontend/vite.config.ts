import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3002,
    allowedHosts: true,
    proxy: {
      "/api/review": {
        target: "https://vibe-kanban-reviews.vibekanban.workers.dev",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/review/, "/review"),
      },
    },
  },
});

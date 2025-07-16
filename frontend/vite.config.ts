import { sentryVitePlugin } from "@sentry/vite-plugin";
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react(), sentryVitePlugin({
    org: "bloop-ai",
    project: "vibe-kanban"
  })],

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "shared": path.resolve(__dirname, "../shared"),
    },
  },

  server: {
    port: parseInt(process.env.FRONTEND_PORT || '3000'),
    proxy: {
      '/api': {
        target: `http://localhost:${process.env.BACKEND_PORT || '3001'}`,
        changeOrigin: true,
      },
    },
  },

  build: {
    // Tauri expects a relative base path
    target: process.env.TAURI_PLATFORM === 'windows' ? 'chrome105' : 'safari13',
    minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
    sourcemap: process.env.TAURI_DEBUG ? true : 'hidden',
  },

  // prevent vite from obscuring rust errors
  clearScreen: false,
  
  // Env variables starting with the item of `envPrefix` will be exposed in vite's frontend code. 
  envPrefix: ['VITE_', 'TAURI_'],
})

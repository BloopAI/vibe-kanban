// vite.config.ts
import { sentryVitePlugin } from "file:///private/var/folders/v2/8cnj633d15l3ckfh4445tk5h0000gn/T/vibe-kanban/worktrees/bf91-add-check-for-ch/vibe-kanban/node_modules/.pnpm/@sentry+vite-plugin@3.5.0/node_modules/@sentry/vite-plugin/dist/esm/index.mjs";
import { defineConfig } from "file:///private/var/folders/v2/8cnj633d15l3ckfh4445tk5h0000gn/T/vibe-kanban/worktrees/bf91-add-check-for-ch/vibe-kanban/node_modules/.pnpm/vite@5.4.19_@types+node@24.10.1/node_modules/vite/dist/node/index.js";
import react from "file:///private/var/folders/v2/8cnj633d15l3ckfh4445tk5h0000gn/T/vibe-kanban/worktrees/bf91-add-check-for-ch/vibe-kanban/node_modules/.pnpm/@vitejs+plugin-react@4.5.2_vite@5.4.19_@types+node@24.10.1_/node_modules/@vitejs/plugin-react/dist/index.mjs";
import path from "path";
import fs from "fs";
var __vite_injected_original_dirname = "/private/var/folders/v2/8cnj633d15l3ckfh4445tk5h0000gn/T/vibe-kanban/worktrees/bf91-add-check-for-ch/vibe-kanban/frontend";
function executorSchemasPlugin() {
  const VIRTUAL_ID = "virtual:executor-schemas";
  const RESOLVED_VIRTUAL_ID = "\0" + VIRTUAL_ID;
  return {
    name: "executor-schemas-plugin",
    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_VIRTUAL_ID;
      return null;
    },
    load(id) {
      if (id !== RESOLVED_VIRTUAL_ID) return null;
      const schemasDir = path.resolve(__vite_injected_original_dirname, "../shared/schemas");
      const files = fs.existsSync(schemasDir) ? fs.readdirSync(schemasDir).filter((f) => f.endsWith(".json")) : [];
      const imports = [];
      const entries = [];
      files.forEach((file, i) => {
        const varName = `__schema_${i}`;
        const importPath = `shared/schemas/${file}`;
        const key = file.replace(/\.json$/, "").toUpperCase();
        imports.push(`import ${varName} from "${importPath}";`);
        entries.push(`  "${key}": ${varName}`);
      });
      const code = `
${imports.join("\n")}

export const schemas = {
${entries.join(",\n")}
};

export default schemas;
`;
      return code;
    }
  };
}
var vite_config_default = defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [
          [
            "babel-plugin-react-compiler",
            {
              target: "18",
              sources: [path.resolve(__vite_injected_original_dirname, "src")],
              environment: {
                enableResetCacheOnSourceFileChanges: true
              }
            }
          ]
        ]
      }
    }),
    sentryVitePlugin({ org: "bloop-ai", project: "vibe-kanban" }),
    executorSchemasPlugin()
  ],
  resolve: {
    alias: {
      "@": path.resolve(__vite_injected_original_dirname, "./src"),
      shared: path.resolve(__vite_injected_original_dirname, "../shared")
    }
  },
  server: {
    port: parseInt(process.env.FRONTEND_PORT || "3000"),
    proxy: {
      "/api": {
        target: `http://localhost:${process.env.BACKEND_PORT || "3001"}`,
        changeOrigin: true,
        ws: true
      }
    },
    fs: {
      allow: [path.resolve(__vite_injected_original_dirname, "."), path.resolve(__vite_injected_original_dirname, "..")]
    },
    open: process.env.VITE_OPEN === "true",
    allowedHosts: [
      ".trycloudflare.com"
      // allow all cloudflared tunnels
    ]
  },
  optimizeDeps: {
    exclude: ["wa-sqlite"]
  },
  build: { sourcemap: true }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvcHJpdmF0ZS92YXIvZm9sZGVycy92Mi84Y25qNjMzZDE1bDNja2ZoNDQ0NXRrNWgwMDAwZ24vVC92aWJlLWthbmJhbi93b3JrdHJlZXMvYmY5MS1hZGQtY2hlY2stZm9yLWNoL3ZpYmUta2FuYmFuL2Zyb250ZW5kXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCIvcHJpdmF0ZS92YXIvZm9sZGVycy92Mi84Y25qNjMzZDE1bDNja2ZoNDQ0NXRrNWgwMDAwZ24vVC92aWJlLWthbmJhbi93b3JrdHJlZXMvYmY5MS1hZGQtY2hlY2stZm9yLWNoL3ZpYmUta2FuYmFuL2Zyb250ZW5kL3ZpdGUuY29uZmlnLnRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9wcml2YXRlL3Zhci9mb2xkZXJzL3YyLzhjbmo2MzNkMTVsM2NrZmg0NDQ1dGs1aDAwMDBnbi9UL3ZpYmUta2FuYmFuL3dvcmt0cmVlcy9iZjkxLWFkZC1jaGVjay1mb3ItY2gvdmliZS1rYW5iYW4vZnJvbnRlbmQvdml0ZS5jb25maWcudHNcIjsvLyB2aXRlLmNvbmZpZy50c1xuaW1wb3J0IHsgc2VudHJ5Vml0ZVBsdWdpbiB9IGZyb20gXCJAc2VudHJ5L3ZpdGUtcGx1Z2luXCI7XG5pbXBvcnQgeyBkZWZpbmVDb25maWcsIFBsdWdpbiB9IGZyb20gXCJ2aXRlXCI7XG5pbXBvcnQgcmVhY3QgZnJvbSBcIkB2aXRlanMvcGx1Z2luLXJlYWN0XCI7XG5pbXBvcnQgcGF0aCBmcm9tIFwicGF0aFwiO1xuaW1wb3J0IGZzIGZyb20gXCJmc1wiO1xuXG5mdW5jdGlvbiBleGVjdXRvclNjaGVtYXNQbHVnaW4oKTogUGx1Z2luIHtcbiAgY29uc3QgVklSVFVBTF9JRCA9IFwidmlydHVhbDpleGVjdXRvci1zY2hlbWFzXCI7XG4gIGNvbnN0IFJFU09MVkVEX1ZJUlRVQUxfSUQgPSBcIlxcMFwiICsgVklSVFVBTF9JRDtcblxuICByZXR1cm4ge1xuICAgIG5hbWU6IFwiZXhlY3V0b3Itc2NoZW1hcy1wbHVnaW5cIixcbiAgICByZXNvbHZlSWQoaWQpIHtcbiAgICAgIGlmIChpZCA9PT0gVklSVFVBTF9JRCkgcmV0dXJuIFJFU09MVkVEX1ZJUlRVQUxfSUQ7IC8vIGtlZXAgaXQgdmlydHVhbFxuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfSxcbiAgICBsb2FkKGlkKSB7XG4gICAgICBpZiAoaWQgIT09IFJFU09MVkVEX1ZJUlRVQUxfSUQpIHJldHVybiBudWxsO1xuXG4gICAgICBjb25zdCBzY2hlbWFzRGlyID0gcGF0aC5yZXNvbHZlKF9fZGlybmFtZSwgXCIuLi9zaGFyZWQvc2NoZW1hc1wiKTtcbiAgICAgIGNvbnN0IGZpbGVzID0gZnMuZXhpc3RzU3luYyhzY2hlbWFzRGlyKVxuICAgICAgICA/IGZzLnJlYWRkaXJTeW5jKHNjaGVtYXNEaXIpLmZpbHRlcigoZikgPT4gZi5lbmRzV2l0aChcIi5qc29uXCIpKVxuICAgICAgICA6IFtdO1xuXG4gICAgICBjb25zdCBpbXBvcnRzOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgY29uc3QgZW50cmllczogc3RyaW5nW10gPSBbXTtcblxuICAgICAgZmlsZXMuZm9yRWFjaCgoZmlsZSwgaSkgPT4ge1xuICAgICAgICBjb25zdCB2YXJOYW1lID0gYF9fc2NoZW1hXyR7aX1gO1xuICAgICAgICBjb25zdCBpbXBvcnRQYXRoID0gYHNoYXJlZC9zY2hlbWFzLyR7ZmlsZX1gOyAvLyB1c2VzIHlvdXIgYWxpYXNcbiAgICAgICAgY29uc3Qga2V5ID0gZmlsZS5yZXBsYWNlKC9cXC5qc29uJC8sIFwiXCIpLnRvVXBwZXJDYXNlKCk7IC8vIGNsYXVkZV9jb2RlIC0+IENMQVVERV9DT0RFXG4gICAgICAgIGltcG9ydHMucHVzaChgaW1wb3J0ICR7dmFyTmFtZX0gZnJvbSBcIiR7aW1wb3J0UGF0aH1cIjtgKTtcbiAgICAgICAgZW50cmllcy5wdXNoKGAgIFwiJHtrZXl9XCI6ICR7dmFyTmFtZX1gKTtcbiAgICAgIH0pO1xuXG4gICAgICAvLyBJTVBPUlRBTlQ6IHB1cmUgSlMgKG5vIFRTIHR5cGVzKSwgYW5kIHF1b3RlIGtleXMuXG4gICAgICBjb25zdCBjb2RlID0gYFxuJHtpbXBvcnRzLmpvaW4oXCJcXG5cIil9XG5cbmV4cG9ydCBjb25zdCBzY2hlbWFzID0ge1xuJHtlbnRyaWVzLmpvaW4oXCIsXFxuXCIpfVxufTtcblxuZXhwb3J0IGRlZmF1bHQgc2NoZW1hcztcbmA7XG4gICAgICByZXR1cm4gY29kZTtcbiAgICB9LFxuICB9O1xufVxuXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb25maWcoe1xuICBwbHVnaW5zOiBbXG4gICAgcmVhY3Qoe1xuICAgICAgYmFiZWw6IHtcbiAgICAgICAgcGx1Z2luczogW1xuICAgICAgICAgIFtcbiAgICAgICAgICAgIFwiYmFiZWwtcGx1Z2luLXJlYWN0LWNvbXBpbGVyXCIsXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIHRhcmdldDogXCIxOFwiLFxuICAgICAgICAgICAgICBzb3VyY2VzOiBbcGF0aC5yZXNvbHZlKF9fZGlybmFtZSwgXCJzcmNcIildLFxuICAgICAgICAgICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICAgICAgICAgIGVuYWJsZVJlc2V0Q2FjaGVPblNvdXJjZUZpbGVDaGFuZ2VzOiB0cnVlLFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICBdLFxuICAgICAgICBdLFxuICAgICAgfSxcbiAgICB9KSxcbiAgICBzZW50cnlWaXRlUGx1Z2luKHsgb3JnOiBcImJsb29wLWFpXCIsIHByb2plY3Q6IFwidmliZS1rYW5iYW5cIiB9KSxcbiAgICBleGVjdXRvclNjaGVtYXNQbHVnaW4oKSxcbiAgXSxcbiAgcmVzb2x2ZToge1xuICAgIGFsaWFzOiB7XG4gICAgICBcIkBcIjogcGF0aC5yZXNvbHZlKF9fZGlybmFtZSwgXCIuL3NyY1wiKSxcbiAgICAgIHNoYXJlZDogcGF0aC5yZXNvbHZlKF9fZGlybmFtZSwgXCIuLi9zaGFyZWRcIiksXG4gICAgfSxcbiAgfSxcbiAgc2VydmVyOiB7XG4gICAgcG9ydDogcGFyc2VJbnQocHJvY2Vzcy5lbnYuRlJPTlRFTkRfUE9SVCB8fCBcIjMwMDBcIiksXG4gICAgcHJveHk6IHtcbiAgICAgIFwiL2FwaVwiOiB7XG4gICAgICAgIHRhcmdldDogYGh0dHA6Ly9sb2NhbGhvc3Q6JHtwcm9jZXNzLmVudi5CQUNLRU5EX1BPUlQgfHwgXCIzMDAxXCJ9YCxcbiAgICAgICAgY2hhbmdlT3JpZ2luOiB0cnVlLFxuICAgICAgICB3czogdHJ1ZSxcbiAgICAgIH1cbiAgICB9LFxuICAgIGZzOiB7XG4gICAgICBhbGxvdzogW3BhdGgucmVzb2x2ZShfX2Rpcm5hbWUsIFwiLlwiKSwgcGF0aC5yZXNvbHZlKF9fZGlybmFtZSwgXCIuLlwiKV0sXG4gICAgfSxcbiAgICBvcGVuOiBwcm9jZXNzLmVudi5WSVRFX09QRU4gPT09IFwidHJ1ZVwiLFxuICAgIGFsbG93ZWRIb3N0czogW1xuICAgICAgXCIudHJ5Y2xvdWRmbGFyZS5jb21cIiwgLy8gYWxsb3cgYWxsIGNsb3VkZmxhcmVkIHR1bm5lbHNcbiAgICBdLFxuICB9LFxuICBvcHRpbWl6ZURlcHM6IHtcbiAgICBleGNsdWRlOiBbXCJ3YS1zcWxpdGVcIl0sXG4gIH0sXG4gIGJ1aWxkOiB7IHNvdXJjZW1hcDogdHJ1ZSB9LFxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQ0EsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxvQkFBNEI7QUFDckMsT0FBTyxXQUFXO0FBQ2xCLE9BQU8sVUFBVTtBQUNqQixPQUFPLFFBQVE7QUFMZixJQUFNLG1DQUFtQztBQU96QyxTQUFTLHdCQUFnQztBQUN2QyxRQUFNLGFBQWE7QUFDbkIsUUFBTSxzQkFBc0IsT0FBTztBQUVu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

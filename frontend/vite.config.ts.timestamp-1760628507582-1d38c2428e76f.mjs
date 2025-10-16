// vite.config.ts
import { sentryVitePlugin } from "file:///Users/gabriel/work/vk/mission-control/node_modules/.pnpm/@sentry+vite-plugin@3.6.1/node_modules/@sentry/vite-plugin/dist/esm/index.mjs";
import { defineConfig } from "file:///Users/gabriel/work/vk/mission-control/node_modules/.pnpm/vite@5.4.20/node_modules/vite/dist/node/index.js";
import react from "file:///Users/gabriel/work/vk/mission-control/node_modules/.pnpm/@vitejs+plugin-react@4.7.0_vite@5.4.20/node_modules/@vitejs/plugin-react/dist/index.js";
import path from "path";
import fs from "fs";
var __vite_injected_original_dirname = "/Users/gabriel/work/vk/mission-control/frontend";
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
    react(),
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
    open: process.env.VITE_OPEN === "true"
  },
  build: { sourcemap: true }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvVXNlcnMvZ2FicmllbC93b3JrL3ZrL21pc3Npb24tY29udHJvbC9mcm9udGVuZFwiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiL1VzZXJzL2dhYnJpZWwvd29yay92ay9taXNzaW9uLWNvbnRyb2wvZnJvbnRlbmQvdml0ZS5jb25maWcudHNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL1VzZXJzL2dhYnJpZWwvd29yay92ay9taXNzaW9uLWNvbnRyb2wvZnJvbnRlbmQvdml0ZS5jb25maWcudHNcIjsvLyB2aXRlLmNvbmZpZy50c1xuaW1wb3J0IHsgc2VudHJ5Vml0ZVBsdWdpbiB9IGZyb20gXCJAc2VudHJ5L3ZpdGUtcGx1Z2luXCI7XG5pbXBvcnQgeyBkZWZpbmVDb25maWcsIFBsdWdpbiB9IGZyb20gXCJ2aXRlXCI7XG5pbXBvcnQgcmVhY3QgZnJvbSBcIkB2aXRlanMvcGx1Z2luLXJlYWN0XCI7XG5pbXBvcnQgcGF0aCBmcm9tIFwicGF0aFwiO1xuaW1wb3J0IGZzIGZyb20gXCJmc1wiO1xuXG5mdW5jdGlvbiBleGVjdXRvclNjaGVtYXNQbHVnaW4oKTogUGx1Z2luIHtcbiAgY29uc3QgVklSVFVBTF9JRCA9IFwidmlydHVhbDpleGVjdXRvci1zY2hlbWFzXCI7XG4gIGNvbnN0IFJFU09MVkVEX1ZJUlRVQUxfSUQgPSBcIlxcMFwiICsgVklSVFVBTF9JRDtcblxuICByZXR1cm4ge1xuICAgIG5hbWU6IFwiZXhlY3V0b3Itc2NoZW1hcy1wbHVnaW5cIixcbiAgICByZXNvbHZlSWQoaWQpIHtcbiAgICAgIGlmIChpZCA9PT0gVklSVFVBTF9JRCkgcmV0dXJuIFJFU09MVkVEX1ZJUlRVQUxfSUQ7IC8vIGtlZXAgaXQgdmlydHVhbFxuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfSxcbiAgICBsb2FkKGlkKSB7XG4gICAgICBpZiAoaWQgIT09IFJFU09MVkVEX1ZJUlRVQUxfSUQpIHJldHVybiBudWxsO1xuXG4gICAgICBjb25zdCBzY2hlbWFzRGlyID0gcGF0aC5yZXNvbHZlKF9fZGlybmFtZSwgXCIuLi9zaGFyZWQvc2NoZW1hc1wiKTtcbiAgICAgIGNvbnN0IGZpbGVzID0gZnMuZXhpc3RzU3luYyhzY2hlbWFzRGlyKVxuICAgICAgICA/IGZzLnJlYWRkaXJTeW5jKHNjaGVtYXNEaXIpLmZpbHRlcigoZikgPT4gZi5lbmRzV2l0aChcIi5qc29uXCIpKVxuICAgICAgICA6IFtdO1xuXG4gICAgICBjb25zdCBpbXBvcnRzOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgY29uc3QgZW50cmllczogc3RyaW5nW10gPSBbXTtcblxuICAgICAgZmlsZXMuZm9yRWFjaCgoZmlsZSwgaSkgPT4ge1xuICAgICAgICBjb25zdCB2YXJOYW1lID0gYF9fc2NoZW1hXyR7aX1gO1xuICAgICAgICBjb25zdCBpbXBvcnRQYXRoID0gYHNoYXJlZC9zY2hlbWFzLyR7ZmlsZX1gOyAvLyB1c2VzIHlvdXIgYWxpYXNcbiAgICAgICAgY29uc3Qga2V5ID0gZmlsZS5yZXBsYWNlKC9cXC5qc29uJC8sIFwiXCIpLnRvVXBwZXJDYXNlKCk7IC8vIGNsYXVkZV9jb2RlIC0+IENMQVVERV9DT0RFXG4gICAgICAgIGltcG9ydHMucHVzaChgaW1wb3J0ICR7dmFyTmFtZX0gZnJvbSBcIiR7aW1wb3J0UGF0aH1cIjtgKTtcbiAgICAgICAgZW50cmllcy5wdXNoKGAgIFwiJHtrZXl9XCI6ICR7dmFyTmFtZX1gKTtcbiAgICAgIH0pO1xuXG4gICAgICAvLyBJTVBPUlRBTlQ6IHB1cmUgSlMgKG5vIFRTIHR5cGVzKSwgYW5kIHF1b3RlIGtleXMuXG4gICAgICBjb25zdCBjb2RlID0gYFxuJHtpbXBvcnRzLmpvaW4oXCJcXG5cIil9XG5cbmV4cG9ydCBjb25zdCBzY2hlbWFzID0ge1xuJHtlbnRyaWVzLmpvaW4oXCIsXFxuXCIpfVxufTtcblxuZXhwb3J0IGRlZmF1bHQgc2NoZW1hcztcbmA7XG4gICAgICByZXR1cm4gY29kZTtcbiAgICB9LFxuICB9O1xufVxuXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb25maWcoe1xuICBwbHVnaW5zOiBbXG4gICAgcmVhY3QoKSxcbiAgICBzZW50cnlWaXRlUGx1Z2luKHsgb3JnOiBcImJsb29wLWFpXCIsIHByb2plY3Q6IFwidmliZS1rYW5iYW5cIiB9KSxcbiAgICBleGVjdXRvclNjaGVtYXNQbHVnaW4oKSxcbiAgXSxcbiAgcmVzb2x2ZToge1xuICAgIGFsaWFzOiB7XG4gICAgICBcIkBcIjogcGF0aC5yZXNvbHZlKF9fZGlybmFtZSwgXCIuL3NyY1wiKSxcbiAgICAgIHNoYXJlZDogcGF0aC5yZXNvbHZlKF9fZGlybmFtZSwgXCIuLi9zaGFyZWRcIiksXG4gICAgfSxcbiAgfSxcbiAgc2VydmVyOiB7XG4gICAgcG9ydDogcGFyc2VJbnQocHJvY2Vzcy5lbnYuRlJPTlRFTkRfUE9SVCB8fCBcIjMwMDBcIiksXG4gICAgcHJveHk6IHtcbiAgICAgIFwiL2FwaVwiOiB7XG4gICAgICAgIHRhcmdldDogYGh0dHA6Ly9sb2NhbGhvc3Q6JHtwcm9jZXNzLmVudi5CQUNLRU5EX1BPUlQgfHwgXCIzMDAxXCJ9YCxcbiAgICAgICAgY2hhbmdlT3JpZ2luOiB0cnVlLFxuICAgICAgICB3czogdHJ1ZSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBmczoge1xuICAgICAgYWxsb3c6IFtwYXRoLnJlc29sdmUoX19kaXJuYW1lLCBcIi5cIiksIHBhdGgucmVzb2x2ZShfX2Rpcm5hbWUsIFwiLi5cIildLFxuICAgIH0sXG4gICAgb3BlbjogcHJvY2Vzcy5lbnYuVklURV9PUEVOID09PSBcInRydWVcIixcbiAgfSxcbiAgYnVpbGQ6IHsgc291cmNlbWFwOiB0cnVlIH0sXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFDQSxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLG9CQUE0QjtBQUNyQyxPQUFPLFdBQVc7QUFDbEIsT0FBTyxVQUFVO0FBQ2pCLE9BQU8sUUFBUTtBQUxmLElBQU0sbUNBQW1DO0FBT3pDLFNBQVMsd0JBQWdDO0FBQ3ZDLFFBQU0sYUFBYTtBQUNuQixRQUFNLHNCQUFzQixPQUFPO0FBRW5DLFNBQU87QUFBQSxJQUNMLE1BQU07QUFBQSxJQUNOLFVBQVUsSUFBSTtBQUNaLFVBQUksT0FBTyxXQUFZLFFBQU87QUFDOUIsYUFBTztBQUFBLElBQ1Q7QUFBQSxJQUNBLEtBQUssSUFBSTtBQUNQLFVBQUksT0FBTyxvQkFBcUIsUUFBTztBQUV2QyxZQUFNLGFBQWEsS0FBSyxRQUFRLGtDQUFXLG1CQUFtQjtBQUM5RCxZQUFNLFFBQVEsR0FBRyxXQUFXLFVBQVUsSUFDbEMsR0FBRyxZQUFZLFVBQVUsRUFBRSxPQUFPLENBQUMsTUFBTSxFQUFFLFNBQVMsT0FBTyxDQUFDLElBQzVELENBQUM7QUFFTCxZQUFNLFVBQW9CLENBQUM7QUFDM0IsWUFBTSxVQUFvQixDQUFDO0FBRTNCLFlBQU0sUUFBUSxDQUFDLE1BQU0sTUFBTTtBQUN6QixjQUFNLFVBQVUsWUFBWSxDQUFDO0FBQzdCLGNBQU0sYUFBYSxrQkFBa0IsSUFBSTtBQUN6QyxjQUFNLE1BQU0sS0FBSyxRQUFRLFdBQVcsRUFBRSxFQUFFLFlBQVk7QUFDcEQsZ0JBQVEsS0FBSyxVQUFVLE9BQU8sVUFBVSxVQUFVLElBQUk7QUFDdEQsZ0JBQVEsS0FBSyxNQUFNLEdBQUcsTUFBTSxPQUFPLEVBQUU7QUFBQSxNQUN2QyxDQUFDO0FBR0QsWUFBTSxPQUFPO0FBQUEsRUFDakIsUUFBUSxLQUFLLElBQUksQ0FBQztBQUFBO0FBQUE7QUFBQSxFQUdsQixRQUFRLEtBQUssS0FBSyxDQUFDO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFLZixhQUFPO0FBQUEsSUFDVDtBQUFBLEVBQ0Y7QUFDRjtBQUVBLElBQU8sc0JBQVEsYUFBYTtBQUFBLEVBQzFCLFNBQVM7QUFBQSxJQUNQLE1BQU07QUFBQSxJQUNOLGlCQUFpQixFQUFFLEtBQUssWUFBWSxTQUFTLGNBQWMsQ0FBQztBQUFBLElBQzVELHNCQUFzQjtBQUFBLEVBQ3hCO0FBQUEsRUFDQSxTQUFTO0FBQUEsSUFDUCxPQUFPO0FBQUEsTUFDTCxLQUFLLEtBQUssUUFBUSxrQ0FBVyxPQUFPO0FBQUEsTUFDcEMsUUFBUSxLQUFLLFFBQVEsa0NBQVcsV0FBVztBQUFBLElBQzdDO0FBQUEsRUFDRjtBQUFBLEVBQ0EsUUFBUTtBQUFBLElBQ04sTUFBTSxTQUFTLFFBQVEsSUFBSSxpQkFBaUIsTUFBTTtBQUFBLElBQ2xELE9BQU87QUFBQSxNQUNMLFFBQVE7QUFBQSxRQUNOLFFBQVEsb0JBQW9CLFFBQVEsSUFBSSxnQkFBZ0IsTUFBTTtBQUFBLFFBQzlELGNBQWM7QUFBQSxRQUNkLElBQUk7QUFBQSxNQUNOO0FBQUEsSUFDRjtBQUFBLElBQ0EsSUFBSTtBQUFBLE1BQ0YsT0FBTyxDQUFDLEtBQUssUUFBUSxrQ0FBVyxHQUFHLEdBQUcsS0FBSyxRQUFRLGtDQUFXLElBQUksQ0FBQztBQUFBLElBQ3JFO0FBQUEsSUFDQSxNQUFNLFFBQVEsSUFBSSxjQUFjO0FBQUEsRUFDbEM7QUFBQSxFQUNBLE9BQU8sRUFBRSxXQUFXLEtBQUs7QUFDM0IsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K

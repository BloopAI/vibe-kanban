import fs from "fs";
import path from "path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import pkg from "./package.json";

function executorSchemasPlugin(): Plugin {
  const VIRTUAL_ID = "virtual:executor-schemas";
  const RESOLVED_VIRTUAL_ID = `\0${VIRTUAL_ID}`;

  return {
    name: "executor-schemas-plugin",
    resolveId(id) {
      if (id === VIRTUAL_ID) {
        return RESOLVED_VIRTUAL_ID;
      }
      return null;
    },
    load(id) {
      if (id !== RESOLVED_VIRTUAL_ID) {
        return null;
      }

      const schemasDir = path.resolve(__dirname, "../../shared/schemas");
      const files = fs.existsSync(schemasDir)
        ? fs.readdirSync(schemasDir).filter((file) => file.endsWith(".json"))
        : [];

      const imports: string[] = [];
      const entries: string[] = [];

      files.forEach((file, index) => {
        const varName = `__schema_${index}`;
        const importPath = `shared/schemas/${file}`;
        const key = file.replace(/\.json$/, "").toUpperCase();
        imports.push(`import ${varName} from "${importPath}";`);
        entries.push(`  "${key}": ${varName}`);
      });

      return `
${imports.join("\n")}

export const schemas = {
${entries.join(",\n")}
};

export default schemas;
`;
    },
  };
}

export default defineConfig({
  publicDir: path.resolve(__dirname, "../public"),
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
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
    executorSchemasPlugin(),
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
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;

          // Core React runtime — needed on every page
          if (id.includes("/react-dom/") || id.includes("/react/")) {
            return "vendor-react";
          }

          // Routing & data fetching — needed on every page
          if (
            id.includes("@tanstack/react-router") ||
            id.includes("@tanstack/react-query")
          ) {
            return "vendor-router";
          }

          // Diff viewer libraries — only needed for diff / code views
          if (
            id.includes("@pierre/diffs") ||
            id.includes("@git-diff-view")
          ) {
            return "vendor-diffs";
          }

          // Shiki core (engine, themes, transformers) — NOT individual lang
          // grammars which Vite already splits into their own async chunks.
          if (
            (id.includes("@shikijs/core") ||
              id.includes("@shikijs/engine") ||
              id.includes("@shikijs/themes") ||
              id.includes("@shikijs/transformers") ||
              id.includes("@shikijs/types") ||
              id.includes("@shikijs/vscode-textmate") ||
              id.includes("node_modules/shiki/")) &&
            !id.includes("@shikijs/langs/")
          ) {
            return "vendor-syntax";
          }

          // Rich-text / code editors — heavy, lazy-load with routes
          if (
            id.includes("@lexical") ||
            id.includes("lexical") ||
            id.includes("@codemirror") ||
            id.includes("@uiw/react-codemirror") ||
            id.includes("@lezer")
          ) {
            return "vendor-editor";
          }

          // Terminal emulator — only used in workspace views
          if (id.includes("@xterm")) {
            return "vendor-xterm";
          }

          // Form schema (rjsf + ajv) — only used in executor config
          if (id.includes("@rjsf") || id.includes("ajv")) {
            return "vendor-forms";
          }

          // Icons — large tree-shakeable packages
          if (
            id.includes("@phosphor-icons") ||
            id.includes("simple-icons") ||
            id.includes("lucide-react")
          ) {
            return "vendor-icons";
          }

          // Observability — analytics & error tracking
          if (id.includes("@sentry") || id.includes("posthog")) {
            return "vendor-observability";
          }
        },
      },
    },
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

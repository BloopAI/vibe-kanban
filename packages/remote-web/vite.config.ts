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

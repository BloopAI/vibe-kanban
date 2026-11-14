// Same aliases as the app's Vite config (packages/local-web/vite.config.ts), so
// `npx vitest run` can resolve `@/…` and `shared/…` imports.
const src = new URL('./src/', import.meta.url).pathname;
const shared = new URL('../../shared', import.meta.url).pathname;

export default {
  resolve: {
    alias: [
      { find: /^@\//, replacement: src },
      { find: /^shared\//, replacement: `${shared}/` },
    ],
  },
};

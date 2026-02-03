
## Task 1: Bippy Bundle Build

- **bippy@0.5.28** installed at workspace root with `pnpm add -Dw` (need `-w` flag for workspace root)
- `safelyInstallRDTHook()` guards with `isClientEnvironment()` — returns false in Node.js, true in browsers. Hook installs correctly in browser context.
- `installRDTHook()` is the direct version without env check, but `safelyInstallRDTHook()` is preferred for error safety.
- esbuild IIFE bundle with `globalName: 'VKBippy'` produces `var VKBippy = (() => { ... })()` pattern.
- Final bundle size: **20.0 KB** minified (well under 50KB limit). Includes bippy core + bippy/source + @jridgewell/sourcemap-codec.
- Both `bippy` and `bippy/source` export CJS and ESM; esbuild resolves everything cleanly.
- Temp entrypoint pattern: write a `.tmp.mjs` file, build it, delete it — avoids polluting the project.
- Output path: `crates/server/src/preview_proxy/bippy_bundle.js` — will be consumed via `include_str!()` in Rust.

/**
 * Build a vendored bippy IIFE bundle for injection into proxied HTML pages.
 *
 * Produces: crates/server/src/preview_proxy/bippy_bundle.js
 * Global:   window.VKBippy
 *
 * Usage: node scripts/build-bippy-bundle.mjs
 */

import { build } from 'esbuild';
import { writeFileSync, unlinkSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_FILE = join(
  ROOT,
  'crates/server/src/preview_proxy/bippy_bundle.js',
);

// Temporary entrypoint that imports bippy + bippy/source, installs the hook,
// and re-exports everything we need.
const ENTRY_CODE = `
import {
  getFiberFromHostInstance,
  getDisplayName,
  isCompositeFiber,
  traverseFiber,
  isInstrumentationActive,
  safelyInstallRDTHook,
} from 'bippy';

import {
  getOwnerStack,
  normalizeFileName,
  isSourceFile,
} from 'bippy/source';

// Install React DevTools hook immediately — must run before React initializes.
safelyInstallRDTHook();

export {
  getFiberFromHostInstance,
  getDisplayName,
  isCompositeFiber,
  traverseFiber,
  isInstrumentationActive,
  getOwnerStack,
  normalizeFileName,
  isSourceFile,
};
`;

const tmpEntry = join(ROOT, '_bippy_entry.tmp.mjs');

try {
  writeFileSync(tmpEntry, ENTRY_CODE, 'utf-8');

  const result = await build({
    entryPoints: [tmpEntry],
    bundle: true,
    format: 'iife',
    globalName: 'VKBippy',
    platform: 'browser',
    target: ['es2020'],
    minify: true,
    outfile: OUT_FILE,
    // Inline everything — no external dependencies
    external: [],
    logLevel: 'info',
    metafile: true,
  });

  // Report size
  const outBytes =
    result.metafile.outputs[Object.keys(result.metafile.outputs)[0]].bytes;
  const kb = (outBytes / 1024).toFixed(1);

  if (outBytes > 50 * 1024) {
    console.error(`\n❌ Bundle too large: ${kb} KB (limit: 50 KB)`);
    process.exit(1);
  }

  console.log(`\n✅ bippy bundle built: ${OUT_FILE} (${kb} KB)`);
} finally {
  try {
    unlinkSync(tmpEntry);
  } catch {
    // ignore cleanup errors
  }
}

#!/usr/bin/env node
/**
 * Checks for unused i18n translation keys.
 *
 * Scans the English locale JSON files and verifies that every leaf key is
 * referenced somewhere in the TypeScript/React source code.  Keys that are
 * only reachable via dynamic patterns (template-literal prefixes, i18next
 * pluralisation suffixes, or shortcut action lookups) are accepted as well.
 *
 * Usage:
 *   node scripts/check-unused-i18n-keys.mjs          # error on unused keys
 *   node scripts/check-unused-i18n-keys.mjs --list    # just print, exit 0
 */
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const localesDir = path.join(
  ROOT,
  'packages/web-core/src/i18n/locales/en',
);
const namespaces = ['common', 'settings', 'projects', 'tasks', 'organization'];
const srcDirs = [
  'packages/web-core/src',
  'packages/local-web/src',
  'packages/remote-web/src',
  'packages/ui/src',
].map((d) => path.join(ROOT, d));

const listOnly = process.argv.includes('--list');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function flattenKeys(obj, prefix = '') {
  let keys = [];
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'object' && value !== null) {
      keys = keys.concat(flattenKeys(value, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

/** Collect the concatenated contents of every .ts/.tsx file under `dirs`. */
function loadSourceContent(dirs) {
  let content = '';
  for (const dir of dirs) {
    try {
      const files = execSync(
        `find "${dir}" \\( -name "*.tsx" -o -name "*.ts" \\) ! -name "*.d.ts"`,
        { encoding: 'utf8' },
      )
        .trim()
        .split('\n')
        .filter(Boolean);
      for (const file of files) {
        content += fs.readFileSync(file, 'utf8') + '\n';
      }
    } catch {
      // directory might not exist
    }
  }
  return content;
}

function isStaticKeyUsed(key, ns, src) {
  if (
    src.includes(`'${key}'`) ||
    src.includes(`"${key}"`) ||
    src.includes(`\`${key}\``)
  )
    return true;

  const nsKey = `${ns}:${key}`;
  return src.includes(`'${nsKey}'`) || src.includes(`"${nsKey}"`);
}

function isDynamicallyUsed(key, ns, src) {
  const parts = key.split('.');

  // Check if any parent prefix is used in a dynamic pattern.
  for (let i = 1; i < parts.length; i++) {
    const prefix = parts.slice(0, i).join('.');
    const patterns = [
      `\`${prefix}.`,
      `'${prefix}.' +`,
      `"${prefix}." +`,
      `'${prefix}.' + `,
      `"${prefix}." + `,
      `${ns}:${prefix}.`,
    ];
    if (patterns.some((p) => src.includes(p))) return true;
  }

  // i18next pluralisation suffixes (_one, _other, _zero, _few, _many, _two)
  const pluralSuffixes = ['_one', '_other', '_zero', '_few', '_many', '_two'];
  for (const suffix of pluralSuffixes) {
    if (key.endsWith(suffix)) {
      const baseKey = key.slice(0, -suffix.length);
      if (
        src.includes(`'${baseKey}'`) ||
        src.includes(`"${baseKey}"`) ||
        src.includes(`\`${baseKey}\``) ||
        src.includes(`'${baseKey}',`) ||
        src.includes(`"${baseKey}",`)
      )
        return true;
    }
  }

  // Shortcut action keys are looked up by their action name.
  if (key.startsWith('shortcuts.actions.')) {
    const actionName = key.replace('shortcuts.actions.', '');
    if (src.includes(`'${actionName}'`) || src.includes(`"${actionName}"`))
      return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const src = loadSourceContent(srcDirs);
let totalUnused = 0;
const unusedByNs = {};

for (const ns of namespaces) {
  const filePath = path.join(localesDir, `${ns}.json`);
  if (!fs.existsSync(filePath)) continue;

  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const keys = flattenKeys(data);
  const unused = keys.filter(
    (k) => !isStaticKeyUsed(k, ns, src) && !isDynamicallyUsed(k, ns, src),
  );

  if (unused.length > 0) {
    unusedByNs[ns] = unused;
    totalUnused += unused.length;
  }
}

if (totalUnused === 0) {
  console.log('✅ No unused i18n keys found.');
  process.exit(0);
}

console.log(`❌ Found ${totalUnused} unused i18n key(s):\n`);
for (const [ns, keys] of Object.entries(unusedByNs)) {
  console.log(`  ${ns} (${keys.length}):`);
  for (const k of keys) {
    console.log(`    - ${k}`);
  }
  console.log();
}
console.log(
  'Remove unused keys from packages/web-core/src/i18n/locales/*/  files.',
);

process.exit(listOnly ? 0 : 1);

#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const EN_LOCALES_DIR = path.join(
  ROOT,
  'packages/web-core/src/i18n/locales/en',
);
const TARGET_ROOT = path.join(ROOT, 'packages/web-core/src/i18n/locales');

function printUsage() {
  console.log(`Usage:
  node scripts/create-locale.mjs --ui RU --code ru --name "Русский"

Required flags:
  --ui     UI enum value to add later (e.g. RU, DE, IT)
  --code   i18next locale code (e.g. ru, de, it)
  --name   Native display name / endonym
`);
}

function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    result[arg.slice(2)] = argv[i + 1];
    i += 1;
  }
  return result;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function toRustUiLanguageVariant(ui) {
  return ui
    .split('_')
    .filter(Boolean)
    .map((segment) => segment[0] + segment.slice(1).toLowerCase())
    .join('');
}

const args = parseArgs(process.argv.slice(2));
const ui = args.ui;
const code = args.code;
const name = args.name;

if (!ui || !code || !name) {
  printUsage();
  process.exit(1);
}

if (!fs.existsSync(EN_LOCALES_DIR)) {
  console.error(`English locale directory not found: ${EN_LOCALES_DIR}`);
  process.exit(1);
}

const targetDir = path.join(TARGET_ROOT, code);
if (fs.existsSync(targetDir)) {
  console.error(`Locale directory already exists: ${targetDir}`);
  process.exit(1);
}

ensureDir(targetDir);

const namespaceFiles = fs
  .readdirSync(EN_LOCALES_DIR)
  .filter((file) => file.endsWith('.json'))
  .sort();

for (const file of namespaceFiles) {
  const source = path.join(EN_LOCALES_DIR, file);
  const target = path.join(targetDir, file);
  fs.copyFileSync(source, target);
}

console.log(`Scaffolded locale '${code}' in ${targetDir}`);
console.log('');
console.log('Next steps:');
console.log(
  `1. Add UiLanguage::${toRustUiLanguageVariant(ui)} in crates/services/src/services/config/versions/v6.rs`,
);
console.log('2. Run: pnpm run generate-types');
console.log(
  `3. Register ${ui} -> ${code} and the endonym "${name}" in packages/web-core/src/i18n/languages.ts`,
);
console.log(
  `4. Register locale resources for "${code}" in packages/web-core/src/i18n/config.ts`,
);
console.log(`5. Translate files under packages/web-core/src/i18n/locales/${code}/`);
console.log(`6. Run: node scripts/check-locale-translation.mjs ${code}`);

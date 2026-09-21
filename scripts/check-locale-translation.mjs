#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const LOCALES_DIR = path.join(ROOT, 'packages/web-core/src/i18n/locales');
const SOURCE_DIR = path.join(LOCALES_DIR, 'en');
const namespaceFiles = ['common.json', 'settings.json', 'projects.json', 'tasks.json', 'organization.json'];

function usage() {
  console.log(`Usage:
  node scripts/check-locale-translation.mjs <locale-code> [--fail-on-identical]
`);
}

function flattenStrings(value, prefix = '') {
  if (typeof value === 'string') {
    return [[prefix, value]];
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return [];
  }

  return Object.entries(value).flatMap(([key, child]) =>
    flattenStrings(child, prefix ? `${prefix}.${key}` : key),
  );
}

function isProbablySafeToMatch(value) {
  if (!/[A-Za-z]/.test(value)) return false;
  if (/^https?:\/\//.test(value)) return false;
  if (/^[A-Z0-9 _./:+-]+$/.test(value)) return false;
  if (/^\{\{.+\}\}$/.test(value)) return false;
  return true;
}

const args = process.argv.slice(2);
const localeCode = args[0];
const failOnIdentical = args.includes('--fail-on-identical');

if (!localeCode || localeCode.startsWith('-')) {
  usage();
  process.exit(1);
}

if (localeCode === 'en') {
  console.error('Pass a translated locale code, not en.');
  process.exit(1);
}

const targetDir = path.join(LOCALES_DIR, localeCode);
if (!fs.existsSync(targetDir)) {
  console.error(`Locale directory not found: ${targetDir}`);
  process.exit(1);
}

let identicalCount = 0;
let reported = 0;
const REPORT_LIMIT = 100;

for (const file of namespaceFiles) {
  const sourcePath = path.join(SOURCE_DIR, file);
  const targetPath = path.join(targetDir, file);

  if (!fs.existsSync(targetPath)) {
    console.error(`Missing locale file: ${targetPath}`);
    process.exit(1);
  }

  const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
  const target = JSON.parse(fs.readFileSync(targetPath, 'utf8'));

  const sourceEntries = new Map(flattenStrings(source));
  const targetEntries = new Map(flattenStrings(target));

  for (const [key, englishValue] of sourceEntries.entries()) {
    const translatedValue = targetEntries.get(key);
    if (translatedValue !== englishValue) continue;
    if (!isProbablySafeToMatch(englishValue)) continue;

    identicalCount += 1;
    if (reported < REPORT_LIMIT) {
      console.log(`${file}:${key}`);
      console.log(`  en = ${JSON.stringify(englishValue)}`);
      console.log(`  ${localeCode} = ${JSON.stringify(translatedValue)}`);
      reported += 1;
    }
  }
}

if (identicalCount === 0) {
  console.log(`No unchanged strings found for locale '${localeCode}'.`);
  process.exit(0);
}

if (identicalCount > REPORT_LIMIT) {
  console.log(`... ${identicalCount - REPORT_LIMIT} more unchanged strings omitted`);
}

console.log(`Found ${identicalCount} unchanged strings in locale '${localeCode}'.`);
process.exit(failOnIdentical ? 1 : 0);

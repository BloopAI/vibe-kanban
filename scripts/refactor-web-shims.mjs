#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createRequire } from 'node:module';

const APPLY = process.argv.includes('--apply');
const VERBOSE = process.argv.includes('--verbose');

const repoRoot = process.cwd();
const webRoot = path.join(repoRoot, 'packages/local-web');
const srcRoot = path.join(webRoot, 'src');
const tsconfigPath = path.join(webRoot, 'tsconfig.json');
const requireFromWeb = createRequire(path.join(webRoot, 'package.json'));
const ts = requireFromWeb('typescript');

const CODE_EXT_RE = /\.(?:[cm]?ts|[cm]?tsx|[cm]?js|[cm]?jsx)$/;
const SHIM_EXPORT_RE =
  /^\s*export(?:\s+type)?\s+.+\s+from\s+['"][^'"]+['"]\s*;?\s*$/;

if (!fs.existsSync(tsconfigPath)) {
  console.error(`Missing tsconfig: ${tsconfigPath}`);
  process.exit(1);
}

function norm(p) {
  return path.resolve(p).replace(/\\/g, '/');
}

function walk(dir, out = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (
        entry.name === 'node_modules' ||
        entry.name === '.git' ||
        entry.name === 'dist' ||
        entry.name === 'build' ||
        entry.name === 'coverage'
      ) {
        continue;
      }
      walk(full, out);
      continue;
    }
    if (CODE_EXT_RE.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function walkHtml(dir, out = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (
        entry.name === 'node_modules' ||
        entry.name === '.git' ||
        entry.name === 'dist' ||
        entry.name === 'build' ||
        entry.name === 'coverage'
      ) {
        continue;
      }
      walkHtml(full, out);
      continue;
    }
    if (entry.name.endsWith('.html')) {
      out.push(full);
    }
  }
  return out;
}

function stripExt(relPath) {
  return relPath.replace(/\.(?:[cm]?ts|[cm]?tsx|[cm]?js|[cm]?jsx)$/, '');
}

function parseShimTargetSpecifier(fileText) {
  const lines = fileText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '');
  if (lines.length < 1 || lines.length > 2) {
    return null;
  }
  const specs = [];
  for (const line of lines) {
    if (!SHIM_EXPORT_RE.test(line)) {
      return null;
    }
    const m = line.match(/from\s+['"]([^'"]+)['"]/);
    if (!m) {
      return null;
    }
    specs.push(m[1]);
  }
  const uniq = [...new Set(specs)];
  if (uniq.length !== 1) {
    return null;
  }
  return uniq[0];
}

function getScriptKind(filePath) {
  if (filePath.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (filePath.endsWith('.ts')) return ts.ScriptKind.TS;
  if (filePath.endsWith('.jsx')) return ts.ScriptKind.JSX;
  if (filePath.endsWith('.js')) return ts.ScriptKind.JS;
  if (filePath.endsWith('.mts')) return ts.ScriptKind.TS;
  if (filePath.endsWith('.cts')) return ts.ScriptKind.TS;
  if (filePath.endsWith('.mjs')) return ts.ScriptKind.JS;
  if (filePath.endsWith('.cjs')) return ts.ScriptKind.JS;
  return ts.ScriptKind.Unknown;
}

const readResult = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
if (readResult.error) {
  const msg = ts.formatDiagnosticsWithColorAndContext(
    [readResult.error],
    {
      getCanonicalFileName: (f) => f,
      getCurrentDirectory: () => process.cwd(),
      getNewLine: () => '\n',
    },
  );
  console.error(msg);
  process.exit(1);
}

const parsedConfig = ts.parseJsonConfigFileContent(
  readResult.config,
  ts.sys,
  webRoot,
);
const compilerOptions = parsedConfig.options;

function resolveModule(containingFile, specifier) {
  const resolved = ts.resolveModuleName(
    specifier,
    containingFile,
    compilerOptions,
    ts.sys,
  ).resolvedModule;
  if (!resolved) {
    return null;
  }
  return norm(resolved.resolvedFileName);
}

function toAliasSpecifier(absPath) {
  const srcPrefix = `${norm(srcRoot)}/`;
  if (!absPath.startsWith(srcPrefix)) {
    return null;
  }
  let rel = absPath.slice(srcPrefix.length);
  rel = stripExt(rel);
  if (rel.endsWith('/index')) {
    rel = rel.slice(0, -'/index'.length);
  }
  return `@/${rel}`;
}

function collectShimReferences(codeFiles, shimInfoByPath) {
  const refs = [];
  for (const file of codeFiles) {
    const fileKey = norm(file);
    if (shimInfoByPath.has(fileKey)) {
      continue;
    }
    const text = fs.readFileSync(file, 'utf8');
    const source = ts.createSourceFile(
      file,
      text,
      ts.ScriptTarget.Latest,
      true,
      getScriptKind(file),
    );
    function maybeRecord(lit) {
      const spec = lit.text;
      const resolved = resolveModule(file, spec);
      if (!resolved || !shimInfoByPath.has(resolved)) {
        return;
      }
      refs.push({
        file: path.relative(repoRoot, file),
        spec,
        shim: path.relative(repoRoot, shimInfoByPath.get(resolved).shimAbs),
      });
    }
    function visit(node) {
      if (
        ts.isImportDeclaration(node) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        maybeRecord(node.moduleSpecifier);
      } else if (
        ts.isExportDeclaration(node) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        maybeRecord(node.moduleSpecifier);
      } else if (
        ts.isCallExpression(node) &&
        node.expression.kind === ts.SyntaxKind.ImportKeyword &&
        node.arguments.length > 0 &&
        ts.isStringLiteral(node.arguments[0])
      ) {
        maybeRecord(node.arguments[0]);
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  return refs;
}

const srcCodeFiles = walk(srcRoot);
const shimInfoByPath = new Map();
const unresolvedShims = [];

for (const file of srcCodeFiles) {
  const text = fs.readFileSync(file, 'utf8');
  const targetSpec = parseShimTargetSpecifier(text);
  if (!targetSpec) {
    continue;
  }
  const shimAbs = norm(file);
  const targetAbs = resolveModule(file, targetSpec);
  if (!targetAbs) {
    unresolvedShims.push({
      shim: path.relative(repoRoot, file),
      targetSpec,
    });
    continue;
  }
  shimInfoByPath.set(shimAbs, {
    shimAbs,
    targetSpec,
    targetAbs,
    finalTargetAbs: null,
    finalAliasSpec: null,
  });
}

if (shimInfoByPath.size === 0) {
  console.log('No shims found.');
  process.exit(0);
}

if (unresolvedShims.length > 0) {
  console.error('Failed to resolve some shim destinations:');
  for (const item of unresolvedShims) {
    console.error(`- ${item.shim} -> ${item.targetSpec}`);
  }
  process.exit(1);
}

function resolveFinalTarget(shimAbs) {
  const seen = new Set([shimAbs]);
  let cursor = shimInfoByPath.get(shimAbs).targetAbs;
  while (shimInfoByPath.has(cursor)) {
    if (seen.has(cursor)) {
      const cycle = [...seen, cursor]
        .map((p) => path.relative(repoRoot, p))
        .join(' -> ');
      throw new Error(`Shim cycle detected: ${cycle}`);
    }
    seen.add(cursor);
    cursor = shimInfoByPath.get(cursor).targetAbs;
  }
  return cursor;
}

for (const [shimAbs, shimInfo] of shimInfoByPath.entries()) {
  const finalTargetAbs = resolveFinalTarget(shimAbs);
  const finalAliasSpec = toAliasSpecifier(finalTargetAbs);
  if (!finalAliasSpec) {
    console.error(
      `Final target for shim is outside src: ${path.relative(repoRoot, shimAbs)} -> ${path.relative(repoRoot, finalTargetAbs)}`,
    );
    process.exit(1);
  }
  shimInfo.finalTargetAbs = finalTargetAbs;
  shimInfo.finalAliasSpec = finalAliasSpec;
}

const webCodeFiles = walk(webRoot);
let rewrittenFiles = 0;
let rewrittenSpecifiers = 0;
const rewrittenFileDetails = [];

for (const file of webCodeFiles) {
  const fileKey = norm(file);
  if (shimInfoByPath.has(fileKey)) {
    continue;
  }
  const text = fs.readFileSync(file, 'utf8');
  const source = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    getScriptKind(file),
  );
  const replacements = [];
  function maybeRewrite(lit) {
    const spec = lit.text;
    const resolved = resolveModule(file, spec);
    if (!resolved) {
      return;
    }
    const shimInfo = shimInfoByPath.get(resolved);
    if (!shimInfo) {
      return;
    }
    if (spec === shimInfo.finalAliasSpec) {
      return;
    }
    replacements.push({
      start: lit.getStart(source) + 1,
      end: lit.getEnd() - 1,
      oldText: spec,
      newText: shimInfo.finalAliasSpec,
    });
  }
  function visit(node) {
    if (
      ts.isImportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      maybeRewrite(node.moduleSpecifier);
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      maybeRewrite(node.moduleSpecifier);
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length > 0 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      maybeRewrite(node.arguments[0]);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);

  if (replacements.length === 0) {
    continue;
  }

  replacements.sort((a, b) => b.start - a.start);
  let nextText = text;
  for (const rep of replacements) {
    nextText =
      nextText.slice(0, rep.start) + rep.newText + nextText.slice(rep.end);
  }

  rewrittenFiles += 1;
  rewrittenSpecifiers += replacements.length;
  rewrittenFileDetails.push({
    file: path.relative(repoRoot, file),
    replacements: replacements.length,
  });

  if (APPLY) {
    fs.writeFileSync(file, nextText);
  }
}

const htmlFiles = walkHtml(webRoot);
let rewrittenHtmlFiles = 0;
let rewrittenHtmlReplacements = 0;

for (const file of htmlFiles) {
  const original = fs.readFileSync(file, 'utf8');
  let updated = original;

  const pathPairs = [];
  for (const shimInfo of shimInfoByPath.values()) {
    const shimRel = path.relative(srcRoot, shimInfo.shimAbs).replace(/\\/g, '/');
    const targetRel = path
      .relative(srcRoot, shimInfo.finalTargetAbs)
      .replace(/\\/g, '/');
    pathPairs.push({
      oldPath: `/src/${shimRel}`,
      newPath: `/src/${targetRel}`,
    });
    pathPairs.push({
      oldPath: `/src/${stripExt(shimRel)}`,
      newPath: `/src/${stripExt(targetRel)}`,
    });
  }

  pathPairs.sort((a, b) => b.oldPath.length - a.oldPath.length);
  let localReplacements = 0;
  for (const { oldPath, newPath } of pathPairs) {
    if (oldPath === newPath || !updated.includes(oldPath)) {
      continue;
    }
    const count = updated.split(oldPath).length - 1;
    if (count > 0) {
      updated = updated.split(oldPath).join(newPath);
      localReplacements += count;
    }
  }

  if (localReplacements > 0) {
    rewrittenHtmlFiles += 1;
    rewrittenHtmlReplacements += localReplacements;
    if (APPLY) {
      fs.writeFileSync(file, updated);
    }
  }
}

const remainingRefs = collectShimReferences(webCodeFiles, shimInfoByPath);

console.log(`Mode: ${APPLY ? 'apply' : 'dry-run'}`);
console.log(`Shims found: ${shimInfoByPath.size}`);
console.log(`Code files updated: ${rewrittenFiles}`);
console.log(`Code specifiers rewritten: ${rewrittenSpecifiers}`);
console.log(`HTML files updated: ${rewrittenHtmlFiles}`);
console.log(`HTML path rewrites: ${rewrittenHtmlReplacements}`);
console.log(`Remaining shim refs in code: ${remainingRefs.length}`);

if (VERBOSE && rewrittenFileDetails.length > 0) {
  console.log('\nRewritten files:');
  for (const detail of rewrittenFileDetails.sort((a, b) =>
    a.file.localeCompare(b.file),
  )) {
    console.log(`- ${detail.file} (${detail.replacements})`);
  }
}

if (APPLY && remainingRefs.length > 0) {
  console.error('\nCannot delete shims because references still remain:');
  for (const ref of remainingRefs.slice(0, 100)) {
    console.error(`- ${ref.file}: '${ref.spec}' -> ${ref.shim}`);
  }
  if (remainingRefs.length > 100) {
    console.error(`... and ${remainingRefs.length - 100} more`);
  }
  process.exit(1);
}

if (APPLY) {
  let deleted = 0;
  for (const shimAbs of shimInfoByPath.keys()) {
    if (fs.existsSync(shimAbs)) {
      fs.unlinkSync(shimAbs);
      deleted += 1;
    }
  }
  console.log(`Shims deleted: ${deleted}`);
} else {
  if (remainingRefs.length > 0) {
    console.log(
      'Note: remaining refs are expected in dry-run because files are not written.',
    );
  }
  console.log('Dry-run complete. Re-run with --apply to write changes.');
}

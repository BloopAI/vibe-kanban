#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const APPLY = process.argv.includes("--apply");
const VERBOSE = process.argv.includes("--verbose");

function findRepoRoot(startDir) {
  let current = path.resolve(startDir);
  while (true) {
    const remotePath = path.join(current, "packages", "remote-web");
    const scriptsPath = path.join(current, "scripts");
    if (fs.existsSync(remotePath) && fs.existsSync(scriptsPath)) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error(
        `could not locate repository root from starting path: ${startDir}`,
      );
    }
    current = parent;
  }
}

const repoRoot = findRepoRoot(process.cwd());
const remoteRoot = path.join(repoRoot, "packages/remote-web");
const remoteSrcRoot = path.join(remoteRoot, "src");
const indexHtmlPath = path.join(remoteRoot, "index.html");

const movePlan = [
  ["main.tsx", "app/entry/Bootstrap.tsx"],
  ["AppRouter.tsx", "app/entry/App.tsx"],
  ["Router.tsx", "app/router/index.ts"],
  ["index.css", "app/styles/index.css"],
  ["hooks/useSystemTheme.ts", "shared/hooks/useSystemTheme.ts"],
  ["lib/api.ts", "shared/lib/api.ts"],
  ["lib/auth.ts", "shared/lib/auth.ts"],
  ["lib/pkce.ts", "shared/lib/pkce.ts"],
  ["lib/tokenManager.ts", "shared/lib/auth/tokenManager.ts"],
];

const importRewritePlan = [
  ["./Router", "@/app/router"],
  ["./AppRouter", "@/app/entry/App"],
  ["./index.css", "@/app/styles/index.css"],
  ["./routeTree.gen", "@/routeTree.gen"],
  ["../hooks/useSystemTheme", "@/shared/hooks/useSystemTheme"],
  ["../lib/api", "@/shared/lib/api"],
  ["../lib/auth", "@/shared/lib/auth"],
  ["../lib/pkce", "@/shared/lib/pkce"],
  ["./tokenManager", "@/shared/lib/auth/tokenManager"],
  ["./auth", "@/shared/lib/auth"],
  ["./api", "@/shared/lib/api"],
  [
    "../../web-core/src/app/styles/new/index.css",
    "../../../../web-core/src/app/styles/new/index.css",
  ],
];

function log(message) {
  console.log(message);
}

function verbose(message) {
  if (VERBOSE) {
    console.log(message);
  }
}

function ensureDirFor(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function moveFile(fromRel, toRel) {
  const fromAbs = path.join(remoteSrcRoot, fromRel);
  const toAbs = path.join(remoteSrcRoot, toRel);

  const fromExists = fs.existsSync(fromAbs);
  const toExists = fs.existsSync(toAbs);

  if (!fromExists && toExists) {
    verbose(`skip move (already moved): ${fromRel} -> ${toRel}`);
    return;
  }
  if (!fromExists && !toExists) {
    throw new Error(`missing source and destination: ${fromRel} -> ${toRel}`);
  }
  if (fromExists && toExists) {
    throw new Error(`destination already exists: ${fromRel} -> ${toRel}`);
  }

  ensureDirFor(toAbs);
  if (APPLY) {
    fs.renameSync(fromAbs, toAbs);
    log(`moved: ${fromRel} -> ${toRel}`);
    return;
  }
  log(`would move: ${fromRel} -> ${toRel}`);
}

function rewriteText(text, rewritePairs) {
  let next = text;
  for (const [from, to] of rewritePairs) {
    next = next.replaceAll(`'${from}'`, `'${to}'`);
    next = next.replaceAll(`"${from}"`, `"${to}"`);
  }
  return next;
}

function walkCodeFiles(dir, out = []) {
  if (!fs.existsSync(dir)) {
    return out;
  }
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkCodeFiles(fullPath, out);
      continue;
    }
    if (/\.d\.ts$/.test(entry.name) || /\.(ts|tsx|css)$/.test(entry.name)) {
      out.push(fullPath);
    }
  }
  return out;
}

function rewriteFile(filePath, rewritePairs) {
  const current = fs.readFileSync(filePath, "utf8");
  const next = rewriteText(current, rewritePairs);
  if (next === current) {
    return false;
  }
  if (APPLY) {
    fs.writeFileSync(filePath, next);
  }
  return true;
}

function pruneEmptyDir(dirPath) {
  if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
    return;
  }

  const entries = fs.readdirSync(dirPath);
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry);
    if (fs.statSync(fullPath).isDirectory()) {
      pruneEmptyDir(fullPath);
    }
  }

  if (fs.readdirSync(dirPath).length === 0) {
    if (APPLY) {
      fs.rmdirSync(dirPath);
    }
    log(
      `${APPLY ? "removed" : "would remove"} empty dir: ${path.relative(remoteSrcRoot, dirPath)}`,
    );
  }
}

function run() {
  if (!fs.existsSync(remoteSrcRoot)) {
    throw new Error(`missing remote-web src root: ${remoteSrcRoot}`);
  }

  log(
    APPLY
      ? "Applying remote-web structure migration..."
      : "Dry-run remote-web structure migration...",
  );

  for (const [fromRel, toRel] of movePlan) {
    moveFile(fromRel, toRel);
  }

  const codeFiles = walkCodeFiles(remoteSrcRoot);
  let rewrittenCount = 0;

  for (const filePath of codeFiles) {
    const changed = rewriteFile(filePath, importRewritePlan);
    if (changed) {
      rewrittenCount += 1;
      const rel = path.relative(remoteRoot, filePath);
      log(`${APPLY ? "rewrote" : "would rewrite"} imports: ${rel}`);
    }
  }

  if (fs.existsSync(indexHtmlPath)) {
    const changed = rewriteFile(indexHtmlPath, [
      ["/src/main.tsx", "/src/app/entry/Bootstrap.tsx"],
    ]);
    if (changed) {
      log(`${APPLY ? "rewrote" : "would rewrite"} entry in: index.html`);
    }
  }

  pruneEmptyDir(path.join(remoteSrcRoot, "hooks"));
  pruneEmptyDir(path.join(remoteSrcRoot, "lib"));

  log(
    `Done. ${APPLY ? "Updated" : "Would update"} ${rewrittenCount} source files.`,
  );
}

try {
  run();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

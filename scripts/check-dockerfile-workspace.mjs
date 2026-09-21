#!/usr/bin/env node
/**
 * Guard: root Dockerfile must keep Docker buildable after workspace drift.
 * - COPY patches/ required when pnpm-workspace.yaml declares patchedDependencies
 * - crates/ must be fully present for Cargo workspace members used by --bin server
 *
 * Usage: node scripts/check-dockerfile-workspace.mjs
 * Exit 0 on pass, 1 on fail.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dockerfile = fs.readFileSync(path.join(root, 'Dockerfile'), 'utf8');
const cargoToml = fs.readFileSync(path.join(root, 'Cargo.toml'), 'utf8');
const pnpmWs = fs.readFileSync(path.join(root, 'pnpm-workspace.yaml'), 'utf8');

const errors = [];

// 1) patches/
const hasPatchedDeps = /patchedDependencies\s*:/.test(pnpmWs);
if (hasPatchedDeps && !/COPY\s+patches\/\s+patches\//.test(dockerfile)) {
  errors.push(
    'Dockerfile must COPY patches/ patches/ because pnpm-workspace.yaml declares patchedDependencies'
  );
}

// 2) workspace members under crates/ must be available in Docker build context
const workspaceBlock = cargoToml.match(/\[workspace\][\s\S]*?(?=\n\[|$)/)?.[0] || '';
const membersBlock = workspaceBlock.match(/members\s*=\s*\[([\s\S]*?)\]/)?.[1] || '';
const memberRe = /"crates\/([^"]+)"/g;
const members = [];
let m;
while ((m = memberRe.exec(membersBlock)) !== null) {
  members.push(m[1]);
}

const copiesWholeTree = /COPY\s+crates\/\s+crates\//.test(dockerfile);
if (!copiesWholeTree) {
  for (const member of members) {
    // Accept either recursive copy of that crate or Cargo.toml-only + full later
    const hasToml = new RegExp(
      String.raw`COPY\s+crates/${member}/Cargo\.toml\s+crates/${member}/Cargo\.toml`
    ).test(dockerfile);
    const hasDir = new RegExp(
      String.raw`COPY\s+crates/${member}/\s+crates/${member}/`
    ).test(dockerfile);
    if (!hasToml && !hasDir) {
      errors.push(
        `Dockerfile missing crate workspace member: crates/${member} (COPY crates/ crates/ recommended)`
      );
    }
  }
}

if (errors.length) {
  console.error('check-dockerfile-workspace FAILED:');
  for (const e of errors) console.error(' -', e);
  process.exit(1);
}

console.log(
  `check-dockerfile-workspace OK (patchedDeps=${hasPatchedDeps}, members=${members.length}, wholeTree=${copiesWholeTree})`
);

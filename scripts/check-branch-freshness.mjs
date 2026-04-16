#!/usr/bin/env node

import { execFileSync } from 'node:child_process';

const [baseBranch] = process.argv.slice(2);

if (!baseBranch) {
  console.error(
    'Usage: node scripts/check-branch-freshness.mjs <base-branch>',
  );
  process.exit(1);
}

const runGit = (...args) =>
  execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    .trim();

try {
  runGit('rev-parse', '--verify', 'HEAD');
  runGit('rev-parse', '--verify', `origin/${baseBranch}`);
} catch (error) {
  console.error(
    `Unable to resolve HEAD or origin/${baseBranch}. Make sure the base branch was fetched before running freshness checks.`,
  );
  process.exit(1);
}

try {
  execFileSync('git', ['merge-base', '--is-ancestor', `origin/${baseBranch}`, 'HEAD'], {
    stdio: 'ignore',
  });
  console.log(`Branch freshness OK: HEAD contains origin/${baseBranch}.`);
} catch (error) {
  const baseSha = runGit('rev-parse', `origin/${baseBranch}`);
  const headSha = runGit('rev-parse', 'HEAD');
  console.error(
    [
      `Branch freshness check failed.`,
      `Base branch "${baseBranch}" is not fully merged into this PR branch.`,
      `origin/${baseBranch}: ${baseSha}`,
      `HEAD: ${headSha}`,
      `Rebase or merge origin/${baseBranch}, then rerun validation.`,
    ].join('\n'),
  );
  process.exit(1);
}

#!/usr/bin/env node

const [baseBranch, headBranch] = process.argv.slice(2);

if (!baseBranch || !headBranch) {
  console.error(
    'Usage: node scripts/check-branch-policy.mjs <base-branch> <head-branch>',
  );
  process.exit(1);
}

const fail = (message) => {
  console.error(message);
  process.exit(1);
};

if (!['staging', 'main'].includes(baseBranch)) {
  fail(
    `Unsupported PR base branch "${baseBranch}". Expected "staging" or "main".`,
  );
}

if (baseBranch === 'staging') {
  if (headBranch === 'staging' || headBranch === 'main') {
    fail(
      `PRs into staging must come from a task branch, not from "${headBranch}".`,
    );
  }

  console.log(
    `Branch policy OK: "${headBranch}" is allowed to target "${baseBranch}".`,
  );
  process.exit(0);
}

if (headBranch === 'staging' || headBranch.startsWith('hotfix/')) {
  console.log(
    `Branch policy OK: "${headBranch}" is allowed to target "${baseBranch}".`,
  );
  process.exit(0);
}

fail(
  `PRs into main must come from "staging" or "hotfix/*", but head branch was "${headBranch}".`,
);

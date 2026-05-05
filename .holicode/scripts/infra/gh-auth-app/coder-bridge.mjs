#!/usr/bin/env node
/**
 * gh-auth-coder: Coder External Auth Bridge (PoC)
 *
 * Attempts to use Coder's external auth to obtain a GitHub token
 * and inject it into gh CLI. This is the zero-interaction path
 * when Coder external auth is properly configured.
 *
 * Usage:
 *   node coder-bridge.mjs [--provider <id>]
 *
 * Requires:
 *   - Running inside a Coder workspace (CODER=true)
 *   - External auth configured for GitHub on the Coder deployment
 *   - User has completed the Coder external auth flow for GitHub
 */

import { execFileSync, spawnSync } from "node:child_process";

const provider = process.argv.includes("--provider")
  ? process.argv[process.argv.indexOf("--provider") + 1]
  : "github";

console.log("=== Coder External Auth Bridge ===\n");

// Check we're in a Coder workspace
if (process.env.CODER !== "true") {
  console.error("Not running inside a Coder workspace (CODER env not set).");
  console.error("This script only works inside Coder workspaces.");
  process.exit(1);
}

console.log(`Workspace: ${process.env.CODER_WORKSPACE_NAME || "unknown"}`);
console.log(`Provider:  ${provider}\n`);

// Validate provider to guard against unexpected values
if (!/^[a-zA-Z0-9_-]+$/.test(provider)) {
  console.error(`Invalid provider ID: ${provider}`);
  process.exit(1);
}

// Try to get token from Coder external auth (no shell — execFileSync)
let token;
try {
  token = execFileSync("coder", ["external-auth", "access-token", provider], {
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
} catch (err) {
  const output = err.stdout?.trim() || err.stderr?.trim() || "";

  if (output.startsWith("http")) {
    console.log("External auth not yet completed for this provider.");
    console.log(`Please authenticate at: ${output}`);
    console.log("\nAfter authenticating, re-run this script.");
    process.exit(1);
  }

  console.error("Failed to get token from Coder external auth:", output || err.message);
  console.error("\nPossible causes:");
  console.error("  1. External auth not configured on Coder deployment");
  console.error("  2. Provider ID mismatch (try --provider <id>)");
  console.error("  3. coder CLI not in PATH");
  process.exit(1);
}

// Validate token looks like a GitHub token
if (!token.match(/^gh[opsr]_[A-Za-z0-9]+$/) && !token.match(/^github_pat_/)) {
  console.warn(`Warning: Token format unexpected (${token.substring(0, 10)}...)`);
  console.warn("Proceeding anyway — it may still work.\n");
}

console.log("Token obtained from Coder external auth.\n");

// Inject into gh CLI (pass token via stdin buffer — never in shell args)
console.log("Injecting token into gh CLI...");
const loginResult = spawnSync("gh", ["auth", "login", "--with-token"], {
  input: token + "\n",
  stdio: ["pipe", "inherit", "inherit"],
});

if (loginResult.status !== 0) {
  console.error("Failed to inject token into gh CLI.");
  console.error("Falling back to GH_TOKEN environment variable approach.\n");
  console.log("Add this to your shell profile:");
  console.log(`  export GH_TOKEN=$(coder external-auth access-token ${provider})`);
  process.exit(1);
}

// Verify
console.log("\nVerification:");
spawnSync("gh", ["auth", "status"], { stdio: "inherit" });

console.log("\nDone! gh CLI is now authenticated via Coder external auth.");

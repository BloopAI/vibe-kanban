#!/usr/bin/env node
/**
 * gh-auth-coder: Device Flow authenticator (PoC)
 *
 * Uses GitHub's OAuth device flow to authenticate, then feeds the token
 * to `gh auth login --with-token`. Designed for Coder workspaces where
 * interactive browser-based auth isn't possible from the terminal.
 *
 * Usage:
 *   node device-flow.mjs [--client-id <id>] [--scopes <comma-separated>]
 *
 * The device flow shows a URL + code. User opens the URL in any browser
 * (even on their laptop), enters the code, and authorizes. The script
 * polls GitHub until authorized, then injects the token into gh CLI.
 */

import { createOAuthDeviceAuth } from "@octokit/auth-oauth-device";
import { spawnSync } from "node:child_process";

// gh CLI's own OAuth app client ID (public, used by gh auth login)
const GH_CLI_CLIENT_ID = "178c6fc778ccc68e1d6a";

const args = process.argv.slice(2);
const clientId = getArg(args, "--client-id") || GH_CLI_CLIENT_ID;
const scopes = (getArg(args, "--scopes") || "repo,read:org,workflow,gist").split(",");

function getArg(args, flag) {
  const idx = args.indexOf(flag);
  return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : null;
}

console.log("=== GitHub Device Flow Authentication ===\n");
console.log(`Client ID: ${clientId === GH_CLI_CLIENT_ID ? "(gh CLI default)" : clientId}`);
console.log(`Scopes:    ${scopes.join(", ")}\n`);

const auth = createOAuthDeviceAuth({
  clientType: "oauth-app",
  clientId,
  scopes,
  onVerification(verification) {
    console.log("---------------------------------------------");
    console.log(`  Open:  ${verification.verification_uri}`);
    console.log(`  Code:  ${verification.user_code}`);
    console.log("---------------------------------------------");
    console.log("\nWaiting for authorization (this will poll automatically)...\n");
  },
});

try {
  const { token } = await auth({ type: "oauth" });
  console.log("Authorization successful! Token obtained.\n");

  // Inject into gh CLI (pass token via stdin buffer — never in shell args)
  console.log("Injecting token into gh CLI...");
  const loginResult = spawnSync("gh", ["auth", "login", "--with-token"], {
    input: token + "\n",
    stdio: ["pipe", "inherit", "inherit"],
  });

  if (loginResult.status !== 0) {
    console.error("gh auth login failed.");
    process.exit(1);
  }

  // Verify
  console.log("\nVerification:");
  spawnSync("gh", ["auth", "status"], { stdio: "inherit" });

  console.log("\nDone! gh CLI is now authenticated.");
} catch (err) {
  console.error("Authentication failed:", err.message);
  process.exit(1);
}

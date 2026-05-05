#!/usr/bin/env node
/**
 * gh-auth-coder: Web UI for device flow (PoC)
 *
 * Starts a tiny HTTP server on port 3456 that shows a nice page with the
 * device code and a link to GitHub. Designed to be accessed through
 * Coder's port forwarding.
 *
 * Usage:
 *   node server.mjs [--port <number>] [--client-id <id>]
 *
 * Access via Coder port forwarding:
 *   https://3456--main--<workspace>--<user>.coder.example.com
 */

import http from "node:http";
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const PORT = Number(getArg(args, "--port") || 3456);
const GH_CLI_CLIENT_ID = "178c6fc778ccc68e1d6a";

// --- Trust gap 2: client ID allowlist ---
const ALLOWED_CLIENT_IDS = new Set([
  GH_CLI_CLIENT_ID, // gh CLI's own public OAuth app
]);
const requestedClientId = getArg(args, "--client-id");
if (requestedClientId && !ALLOWED_CLIENT_IDS.has(requestedClientId)) {
  console.error(`Blocked: client ID '${requestedClientId}' is not in the allowlist.`);
  console.error("Add it to ALLOWED_CLIENT_IDS in server.mjs if intentional.");
  process.exit(1);
}
const CLIENT_ID = requestedClientId || GH_CLI_CLIENT_ID;

// --- Trust gap 1: verification_uri allowlist ---
const ALLOWED_VERIFICATION_URIS = new Set([
  "https://github.com/login/device",
]);

// Default scope preset used when no scopes sent by client
const DEFAULT_SCOPES = "repo,read:org,workflow,gist";

// All available scopes with descriptions shown in the UI
// tier: "default" = pre-checked, "extra" = shown unchecked, "dangerous" = hidden behind advanced
const SCOPE_CATALOG = [
  {
    name: "repo",
    label: "repo",
    description: "Full read/write access to code, PRs, issues, commits, collaborators and webhooks on public and private repos. Required for most gh CLI operations.",
    tier: "default",
  },
  {
    name: "public_repo",
    label: "public_repo",
    description: "Read/write access to public repositories only. A lighter alternative to 'repo' if you only need to work with public repos.",
    tier: "extra",
  },
  {
    name: "read:org",
    label: "read:org",
    description: "Read-only access to organisation membership, teams and projects. Needed to list org repos and check team membership.",
    tier: "default",
  },
  {
    name: "workflow",
    label: "workflow",
    description: "Create and update GitHub Actions workflow files (.github/workflows). Required for gh workflow commands and deploying CI/CD changes.",
    tier: "default",
  },
  {
    name: "gist",
    label: "gist",
    description: "Create and update Gists. Used by gh gist commands.",
    tier: "default",
  },
  {
    name: "write:packages",
    label: "write:packages",
    description: "Upload and publish packages to GitHub Packages (npm, Maven, Docker, etc.). Also grants read:packages.",
    tier: "extra",
  },
  {
    name: "read:packages",
    label: "read:packages",
    description: "Download and install packages from GitHub Packages. Needed to pull private container images or packages.",
    tier: "extra",
  },
  {
    name: "notifications",
    label: "notifications",
    description: "Read notifications and mark them as read. Required for gh notification commands.",
    tier: "extra",
  },
  {
    name: "admin:public_key",
    label: "admin:public_key",
    description: "Full management of SSH keys on your account (list, add, delete). Useful for automating workspace SSH key setup.",
    tier: "extra",
  },
  {
    name: "admin:gpg_key",
    label: "admin:gpg_key",
    description: "Full management of GPG keys on your account. Needed for setting up signed commits automatically.",
    tier: "extra",
  },
  {
    name: "delete_repo",
    label: "delete_repo",
    description: "Permanently delete repositories. Destructive and irreversible.",
    tier: "dangerous",
  },
];

// Known scope names for server-side validation
const VALID_SCOPE_NAMES = new Set(SCOPE_CATALOG.map((s) => s.name));

function getArg(args, flag) {
  const idx = args.indexOf(flag);
  return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : null;
}

// --- Trust gap 5: origin checking ---
// Build set of allowed origins from VSCODE_PROXY_URI + localhost
function getAllowedOrigins() {
  const origins = new Set([
    `http://localhost:${PORT}`,
    `http://127.0.0.1:${PORT}`,
  ]);
  const proxyUri = process.env.VSCODE_PROXY_URI;
  if (proxyUri) {
    const coderUrl = proxyUri.replace("{{port}}", String(PORT));
    // Add with and without trailing slash, extract origin
    try {
      const parsed = new URL(coderUrl);
      origins.add(parsed.origin);
    } catch {
      // If URL parsing fails, add raw
      origins.add(coderUrl.replace(/\/$/, ""));
    }
  }
  return origins;
}

const ALLOWED_ORIGINS = getAllowedOrigins();

function checkOrigin(req, res) {
  const origin = req.headers["origin"];
  // GET requests (status, scopes) don't need origin check
  if (req.method === "GET") return true;
  // No origin header = same-origin request (non-CORS), allow
  if (!origin) return true;
  if (ALLOWED_ORIGINS.has(origin)) return true;

  json(res, 403, { error: "Forbidden: origin not allowed" });
  return false;
}

let state = { phase: "idle" }; // idle | pending | polling | success | error

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === "/api/start" && req.method === "POST") {
    if (!checkOrigin(req, res)) return;
    return handleStart(req, res);
  }
  if (url.pathname === "/api/status") {
    return handleStatus(req, res);
  }
  if (url.pathname === "/api/scopes") {
    return json(res, 200, { scopes: SCOPE_CATALOG });
  }
  if (url.pathname === "/api/coder-bridge" && req.method === "POST") {
    if (!checkOrigin(req, res)) return;
    return handleCoderBridge(req, res);
  }
  if (url.pathname === "/" || url.pathname === "/index.html") {
    return serveHTML(res);
  }

  res.writeHead(404);
  res.end("Not found");
});

function json(res, statusCode, data) {
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

async function readBody(req) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      try { resolve(JSON.parse(body)); } catch { resolve({}); }
    });
  });
}

async function handleStart(req, res) {
  if (state.phase === "polling") {
    return json(res, 409, { error: "Already polling — wait or restart server" });
  }

  const body = await readBody(req);

  // Validate scopes against known catalog
  let scopeList;
  if (Array.isArray(body.scopes) && body.scopes.length > 0) {
    scopeList = body.scopes.filter((s) => typeof s === "string" && VALID_SCOPE_NAMES.has(s));
    if (scopeList.length === 0) scopeList = DEFAULT_SCOPES.split(",");
  } else {
    scopeList = DEFAULT_SCOPES.split(",");
  }
  const scopeString = scopeList.join(",");

  state = { phase: "pending" };

  try {
    // Step 1: Request device code
    const dcRes = await fetch("https://github.com/login/device/code", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ client_id: CLIENT_ID, scope: scopeString }),
    });

    const dc = await dcRes.json();
    if (dc.error) throw new Error(dc.error_description || dc.error);

    // Trust gap 1: validate verification_uri from GitHub response
    if (!ALLOWED_VERIFICATION_URIS.has(dc.verification_uri)) {
      state = { phase: "error", message: `Unexpected verification URI: ${dc.verification_uri}` };
      return json(res, 502, {
        error: `Blocked: verification URI '${dc.verification_uri}' not in allowlist`,
      });
    }

    state = {
      phase: "polling",
      device_code: dc.device_code,
      user_code: dc.user_code,
      verification_uri: dc.verification_uri,
      expires_at: Date.now() + dc.expires_in * 1000,
      interval: dc.interval || 5,
    };

    json(res, 200, {
      user_code: dc.user_code,
      verification_uri: dc.verification_uri,
      expires_in: dc.expires_in,
    });

    // Start polling in background
    pollForToken();
  } catch (err) {
    state = { phase: "error", message: err.message };
    json(res, 500, { error: err.message });
  }
}

async function pollForToken() {
  const { device_code, interval, expires_at } = state;
  let wait = interval;

  while (Date.now() < expires_at && state.phase === "polling") {
    await sleep(wait * 1000);

    try {
      const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          client_id: CLIENT_ID,
          device_code,
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        }),
      });

      const data = await tokenRes.json();

      if (data.access_token) {
        // Inject into gh CLI (pass token via stdin buffer — never in shell args)
        const loginResult = spawnSync("gh", ["auth", "login", "--with-token"], {
          input: data.access_token + "\n",
          stdio: "pipe",
        });

        if (loginResult.status === 0) {
          state = { phase: "success", scopes: data.scope };
        } else {
          state = {
            phase: "success",
            scopes: data.scope,
            warning: "Token obtained but gh auth login failed. Set GH_TOKEN manually.",
            token_hint: data.access_token.substring(0, 10) + "...",
          };
        }
        return;
      }

      if (data.error === "slow_down") {
        wait = (data.interval || wait) + 5;
      } else if (data.error === "authorization_pending") {
        // Keep polling
      } else if (data.error === "expired_token") {
        state = { phase: "error", message: "Device code expired. Please restart." };
        return;
      } else if (data.error === "access_denied") {
        state = { phase: "error", message: "User denied authorization." };
        return;
      } else {
        state = { phase: "error", message: data.error_description || data.error };
        return;
      }
    } catch (err) {
      state = { phase: "error", message: `Polling error: ${err.message}` };
      return;
    }
  }

  if (state.phase === "polling") {
    state = { phase: "error", message: "Timed out waiting for authorization." };
  }
}

function handleStatus(_req, res) {
  json(res, 200, {
    phase: state.phase,
    user_code: state.user_code,
    verification_uri: state.verification_uri,
    scopes: state.scopes,
    warning: state.warning,
    message: state.message,
  });
}

async function handleCoderBridge(_req, res) {
  // Use spawnSync to avoid shell injection and properly capture exit code
  const result = spawnSync("coder", ["external-auth", "access-token", "github"], {
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
  });

  const output = (result.stdout || "").trim();

  // Exit code 1 + URL on stdout = user needs to complete browser auth
  if (result.status !== 0 && output.startsWith("http")) {
    return json(res, 200, {
      phase: "needs_auth",
      auth_url: output,
      message: "Please authenticate with Coder's GitHub integration first.",
    });
  }

  // Exit code non-zero for other reasons = external auth unavailable
  if (result.status !== 0) {
    return json(res, 200, {
      phase: "unavailable",
      message: "Coder external auth not available or not configured.",
      detail: (result.stderr || "").trim() || output,
    });
  }

  // Got a token — inject into gh CLI via stdin
  const loginResult = spawnSync("gh", ["auth", "login", "--with-token"], {
    input: output + "\n",
    stdio: "pipe",
  });

  if (loginResult.status === 0) {
    json(res, 200, { phase: "success", message: "gh CLI authenticated via Coder external auth." });
  } else {
    json(res, 200, {
      phase: "error",
      message: "Got token from Coder but gh auth login failed.",
      detail: (loginResult.stderr || "").toString().trim(),
    });
  }
}

function serveHTML(res) {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>GitHub Auth - Coder Workspace</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, system-ui, sans-serif; background: #0d1117; color: #c9d1d9; min-height: 100vh; display: flex; align-items: flex-start; justify-content: center; padding: 2rem 1rem; }
    .container { max-width: 520px; width: 100%; }
    h1 { font-size: 1.5rem; margin-bottom: 0.25rem; color: #58a6ff; }
    .subtitle { color: #8b949e; margin-bottom: 1.5rem; font-size: 0.875rem; }
    .card { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 1.25rem; margin-bottom: 1rem; }
    .card-title { font-size: 0.9375rem; font-weight: 600; color: #f0f6fc; margin-bottom: 0.5rem; }
    .code-display { font-size: 2.25rem; font-family: monospace; text-align: center; letter-spacing: 0.2em; color: #f0f6fc; padding: 0.75rem 0; }
    .btn { display: block; padding: 0.625rem 1.25rem; border-radius: 6px; font-size: 0.875rem; font-weight: 600; cursor: pointer; border: 1px solid #30363d; text-decoration: none; text-align: center; width: 100%; background: none; color: inherit; }
    .btn-primary { background: #238636; color: #fff; border-color: #238636; }
    .btn-primary:hover:not(:disabled) { background: #2ea043; }
    .btn-secondary { background: #21262d; color: #c9d1d9; }
    .btn-secondary:hover:not(:disabled) { background: #30363d; }
    .btn-link { background: none; border: none; color: #58a6ff; padding: 0; width: auto; font-size: 0.8125rem; cursor: pointer; text-decoration: underline; }
    .btn-danger { background: none; border: none; color: #f85149; padding: 0; width: auto; font-size: 0.75rem; cursor: pointer; text-decoration: underline; }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .status { padding: 0.625rem 0.75rem; border-radius: 6px; margin-top: 0.75rem; font-size: 0.8125rem; line-height: 1.4; display: none; }
    .status-success { background: #0d2117; border: 1px solid #238636; color: #3fb950; }
    .status-error { background: #200d0d; border: 1px solid #da3633; color: #f85149; }
    .status-pending { background: #1a1500; border: 1px solid #9e6a03; color: #d29922; }
    a.link { color: #58a6ff; text-decoration: none; }
    a.link:hover { text-decoration: underline; }
    .divider { border-top: 1px solid #30363d; margin: 1.25rem 0; }
    .small { font-size: 0.75rem; color: #8b949e; }
    .mb-sm { margin-bottom: 0.5rem; }
    .mb { margin-bottom: 0.75rem; }
    .scope-section { margin-top: 0.875rem; }
    .scope-toggle { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.625rem; }
    .scope-grid { display: none; flex-direction: column; gap: 0.375rem; margin-top: 0.375rem; }
    .scope-grid.open { display: flex; }
    .scope-row { display: flex; align-items: flex-start; gap: 0.625rem; padding: 0.5rem; border-radius: 5px; background: #0d1117; border: 1px solid #21262d; cursor: pointer; }
    .scope-row:hover { border-color: #388bfd40; }
    .scope-row.dangerous { border-color: #da363380; }
    .scope-row.dangerous:hover { border-color: #da3633; }
    .scope-row input[type=checkbox] { margin-top: 2px; flex-shrink: 0; accent-color: #238636; }
    .scope-row.dangerous input[type=checkbox] { accent-color: #da3633; }
    .scope-name { font-family: monospace; font-size: 0.8125rem; color: #79c0ff; flex-shrink: 0; min-width: 140px; }
    .scope-name.dangerous { color: #f85149; }
    .scope-desc { font-size: 0.75rem; color: #8b949e; line-height: 1.35; }
    .scope-summary { font-size: 0.75rem; color: #8b949e; margin-top: 0.375rem; }
    .scope-summary code { color: #79c0ff; }
    .advanced-section { margin-top: 0.625rem; padding-top: 0.5rem; border-top: 1px solid #21262d; display: none; }
    .advanced-section.open { display: block; }
    .warn-text { font-size: 0.6875rem; color: #f85149; margin-bottom: 0.375rem; }
  </style>
</head>
<body>
  <div class="container">
    <h1>GitHub Auth</h1>
    <p class="subtitle">Authenticate gh CLI in this Coder workspace</p>

    <div class="card">
      <div class="card-title">Device Flow</div>
      <p class="small mb-sm">Opens GitHub in your browser. Works from any device.</p>

      <div class="scope-section">
        <div class="scope-toggle">
          <button class="btn-link" id="scope-toggle-btn" onclick="toggleScopes()">&#x25B6; Customise scopes</button>
          <span class="small" id="scope-toggle-hint">(default: repo, read:org, workflow, gist)</span>
        </div>
        <div class="scope-grid" id="scope-grid"></div>
        <div id="advanced-toggle-area" style="display:none; margin-top:0.5rem">
          <button class="btn-danger" id="adv-btn" onclick="toggleAdvanced()">Show dangerous scopes</button>
        </div>
        <div class="advanced-section" id="advanced-section">
          <div class="warn-text">These scopes are destructive or high-privilege. Only enable if you know what you are doing.</div>
          <div class="scope-grid open" id="scope-grid-dangerous"></div>
        </div>
        <div class="scope-summary" id="scope-summary" style="display:none">
          Selected: <code id="scope-summary-text"></code>
        </div>
      </div>

      <div id="device-area" style="margin-top:0.75rem">
        <button class="btn btn-primary" id="start-btn" onclick="startDeviceFlow()">
          Start Device Flow
        </button>
      </div>

      <div id="code-area" style="display:none; margin-top:0.5rem">
        <div class="code-display" id="user-code"></div>
        <a class="btn btn-primary mb-sm" id="gh-link" href="#" target="_blank" rel="noopener">
          Open GitHub to enter code &rarr;
        </a>
        <p class="small" style="text-align:center">Enter the code above at GitHub to authorise.</p>
      </div>

      <div class="status" id="device-status"></div>
    </div>

    <div class="card">
      <div class="card-title">Coder External Auth Bridge</div>
      <p class="small mb">Uses Coder's built-in GitHub integration if already configured by your admin.</p>
      <button class="btn btn-secondary" onclick="tryCoderBridge()">Try Coder Bridge</button>
      <div class="status" id="coder-status"></div>
    </div>

    <div class="divider"></div>
    <p class="small">Token stored in <code>~/.config/gh/hosts.yml</code></p>
  </div>

  <script>
    // --- Trust gap 1: client-side allowlist for verification_uri ---
    const ALLOWED_VERIFY_HOSTS = ['github.com'];

    let pollTimer;
    let scopesOpen = false;
    let advancedOpen = false;
    let allScopes = [];

    fetch('/api/scopes').then(r => r.json()).then(data => {
      allScopes = data.scopes;
      renderScopeGrid();
    });

    // --- Trust gap 4: safe DOM helpers (no innerHTML) ---
    function createScopeRow(s) {
      const label = document.createElement('label');
      label.className = 'scope-row' + (s.tier === 'dangerous' ? ' dangerous' : '');

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.name = 'scope';
      cb.value = s.name;
      if (s.tier === 'default') cb.checked = true;
      cb.addEventListener('change', updateScopeSummary);

      const nameSpan = document.createElement('span');
      nameSpan.className = 'scope-name' + (s.tier === 'dangerous' ? ' dangerous' : '');
      nameSpan.textContent = s.label;

      const descSpan = document.createElement('span');
      descSpan.className = 'scope-desc';
      descSpan.textContent = s.description;

      label.append(cb, nameSpan, descSpan);
      return label;
    }

    function renderScopeGrid() {
      const grid = document.getElementById('scope-grid');
      const dangerousGrid = document.getElementById('scope-grid-dangerous');
      grid.textContent = '';
      dangerousGrid.textContent = '';

      let hasDangerous = false;
      for (const s of allScopes) {
        if (s.tier === 'dangerous') {
          dangerousGrid.appendChild(createScopeRow(s));
          hasDangerous = true;
        } else {
          grid.appendChild(createScopeRow(s));
        }
      }
      if (hasDangerous) {
        document.getElementById('advanced-toggle-area').style.display = '';
      }
      updateScopeSummary();
    }

    function toggleScopes() {
      scopesOpen = !scopesOpen;
      document.getElementById('scope-grid').classList.toggle('open', scopesOpen);
      document.getElementById('scope-toggle-btn').textContent = (scopesOpen ? '\\u25BC' : '\\u25B6') + ' Customise scopes';
      document.getElementById('scope-toggle-hint').style.display = scopesOpen ? 'none' : '';
      document.getElementById('scope-summary').style.display = scopesOpen ? 'block' : 'none';
      document.getElementById('advanced-toggle-area').style.display = scopesOpen ? '' : 'none';
      if (!scopesOpen) {
        advancedOpen = false;
        document.getElementById('advanced-section').classList.remove('open');
      }
      updateScopeSummary();
    }

    function toggleAdvanced() {
      advancedOpen = !advancedOpen;
      document.getElementById('advanced-section').classList.toggle('open', advancedOpen);
      document.getElementById('adv-btn').textContent = advancedOpen ? 'Hide dangerous scopes' : 'Show dangerous scopes';
    }

    function getSelectedScopes() {
      const checked = document.querySelectorAll('input[name=scope]:checked');
      return checked.length > 0
        ? Array.from(checked).map(cb => cb.value)
        : ['repo', 'read:org', 'workflow', 'gist'];
    }

    function updateScopeSummary() {
      document.getElementById('scope-summary-text').textContent = getSelectedScopes().join(', ');
    }

    // --- Trust gap 4: safe status rendering ---
    function setStatus(id, type, textParts) {
      const el = document.getElementById(id);
      el.className = 'status status-' + type;
      el.textContent = '';
      el.style.display = 'block';

      // textParts can be a string or an array of {text} | {text, href}
      if (typeof textParts === 'string') {
        el.textContent = textParts;
        return;
      }
      for (const part of textParts) {
        if (part.href) {
          const a = document.createElement('a');
          a.className = 'link';
          a.href = part.href;
          a.target = '_blank';
          a.rel = 'noopener';
          a.textContent = part.text;
          el.appendChild(a);
        } else {
          el.appendChild(document.createTextNode(part.text));
        }
      }
    }

    // --- Trust gap 1: client-side verification_uri validation ---
    function isAllowedVerifyUri(uri) {
      try {
        const parsed = new URL(uri);
        return parsed.protocol === 'https:' && ALLOWED_VERIFY_HOSTS.includes(parsed.hostname);
      } catch { return false; }
    }

    async function startDeviceFlow() {
      const btn = document.getElementById('start-btn');
      btn.disabled = true;
      btn.textContent = 'Starting...';

      try {
        const scopes = getSelectedScopes();
        const res = await fetch('/api/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scopes }),
        });
        const data = await res.json();

        if (data.error) throw new Error(data.error);

        // Trust gap 1: validate verification_uri before rendering as link
        if (!isAllowedVerifyUri(data.verification_uri)) {
          throw new Error('Unexpected verification URI: ' + data.verification_uri);
        }

        document.getElementById('device-area').style.display = 'none';
        const codeArea = document.getElementById('code-area');
        codeArea.style.display = 'block';
        document.getElementById('user-code').textContent = data.user_code;
        document.getElementById('gh-link').href = data.verification_uri;

        setStatus('device-status', 'pending', 'Waiting for authorisation...');
        pollTimer = setInterval(checkStatus, 3000);
      } catch (err) {
        setStatus('device-status', 'error', err.message);
        btn.disabled = false;
        btn.textContent = 'Start Device Flow';
      }
    }

    async function checkStatus() {
      try {
        const res = await fetch('/api/status');
        const data = await res.json();

        if (data.phase === 'success') {
          clearInterval(pollTimer);
          let parts = [{ text: '\\u2713 Authenticated! gh CLI is ready.' }];
          if (data.scopes) parts.push({ text: ' Scopes: ' + data.scopes });
          if (data.warning) parts.push({ text: ' (' + data.warning + ')' });
          setStatus('device-status', 'success', parts);
        } else if (data.phase === 'error') {
          clearInterval(pollTimer);
          setStatus('device-status', 'error', data.message);
          document.getElementById('device-area').style.display = 'block';
          document.getElementById('code-area').style.display = 'none';
          document.getElementById('start-btn').disabled = false;
          document.getElementById('start-btn').textContent = 'Retry';
        }
      } catch {}
    }

    async function tryCoderBridge() {
      setStatus('coder-status', 'pending', 'Checking Coder external auth...');
      try {
        const res = await fetch('/api/coder-bridge', { method: 'POST' });
        const data = await res.json();

        if (data.phase === 'success') {
          setStatus('coder-status', 'success', data.message);
        } else if (data.phase === 'needs_auth') {
          // Trust gap 4: build link safely via setStatus parts
          setStatus('coder-status', 'pending', [
            { text: data.message + ' ' },
            { text: 'Authenticate \\u2192', href: data.auth_url },
          ]);
        } else {
          const msg = data.detail ? data.message + ' (' + data.detail + ')' : data.message;
          setStatus('coder-status', 'error', msg);
        }
      } catch (err) {
        setStatus('coder-status', 'error', 'Request failed: ' + err.message);
      }
    }
  </script>
</body>
</html>`);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

server.listen(PORT, "0.0.0.0", () => {
  const proxyUri = process.env.VSCODE_PROXY_URI;
  const url = proxyUri
    ? proxyUri.replace("{{port}}", String(PORT))
    : `http://localhost:${PORT}`;

  console.log(`\ngh-auth-coder server running!`);
  console.log(`  Local:  http://localhost:${PORT}`);
  if (proxyUri) console.log(`  Coder:  ${url}`);
  console.log(`  Origins: ${[...ALLOWED_ORIGINS].join(", ")}`);
  console.log(`\nOpen the URL above to authenticate.\n`);
});

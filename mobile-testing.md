# Testing on Mobile Devices

This guide explains how to access the remote-web frontend from a phone (iPhone/Android) for UI testing. It uses [Tailscale](https://tailscale.com) for stable networking and HTTPS certificates, and [Caddy](https://caddyserver.com) as a reverse proxy — no custom IPs, no random URLs, works on any network.

**Time to set up**: ~15 minutes (one-time). After that, it's two commands in two terminals.

---

## Prerequisites

### 1. Install Tailscale on your Mac

Download the standalone app from https://tailscale.com/download/mac (recommended). Alternatively, install from the [Mac App Store](https://apps.apple.com/app/tailscale/id1470499037).

After installing:

1. Open the Tailscale app
2. Click the Tailscale icon in your menu bar (top-right of screen)
3. Click **Log in** — this opens a browser window to sign in
4. Once signed in, the icon turns active — you're connected

> If you already have Tailscale installed, skip this step.

### 2. Install Tailscale on your phone

- **iPhone**: [App Store — Tailscale](https://apps.apple.com/app/tailscale/id1470499037)
- **Android**: [Play Store — Tailscale](https://play.google.com/store/apps/details?id=com.tailscale.ipn)

Sign in with the **same account** you used on your Mac.

### 3. Install Caddy on your Mac

```bash
brew install caddy
```

### 4. Verify both devices are connected

Click the Tailscale icon in your Mac menu bar — you should see your Mac listed as connected. You can also verify from the terminal:

```bash
tailscale status
```

Both your Mac and phone should appear:

```
100.x.x.x   johns-macbook     user@   macOS   -
100.x.x.x   iphone-john      user@   iOS     -
```

> If your phone shows "offline", open the Tailscale app on your phone and make sure the toggle is ON.

### 5. Enable MagicDNS and HTTPS Certificates

1. Open https://login.tailscale.com/admin/dns
2. Scroll to the **Nameservers** section — make sure **MagicDNS** is enabled. If you see a "Disable MagicDNS..." button, it's already enabled.
3. Scroll to the bottom of the page to the **"HTTPS Certificates"** section
4. Click **"Enable HTTPS"** if it's not already enabled. If you see a "Disable HTTPS..." button, it's already enabled.

> Enabling HTTPS means your machine names and tailnet DNS name will appear on a public certificate ledger. This is how Let's Encrypt works and is normal.

---

## One-Time Setup

All commands below auto-detect your Tailscale hostname — no manual copy-pasting needed.

### Step 1 — Save your hostname to your shell profile

Run the command for your shell:

**zsh** (default on macOS):
```bash
echo "export TS_HOSTNAME=$(tailscale status --json | python3 -c "import sys,json; print(json.load(sys.stdin)['Self']['DNSName'].rstrip('.'))")" >> ~/.zshrc
source ~/.zshrc
```

**bash**:
```bash
echo "export TS_HOSTNAME=$(tailscale status --json | python3 -c "import sys,json; print(json.load(sys.stdin)['Self']['DNSName'].rstrip('.'))")" >> ~/.bashrc
source ~/.bashrc
```

**fish**:
```bash
set -Ux TS_HOSTNAME (tailscale status --json | python3 -c "import sys,json; print(json.load(sys.stdin)['Self']['DNSName'].rstrip('.'))") 
```

Verify it worked:
```bash
echo "Your hostname: $TS_HOSTNAME"
```

Verify it resolves:

```bash
ping -c 1 $TS_HOSTNAME
```

### Step 2 — Generate HTTPS certificates

```bash
tailscale cert $TS_HOSTNAME
```

This creates `$TS_HOSTNAME.crt` and `$TS_HOSTNAME.key` in the current directory. These are real Let's Encrypt certificates — trusted by all browsers and devices, no extra installation needed on your phone.

> Certs expire after 90 days. Re-run `tailscale cert $TS_HOSTNAME` to renew.

### Step 3 — Create the Caddyfile

```bash
cat > Caddyfile << EOF
${TS_HOSTNAME}:3001 {
    tls ${TS_HOSTNAME}.crt ${TS_HOSTNAME}.key
    reverse_proxy 127.0.0.1:3000
}

${TS_HOSTNAME}:8443 {
    tls ${TS_HOSTNAME}.crt ${TS_HOSTNAME}.key
    reverse_proxy 127.0.0.1:8082
}
EOF
```

**What this does:**
- `https://$TS_HOSTNAME:3001` → proxies to the remote server on localhost:3000
- `https://$TS_HOSTNAME:8443` → proxies to the relay server on localhost:8082

> We use separate ports (3001 for the app, 8443 for the relay) to avoid conflicts with other services on your Tailscale hostname.

### Step 4 — Create a GitHub OAuth app

Each developer needs their own GitHub OAuth app so they can sign in from their phone. The app only needs `read:user` and `user:email` scopes — no special permissions required.

1. Go to https://github.com/settings/applications/new
2. Fill in the form:
   - **Application name**: anything (e.g. `vibe-kanban-mobile-yourname`)
   - **Homepage URL**: run `echo "https://$TS_HOSTNAME:3001"` and paste the output
   - **Authorization callback URL**: run `echo "https://$TS_HOSTNAME:3001/v1/oauth/github/callback"` and paste the output
3. Click **Register application**
4. Copy the **Client ID** shown on the next page
5. Click **Generate a new client secret** and copy it immediately (it won't be shown again)
6. Add both values to `crates/remote/.env.remote`:
   ```bash
   # Replace with your own values
   GITHUB_OAUTH_CLIENT_ID=your_client_id
   GITHUB_OAUTH_CLIENT_SECRET=your_client_secret
   ```

> `.env.remote` is already in `.gitignore` — your credentials stay local. If the file already has these variables from the shared dev setup, replace them with your own.

## Running

There are two modes: **Docker mode** (simple, no hot reload) and **Dev mode** (Vite hot reload for frontend changes). Pick whichever fits your workflow.

---

### Option A — Docker Mode (Simple)

The frontend is built inside Docker. No hot reload — you need to restart Docker to see frontend changes. Good for testing backend changes or doing final QA on your phone.

**Two terminals:**

```bash
# Terminal 1 — Docker stack
VITE_RELAY_API_BASE_URL=https://$TS_HOSTNAME:8443 \
PUBLIC_BASE_URL=https://$TS_HOSTNAME:3001 \
pnpm remote:dev

# Terminal 2 — Caddy
caddy run --config Caddyfile
```

> The first time you run with these env vars, Docker rebuilds the frontend with the Tailscale URLs baked in. This takes a few minutes. Subsequent runs with the same URLs are cached.

---

### Option B — Dev Mode (Vite Hot Reload)

The frontend runs outside Docker via Vite, so you get instant hot reload when editing React components. Caddy routes API requests to Docker and everything else to Vite.

**Step 1 — Generate `Caddyfile.dev`:**

This file can't use shell variables directly, so generate it once (re-run if your hostname changes):

```bash
cat > Caddyfile.dev << EOF
${TS_HOSTNAME}:3001 {
    tls ${TS_HOSTNAME}.crt ${TS_HOSTNAME}.key
    handle /api/* {
        reverse_proxy 127.0.0.1:3000
    }
    handle /v1/* {
        reverse_proxy 127.0.0.1:3000
    }
    handle /shape/* {
        reverse_proxy 127.0.0.1:3000
    }
    handle {
        reverse_proxy localhost:3002 {
            header_up Host localhost:3002
        }
    }
}

${TS_HOSTNAME}:8443 {
    tls ${TS_HOSTNAME}.crt ${TS_HOSTNAME}.key
    reverse_proxy 127.0.0.1:8082
}
EOF
```

**What this routes:**
- `/api/*`, `/v1/*`, `/shape/*` → Docker remote server (`:3000`)
- Everything else → Vite dev server (`:3002`) with hot reload
- `:8443` → Relay server (`:8082`)

**Step 2 — Run four terminals:**

```bash
# Terminal 1 — Docker backends (no frontend build needed)
PUBLIC_BASE_URL=https://$TS_HOSTNAME:3001 \
pnpm remote:dev

# Terminal 2 — Vite dev server (hot reload)
VITE_RELAY_API_BASE_URL=https://$TS_HOSTNAME:8443 \
pnpm --filter @vibe/remote-web dev

# Terminal 3 — Caddy (dev config)
caddy run --config Caddyfile.dev

# Terminal 4 (optional) — Local desktop client
VK_SHARED_API_BASE=https://$TS_HOSTNAME:3001 \
VK_SHARED_RELAY_API_BASE=https://$TS_HOSTNAME:8443 \
pnpm run dev
```

> Vite binds to `localhost:3002`. The `Caddyfile.dev` uses `localhost` (not `127.0.0.1`) to match — this avoids IPv6/IPv4 mismatch issues on macOS.

---

### Accessing from your phone

1. Open the Tailscale app and make sure it's connected (toggle ON)
2. Open Safari (or Chrome) and go to: `https://<your-hostname>:3001` (run `echo "https://$TS_HOSTNAME:3001"` if you forgot it)
3. Sign in with GitHub
4. You're in

To go back to regular localhost development, just run `pnpm remote:dev` without env vars — no cleanup needed.

---

## Quick Reference

**Docker mode (2 terminals):**
```bash
# Terminal 1
VITE_RELAY_API_BASE_URL=https://$TS_HOSTNAME:8443 \
PUBLIC_BASE_URL=https://$TS_HOSTNAME:3001 \
pnpm remote:dev

# Terminal 2
caddy run --config Caddyfile

# On phone
echo "https://$TS_HOSTNAME:3001"
```

**Dev mode (4 terminals):**
```bash
# Terminal 1 — Docker backends
PUBLIC_BASE_URL=https://$TS_HOSTNAME:3001 \
pnpm remote:dev

# Terminal 2 — Vite
VITE_RELAY_API_BASE_URL=https://$TS_HOSTNAME:8443 \
pnpm --filter @vibe/remote-web dev

# Terminal 3 — Caddy
caddy run --config Caddyfile.dev

# Terminal 4 (optional) — Desktop client
VK_SHARED_API_BASE=https://$TS_HOSTNAME:3001 \
VK_SHARED_RELAY_API_BASE=https://$TS_HOSTNAME:8443 \
pnpm run dev

# On phone
echo "https://$TS_HOSTNAME:3001"
```

---

## Troubleshooting

| Problem | Solution |
|---|---|
| `$TS_HOSTNAME` is empty | Re-run: `source ~/.zshrc` or restart your terminal |
| Phone can't reach the URL | Open Tailscale app on phone → make sure toggle is ON. Run `tailscale status` on Mac to verify both devices are connected |
| Phone shows certificate warning | Re-run `tailscale cert $TS_HOSTNAME` — certs may have expired (90-day lifetime) |
| `tailscale cert` fails with "does not support getting TLS certs" | Enable HTTPS certificates in Tailscale admin: https://login.tailscale.com/admin/dns → scroll to "HTTPS Certificates" at the bottom → click "Enable HTTPS" |
| `tailscale cert` fails with "invalid domain" | Make sure `$TS_HOSTNAME` includes the tailnet name (e.g. `johns-macbook.tail99xyz.ts.net`). Re-run Step 1 |
| OAuth redirect fails on phone | Run `echo "https://$TS_HOSTNAME:3001/v1/oauth/github/callback"` and verify it matches what's in GitHub settings |
| First build is very slow | Normal — Docker rebuilds the frontend with the new `VITE_RELAY_API_BASE_URL`. Subsequent builds are cached |
| Relay features (terminal, logs) don't work on phone | Check that `VITE_RELAY_API_BASE_URL` in the command matches your Caddy relay block (`https://$TS_HOSTNAME:8443`) |
| Caddy asks for password | Normal on first run — it installs a local CA certificate. Enter your macOS password |
| `caddy run` fails with "address already in use" | Another Caddy instance is running. Kill it: `pkill caddy`, then retry |
| `ping $TS_HOSTNAME` doesn't resolve | Enable MagicDNS in Tailscale admin: https://login.tailscale.com/admin/dns |
| Dev mode: Vite page loads but API calls fail | Make sure Docker is running (`pnpm remote:dev`) and you're using `Caddyfile.dev` (not `Caddyfile`) |
| Dev mode: hot reload doesn't work on phone | Vite HMR uses WebSocket — verify Caddy is proxying to `localhost:3002` (not `127.0.0.1:3002`). Regenerate `Caddyfile.dev` if needed |
| Dev mode: blank page or 502 on phone | Vite dev server may not be running. Check Terminal 2 is up with `pnpm --filter @vibe/remote-web dev` |

#!/usr/bin/env bash
# create-github-app.sh — Create a unified GitHub App via the manifest flow
#
# Creates a single GitHub App that handles:
#   1. Coder login (OAuth)
#   2. Coder external auth / workspace git ops (OAuth)
#   3. VK Remote login (OAuth)
#   4. Scoped gh CLI in workspaces (installation tokens)
#
# Usage:
#   scripts/infra/create-github-app.sh --domain campoya.com --project CampoYa
#   scripts/infra/create-github-app.sh --domain campoya.com --project CampoYa --org holagence
#   scripts/infra/create-github-app.sh --domain campoya.com --project CampoYa --save-1password
#
# Prerequisites: curl, jq, python3 (for local HTTP server)
# Optional: op (1Password CLI) for credential storage

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TEMPLATE="$SCRIPT_DIR/github-app-manifest.json.template"

# --- Defaults ---
DOMAIN=""
PROJECT=""
ORG=""
SAVE_1P=0
VAULT="Automation / Inbox"
PORT=23847

usage() {
  cat <<EOF
Usage: $(basename "$0") --domain DOMAIN --project PROJECT [OPTIONS]

Required:
  --domain DOMAIN       Base domain (e.g., campoya.com)
  --project PROJECT     Project name for the app (e.g., CampoYa)

Options:
  --org ORG             GitHub org to own the app (default: personal account)
  --save-1password      Save credentials to 1Password vault "$VAULT"
  --port PORT           Local callback port (default: $PORT)
  -h, --help            Show this help
EOF
  exit 1
}

# --- Argument parsing ---
while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain)          DOMAIN="$2";    shift 2 ;;
    --project)         PROJECT="$2";   shift 2 ;;
    --org)             ORG="$2";       shift 2 ;;
    --save-1password)  SAVE_1P=1;      shift ;;
    --port)            PORT="$2";      shift 2 ;;
    -h|--help)         usage ;;
    *) echo "Unknown option: $1" >&2; usage ;;
  esac
done

if [ -z "$DOMAIN" ] || [ -z "$PROJECT" ]; then
  echo "ERROR: --domain and --project are required" >&2
  usage
fi

for cmd in curl jq python3; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "ERROR: $cmd is required but not found" >&2
    exit 1
  fi
done

if [ "$SAVE_1P" -eq 1 ] && ! command -v op >/dev/null 2>&1; then
  echo "ERROR: --save-1password requires 'op' CLI" >&2
  exit 1
fi

# --- Generate manifest from template ---
echo "=== GitHub App Manifest Creation ==="
echo ""
echo "Domain:  $DOMAIN"
echo "Project: $PROJECT"
echo "Org:     ${ORG:-personal account}"
echo ""

if [ ! -f "$TEMPLATE" ]; then
  echo "ERROR: Template not found at $TEMPLATE" >&2
  exit 1
fi

MANIFEST=$(cat "$TEMPLATE" \
  | sed "s/__DOMAIN__/$DOMAIN/g" \
  | sed "s/__PROJECT__/$PROJECT/g")

echo "Manifest generated with callback URLs:"
echo "$MANIFEST" | jq -r '.callback_urls[]' 2>/dev/null
echo ""

# --- Create temporary HTML page that posts the manifest ---
TMPDIR=$(mktemp -d)
cleanup() { kill "$SERVER_PID" 2>/dev/null || true; rm -rf "$TMPDIR"; }
trap cleanup EXIT
SERVER_PID=""

MANIFEST_JSON=$(echo "$MANIFEST" | jq -c '.')

if [ -n "$ORG" ]; then
  GITHUB_URL="https://github.com/organizations/$ORG/settings/apps/new"
else
  GITHUB_URL="https://github.com/settings/apps/new"
fi

# Write manifest to a separate file — the HTML loads it via fetch to avoid escaping issues
echo "$MANIFEST_JSON" > "$TMPDIR/manifest.json"

cat > "$TMPDIR/index.html" <<'HTMLEOF'
<!DOCTYPE html>
<html>
<head><title>Create GitHub App</title></head>
<body>
  <h2 id="title">Creating GitHub App...</h2>
  <p>Click the button below to create the app on GitHub.</p>
  <form id="form" method="post">
    <input type="hidden" id="manifest" name="manifest" value="">
    <input type="submit" value="Create GitHub App" style="font-size: 18px; padding: 12px 24px; cursor: pointer;">
  </form>
  <p><small>This will redirect you to GitHub. After you click "Create GitHub App" on GitHub, you'll be redirected back here to complete setup.</small></p>
  <script>
    fetch('/manifest.json')
      .then(r => r.text())
      .then(json => {
        document.getElementById('manifest').value = json;
        document.getElementById('form').action = document.body.dataset.url;
      });
  </script>
</body>
</html>
HTMLEOF

# Inject the GitHub URL as a data attribute (safe — no JSON escaping needed)
sed -i "s|<body>|<body data-url=\"$GITHUB_URL\">|" "$TMPDIR/index.html"

# --- Python HTTP server that catches the redirect ---
cat > "$TMPDIR/server.py" <<'PYEOF'
import http.server
import urllib.parse
import json
import sys
import os

PORT = int(sys.argv[1])
RESULT_FILE = sys.argv[2]

class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(parsed.query)

        if self.path == "/" or self.path == "/index.html":
            with open(os.path.join(os.path.dirname(__file__), "index.html")) as f:
                content = f.read()
            self.send_response(200)
            self.send_header("Content-Type", "text/html")
            self.end_headers()
            self.wfile.write(content.encode())
            return

        if self.path == "/manifest.json":
            with open(os.path.join(os.path.dirname(__file__), "manifest.json")) as f:
                content = f.read()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(content.encode())
            return

        if "/callback" in self.path and "code" in params:
            code = params["code"][0]
            with open(RESULT_FILE, "w") as f:
                f.write(code)
            self.send_response(200)
            self.send_header("Content-Type", "text/html")
            self.end_headers()
            self.wfile.write(b"""
              <html><body>
              <h2>GitHub App created!</h2>
              <p>Exchanging code for credentials... check your terminal.</p>
              </body></html>
            """)
            # Shutdown after handling
            import threading
            threading.Thread(target=self.server.shutdown).start()
            return

        self.send_response(404)
        self.end_headers()

    def log_message(self, format, *args):
        pass  # suppress logs

import socketserver
class ReusableServer(socketserver.TCPServer):
    allow_reuse_address = True
    allow_reuse_port = True

server = ReusableServer(("127.0.0.1", PORT), Handler)
print(f"Listening on http://localhost:{PORT}", file=sys.stderr)
server.serve_forever()
PYEOF

CODE_FILE="$TMPDIR/code.txt"

# Kill any stale server on this port from a previous run
STALE_PID=$(lsof -ti:"$PORT" 2>/dev/null || true)
if [ -n "$STALE_PID" ]; then
  echo "Killing stale process on port $PORT (PID $STALE_PID)..."
  kill "$STALE_PID" 2>/dev/null || true
  sleep 1
fi

echo "Starting local server on http://localhost:$PORT ..."
echo ""
echo ">>> Open your browser to: http://localhost:$PORT"
echo ">>> Click 'Create GitHub App', then 'Create GitHub App' again on GitHub."
echo ">>> You'll be redirected back automatically."
echo ""

python3 "$TMPDIR/server.py" "$PORT" "$CODE_FILE" &
SERVER_PID=$!

# Try to open browser automatically
if command -v xdg-open >/dev/null 2>&1; then
  xdg-open "http://localhost:$PORT" 2>/dev/null || true
elif command -v open >/dev/null 2>&1; then
  open "http://localhost:$PORT" 2>/dev/null || true
fi

# Wait for the server to finish (redirect received)
wait "$SERVER_PID" 2>/dev/null || true

if [ ! -f "$CODE_FILE" ]; then
  echo "ERROR: No authorization code received. Did you complete the GitHub flow?" >&2
  exit 1
fi

CODE=$(cat "$CODE_FILE")
echo ""
echo "Got authorization code. Exchanging for credentials..."

# --- Exchange code for app credentials ---
RESPONSE=$(curl -s -X POST \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/app-manifests/$CODE/conversions")

APP_ID=$(echo "$RESPONSE" | jq -r '.id // empty')
APP_NAME=$(echo "$RESPONSE" | jq -r '.name // empty')
CLIENT_ID=$(echo "$RESPONSE" | jq -r '.client_id // empty')
CLIENT_SECRET=$(echo "$RESPONSE" | jq -r '.client_secret // empty')
PEM=$(echo "$RESPONSE" | jq -r '.pem // empty')
WEBHOOK_SECRET=$(echo "$RESPONSE" | jq -r '.webhook_secret // empty')

if [ -z "$APP_ID" ] || [ -z "$CLIENT_ID" ] || [ -z "$PEM" ]; then
  echo "ERROR: Failed to exchange code for credentials" >&2
  echo "$RESPONSE" | jq '.' >&2 2>/dev/null || echo "$RESPONSE" >&2
  exit 1
fi

PEM_B64=$(echo "$PEM" | base64 -w0 2>/dev/null || echo "$PEM" | base64 | tr -d '\n')

echo ""
echo "=== GitHub App Created Successfully ==="
echo ""
echo "  App Name:      $APP_NAME"
echo "  App ID:        $APP_ID"
echo "  Client ID:     $CLIENT_ID"
echo "  Client Secret: ${CLIENT_SECRET:0:8}..."
echo "  PEM Key:       (${#PEM} chars, base64: ${#PEM_B64} chars)"
echo "  Webhook Secret: ${WEBHOOK_SECRET:0:8}..."
echo ""
echo "=== Environment Variables for provision-server.env ==="
echo ""
echo "  # Unified GitHub App — replaces 3 separate OAuth Apps"
echo "  GITHUB_OAUTH_CLIENT_ID=$CLIENT_ID"
echo "  GITHUB_OAUTH_CLIENT_SECRET=${CLIENT_SECRET:0:8}... (use 1Password or app settings page)"
echo "  GITHUB_EXT_CLIENT_ID=$CLIENT_ID"
echo "  GITHUB_EXT_CLIENT_SECRET=(same as above)"
echo "  GITHUB_APP_ID=$APP_ID"
echo "  GITHUB_APP_PRIVATE_KEY_B64=(${#PEM_B64} chars — stored in 1Password)"
echo ""
echo "  # For VK Remote (uses same OAuth credentials)"
echo "  # Set in Dokploy Environment tab for VK Remote service"
echo ""

# --- Save to 1Password ---
if [ "$SAVE_1P" -eq 1 ]; then
  echo "Saving to 1Password vault: $VAULT ..."

  if [ -z "${OP_SERVICE_ACCOUNT_TOKEN:-}" ] && [ -f "$HOME/.config/op/service_account_token" ]; then
    export OP_SERVICE_ACCOUNT_TOKEN=$(cat "$HOME/.config/op/service_account_token")
  fi

  ITEM_NAME="GitHub App: HoliCode Agent ($PROJECT)"

  ITEM_ID=$(op item create \
    --vault "$VAULT" \
    --category "API Credential" \
    --title "$ITEM_NAME" \
    --tags "github-app,holicode,$(echo "$PROJECT" | tr '[:upper:]' '[:lower:]')" \
    "app_id=$APP_ID" \
    "app_name=$APP_NAME" \
    "client_id=$CLIENT_ID" \
    "client_secret[password]=$CLIENT_SECRET" \
    "domain=$DOMAIN" \
    "callback_urls=coder-login: https://coder.$DOMAIN/api/v2/users/oauth2/github/callback, coder-ext: https://coder.$DOMAIN/external-auth/github/callback, vk-remote: https://vk-remote.$DOMAIN/api/auth/github/callback" \
    --format json 2>/dev/null | jq -r '.id // empty')

  if [ -n "$ITEM_ID" ]; then
    op item edit "$ITEM_ID" \
      "private_key_b64[password]=$PEM_B64" \
      "webhook_secret[password]=$WEBHOOK_SECRET" \
      2>/dev/null && echo "  Saved to 1Password: $ITEM_NAME" || echo "  WARNING: Could not add private key to 1Password item"
  else
    echo "  WARNING: 1Password save failed — store credentials manually"
  fi
  echo ""
fi

echo "=== Next Steps ==="
echo ""
echo "1. Install the app on your GitHub account:"
echo "   https://github.com/apps/$(echo "$APP_NAME" | tr '[:upper:]' '[:lower:]' | tr ' ' '-')/installations/new"
echo ""
echo "2. Select the repositories you want agents to access"
echo ""
echo "3. Copy the Installation ID from the URL after install"
echo "   (github.com/settings/installations/<ID>)"
echo ""
echo "4. Add credentials to your .env file or Dokploy Environment tabs"
echo ""
echo "5. The SAME client_id/secret is used for ALL THREE OAuth flows:"
echo "   - Coder login (GITHUB_OAUTH_CLIENT_ID/SECRET)"
echo "   - Coder external auth (GITHUB_EXT_CLIENT_ID/SECRET)"
echo "   - VK Remote (GITHUB_OAUTH_CLIENT_ID/SECRET in VK compose)"
echo ""

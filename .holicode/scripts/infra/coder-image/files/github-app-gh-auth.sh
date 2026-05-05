#!/usr/bin/env bash
# Authenticate gh CLI using a GitHub App installation token.
# Reads GITHUB_APP_ID, GITHUB_APP_INSTALLATION_ID, GITHUB_APP_PRIVATE_KEY_B64 from env.
set -euo pipefail

if gh auth status >/dev/null 2>&1; then
  echo "gh CLI already authenticated — skipping."
  exit 0
fi

[[ -n "${GITHUB_APP_ID:-}" && -n "${GITHUB_APP_INSTALLATION_ID:-}" && -n "${GITHUB_APP_PRIVATE_KEY_B64:-}" ]] || {
  echo "GitHub App env vars missing — falling back to manual: gh auth login" >&2
  exit 1
}

KEY_FILE=$(mktemp)
trap 'rm -f "$KEY_FILE"' EXIT
echo "$GITHUB_APP_PRIVATE_KEY_B64" | base64 -d > "$KEY_FILE"

b64url() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }
NOW=$(date +%s)
JWT_HEADER=$(printf '{"alg":"RS256","typ":"JWT"}' | b64url)
JWT_PAYLOAD=$(printf '{"iat":%d,"exp":%d,"iss":"%s"}' $((NOW-10)) $((NOW+540)) "$GITHUB_APP_ID" | b64url)
JWT_SIG=$(printf '%s.%s' "$JWT_HEADER" "$JWT_PAYLOAD" | openssl dgst -sha256 -sign "$KEY_FILE" -binary | b64url)
JWT="${JWT_HEADER}.${JWT_PAYLOAD}.${JWT_SIG}"

TOKEN=$(curl -sfS -X POST \
  -H "Authorization: Bearer $JWT" \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/app/installations/${GITHUB_APP_INSTALLATION_ID}/access_tokens" | jq -r '.token // empty')

[[ -n "$TOKEN" ]] || { echo "Failed to mint installation token" >&2; exit 1; }

echo "$TOKEN" | gh auth login --with-token
gh auth setup-git
echo "gh CLI authenticated via GitHub App (token expires ~1h)"

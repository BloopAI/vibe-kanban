# Relay Test Client

Standalone browser client for testing relay path routing without modifying the
Remote frontend UX.

## Run

From repo root:

```bash
python3 -m http.server 8787 --directory scripts/relay-test-client
```

Open:

`http://127.0.0.1:8787/index.html`

## Auth

- `Remote API Base` (example: `https://localhost:3001`)
- `Relay API Base` (example: `https://relay.localhost:3001`)
- Use **Sign In (GitHub)** or **Sign In (Google)** to authenticate directly in
  the standalone client.
- Enter the host pairing code shown in the local backend logs after relay
  startup (`Relay PAKE enrollment code ready`).
- Tokens are stored in browser localStorage:
  - `relay_test_access_token`
  - `relay_test_refresh_token`
- Manual token override is still supported in the token textarea.

This client intentionally does **not** auto-refresh tokens. If a token expires,
sign in again.

## What It Tests

1. `POST {remote_api}/v1/hosts/{host_id}/sessions`
2. `POST {relay_api}/v1/relay/sessions/{session_id}/auth-code`
3. `GET {relay_url}/relay/h/{host_id}/exchange?code=...` (follow redirect)
4. `POST {relay_session_prefix}/api/relay-auth/spake2/start`
5. `POST {relay_session_prefix}/api/relay-auth/spake2/finish`
6. Signed `GET {relay_session_prefix}/api/task-attempts`

The output includes the derived relay session prefix and full local backend
response payload.

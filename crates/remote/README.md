# Remote Service

The `remote` crate contains the hosted API and web app.

## Local Setup

Create `crates/remote/.env.remote`:

```env
# Required
VIBEKANBAN_REMOTE_JWT_SECRET=replace_with_openssl_rand_base64_48
ELECTRIC_ROLE_PASSWORD=replace_with_secure_password

# Configure at least one auth option
GITHUB_OAUTH_CLIENT_ID=
GITHUB_OAUTH_CLIENT_SECRET=
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=

# Or use bootstrap local auth for self-hosting
SELF_HOST_LOCAL_AUTH_EMAIL=
SELF_HOST_LOCAL_AUTH_PASSWORD=

# Optional
PUBLIC_BASE_URL=http://localhost:3000
VITE_RELAY_API_BASE_URL=http://localhost:8082
VITE_PUBLIC_REACT_VIRTUOSO_LICENSE_KEY=
LOOPS_EMAIL_API_KEY=

# Loops transactional email template IDs (optional — defaults are the upstream templates).
# Override these with your own Loops account template IDs if using a custom Loops account.
LOOPS_INVITE_TEMPLATE_ID=cmhvy2wgs3s13z70i1pxakij9
LOOPS_REVIEW_READY_TEMPLATE_ID=cmj47k5ge16990iylued9by17
LOOPS_REVIEW_FAILED_TEMPLATE_ID=cmj49ougk1c8s0iznavijdqpo
```

Generate the JWT secret once:

```bash
openssl rand -base64 48
```

## Run

From the repo root:

```bash
pnpm run remote:dev
```

Full stack with relay and local attachment storage:

```bash
pnpm run remote:dev:full
```

Equivalent manual command:

```bash
cd crates/remote
docker compose --env-file .env.remote up --build
```

This starts:

- `remote-db`
- `remote-server`
- `electric`

Default endpoints:

- Remote web UI/API: `http://localhost:3000`
- Postgres: `postgres://remote:remote@localhost:5433/remote`

## Optional Profiles

Enable relay support:

```bash
cd crates/remote
docker compose --env-file .env.remote --profile relay up --build
```

Enable local attachment storage with Azurite:

```bash
cd crates/remote
docker compose --env-file .env.remote --profile attachments up --build
```

Enable both:

```bash
cd crates/remote
docker compose --env-file .env.remote --profile relay --profile attachments up --build
```

Additional endpoint with the `relay` profile:

- Relay API: `http://localhost:8082`

## Local HTTPS with Caddy (Optional)

Use [Caddy](https://caddyserver.com) as a reverse proxy to terminate TLS locally. A `Caddyfile.example` is provided in the repository root.

### Install Caddy

```bash
# macOS
brew install caddy

# Debian/Ubuntu
sudo apt install caddy
```

### Start Caddy

In a separate terminal from the repo root:

```bash
caddy run --config Caddyfile.example
```

The first time Caddy runs it installs a local CA certificate — you may be prompted for your password.

This gives you:

- `https://localhost:3001` → remote web UI/API
- `https://relay.localhost:3001` → relay API (requires `relay` profile)

Update your OAuth callback URLs accordingly:

- **GitHub**: `https://localhost:3001/v1/oauth/github/callback`
- **Google**: `https://localhost:3001/v1/oauth/google/callback`

### Test relay tunnel end-to-end

```bash
export VK_SHARED_API_BASE=https://localhost:3001
export VK_SHARED_RELAY_API_BASE=https://relay.localhost:3001

pnpm run dev
```

Quick checks:

```bash
curl -sk https://localhost:3001/v1/health
curl -sk https://relay.localhost:3001/health
```

If the relay health endpoint returns HTML instead of `{"status":"ok"}`, your Caddy host routing is incorrect.

## Desktop App

To run the desktop/local app against this remote stack:

```bash
export VK_SHARED_API_BASE=http://localhost:3000
pnpm run dev
```

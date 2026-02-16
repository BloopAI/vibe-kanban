# Remote service

The `remote` crate contains the implementation of the Vibe Kanban hosted API.

## Prerequisites

Create a `.env.remote` file in the repository root:

```env
# Required — generate with: openssl rand -base64 48
VIBEKANBAN_REMOTE_JWT_SECRET=your_base64_encoded_secret

# Required — password for the electric_sync database role used by ElectricSQL
ELECTRIC_ROLE_PASSWORD=your_secure_password

# OAuth — at least one provider (GitHub or Google) must be configured
GITHUB_OAUTH_CLIENT_ID=your_github_web_app_client_id
GITHUB_OAUTH_CLIENT_SECRET=your_github_web_app_client_secret
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=

# Optional — leave empty to disable invitation emails
LOOPS_EMAIL_API_KEY=
```

Generate `VIBEKANBAN_REMOTE_JWT_SECRET` once using `openssl rand -base64 48` and copy the value into `.env.remote`.

## Run the stack locally

```bash
docker compose --env-file ../../.env.remote -f docker-compose.yml up --build
```

This starts PostgreSQL, ElectricSQL, and the Remote Server. The web UI and API are exposed on `http://localhost:3000` (mapped from internal port 8081). Postgres is available at `postgres://remote:remote@localhost:5433/remote`.

## Run Vibe Kanban

To connect the desktop client to your local remote server:

```bash
export VK_SHARED_API_BASE=http://localhost:3000

pnpm run dev
```

## Local HTTPS with Caddy

By default the stack runs on plain HTTP. You can use [Caddy](https://caddyserver.com) as a reverse proxy to serve it over HTTPS. When you use `localhost` as the site address, Caddy automatically provisions a locally-trusted certificate.

### 1. Install Caddy

```bash
# macOS
brew install caddy

# Debian/Ubuntu
sudo apt install caddy
```

### 2. Create a Caddyfile

Create a `Caddyfile` in the repository root:

```text
localhost {
    reverse_proxy 127.0.0.1:3000
}
```

### 3. Override the public URLs

The default `docker-compose.yml` hardcodes the public URLs to `http://localhost:3000`. Create a `docker-compose.override.yml` in `crates/remote/` to switch them to HTTPS:

```yaml
services:
  remote-server:
    environment:
      SERVER_PUBLIC_BASE_URL: https://localhost
```

Docker Compose automatically merges this with `docker-compose.yml`.

### 4. Update OAuth callback URLs

Update your OAuth application to use `https://localhost` instead of `http://localhost:3000`:

- **GitHub**: `https://localhost/v1/oauth/github/callback`
- **Google**: `https://localhost/v1/oauth/google/callback`

### 5. Start everything

Start Docker services as usual, then start Caddy in a separate terminal:

```bash
# Terminal 1 — start the stack
cd crates/remote
docker compose --env-file ../../.env.remote -f docker-compose.yml up --build

# Terminal 2 — start Caddy (from repo root)
caddy run --config Caddyfile
```

The first time Caddy runs it installs a local CA certificate — you may be prompted for your password.

Open **https://localhost** in your browser.

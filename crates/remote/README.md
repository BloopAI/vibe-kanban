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
GOOGLE_OAUTH_CLIENT_ID=your_google_web_app_client_id
GOOGLE_OAUTH_CLIENT_SECRET=your_google_web_app_client_secret

# Optional — leave empty to disable invitation emails
LOOPS_EMAIL_API_KEY=
```

Generate `VIBEKANBAN_REMOTE_JWT_SECRET` once using `openssl rand -base64 48` and copy the value into `.env.remote`.

## Run the stack locally

```bash
docker compose --env-file ../../.env.remote -f docker-compose.yml up --build
```

Exposes the web UI and API on `http://localhost:3000` (mapped from internal port 8081). The Postgres service is available at `postgres://remote:remote@localhost:5433/remote`.

## Run Vibe Kanban

To connect the desktop client to your local remote server:

```bash
export VK_SHARED_API_BASE=http://localhost:3000

pnpm run dev
```

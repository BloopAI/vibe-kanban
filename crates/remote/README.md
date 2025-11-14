# Remote service

The `remote` crate contains the implementation of the Vibe Kanban hosted API.

## Prerequisites

Create a `.env.remote` file in the repository root:

```env
VIBEKANBAN_REMOTE_JWT_SECRET=your_base64_encoded_secret
SERVER_PUBLIC_BASE_URL=http://localhost:3000
GITHUB_OAUTH_CLIENT_ID=your_github_web_app_client_id
GITHUB_OAUTH_CLIENT_SECRET=your_github_web_app_client_secret
GOOGLE_OAUTH_CLIENT_ID=your_google_web_app_client_id
GOOGLE_OAUTH_CLIENT_SECRET=your_google_web_app_client_secret
```

Generate `VIBEKANBAN_REMOTE_JWT_SECRET` once using `openssl rand -base64 48` and copy the value into `.env.remote`.

At least one OAuth provider (GitHub or Google) must be configured.

## Run the stack locally 

```bash
docker compose --env-file .env.remote -f docker-compose.yml up --build
```
Exposes the API on `http://localhost:8081`. The Postgres service is available at `postgres://remote:remote@localhost:5432/remote`.

## Run Vibe Kanban 

```bash
export VK_SHARED_API_BASE=http://localhost:8081

pnpm run dev
```

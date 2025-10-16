# Remote service

The `remote` crate contains the implementation of the Vibe Kanban hosted API.

## Prerequisites

Create a `.env.remote` file in the repository root:

```env
CLERK_SECRET_KEY=sk_live_...
CLERK_ISSUER=https://<tenant>.clerk.accounts.dev
CLERK_API_URL=https://api.clerk.com
```

## Run the stack locally 

```bash
docker compose --env-file .env.remote -f docker-compose.yml up --build
```
Exposes the API on `http://localhost:8081`. The Postgres service is available at `postgres://remote:remote@localhost:5432/remote`.

## Run Vibe Kanban 

```bash
export VK_SHARED_API_BASE=http://localhost:8081
export VK_SHARED_WS_URL=ws://localhost:8081/v1/ws

pnpm run dev
```


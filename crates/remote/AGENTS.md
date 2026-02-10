# Remote Crate — Agent Guidelines

The `remote` crate is the hosted Vibe Kanban Cloud server: an Axum HTTP API, a React SPA frontend, and real-time sync via ElectricSQL.

> See also: [root AGENTS.md](../../AGENTS.md) for repo-wide conventions.

## Architecture

```
remote-server (Axum, port 8081)
  ├── /v1/*         REST API (CRUD + auth + webhooks)
  ├── /shape/*      ElectricSQL proxy (auth-gated shape subscriptions)
  └── /srv/static   React SPA (built by Vite, served as fallback)

PostgreSQL (port 5432)
  └── wal_level=logical, electric_sync role with REPLICATION

ElectricSQL (port 3000, internal)
  └── Subscribes to Postgres via logical replication, streams shapes over HTTP
```

## Build & Run

```bash
# Local stack (from crates/remote/)
docker compose --env-file ../../.env.remote -f docker-compose.yml up --build

# Run desktop client against local server
export VK_SHARED_API_BASE=http://localhost:3000
pnpm run dev
```

Multi-stage Docker build: Node (frontend) → Rust (server) → Debian slim runtime.

The billing crate (`vk-billing` feature) is a private dependency stripped at build time when `FEATURES` is empty. Do not add imports from the `billing` crate without gating them behind `#[cfg(feature = "vk-billing")]`.

## Key Modules

| Module | Purpose |
|--------|---------|
| `app.rs` | Server bootstrap: pool → migrations → electric role → JWT → OAuth → services → listen |
| `config.rs` | `RemoteServerConfig` parsed from env vars. Empty strings treated as unset. |
| `state.rs` | `AppState` shared across all routes (pool, JWT, OAuth, billing, R2, etc.) |
| `shapes.rs` | 16 const `ShapeDefinition<T>` instances for ElectricSQL sync |
| `shape_definition.rs` | `ShapeDefinition` struct, `ShapeExport` trait, `define_shape!` macro |
| `mutation_definition.rs` | `MutationBuilder` for type-safe CRUD routes + TS type generation |
| `response.rs` | `MutationResponse<T>` — wraps data + Postgres `txid` |
| `routes/electric_proxy.rs` | Auth-gated proxy forwarding shape requests to ElectricSQL |
| `routes/mod.rs` | Router tree, SPA fallback from `/srv/static` |
| `db/mod.rs` | Pool creation, migrations, `ensure_electric_role_password()` |
| `auth/` | JWT, OAuth providers (GitHub/Google), session middleware |

## ElectricSQL Integration

Vibe Kanban uses [ElectricSQL](https://electric-sql.com) as a read-path sync engine: Postgres → ElectricSQL → clients over HTTP shapes. Writes go through the REST API.

### How It Works

1. **Shapes** are single-table subscriptions with optional `WHERE`/`columns` filters, defined as constants in `shapes.rs`.
2. The **electric proxy** (`routes/electric_proxy.rs`) checks org/project membership, then forwards shape requests to the internal ElectricSQL service.
3. **Mutations** (create/update/delete) go through REST endpoints and return `MutationResponse<T>` containing the Postgres transaction ID (`txid`).
4. The frontend uses `txid` to know when Electric has caught up — once the mutation appears in the Electric stream, optimistic state is dropped.

### The txid Handshake

Every mutation handler must return the Postgres transaction ID:

```rust
// In a route handler
let result = db::issues::create_issue(&pool, &payload).await?;
// MutationResponse includes txid from pg_current_xact_id()
Ok(Json(MutationResponse { data: result.data, txid: result.txid }))
```

The frontend awaits this txid on the Electric stream before dropping optimistic state. Omitting the txid causes UI flicker.

### Adding a New Synced Table

1. **Create a migration** that creates the table and calls `ALTER TABLE ... REPLICA IDENTITY FULL` + `CALL electric.electrify('table_name')` (see `20260114000000_electric_sync_tables.sql` for examples).
2. **Define a shape** in `shapes.rs` using the `define_shape!` macro. Shapes are parameterised by scope (organization, project, issue).
3. **Add a proxy route** if the shape needs a new scope pattern in `electric_proxy.rs`.
4. **Return txid** from all mutation routes for that table.

### Postgres Requirements for ElectricSQL

- PostgreSQL 14+ with `wal_level=logical`
- The `electric_sync` role must have `LOGIN` and `REPLICATION` privileges
- The role is created by migration; its password is set at startup by `ensure_electric_role_password()` using the `ELECTRIC_ROLE_PASSWORD` env var
- ElectricSQL connects as `electric_sync`, not the main `remote` user
- Deploy the remote server first (to run migrations and create the role) before starting ElectricSQL

### Security

- **ElectricSQL is internal only** — never expose it directly to clients. All shape requests go through the auth-gated proxy in `electric_proxy.rs`.
- Shape definitions (table, WHERE, columns) are server-controlled constants. The client cannot request arbitrary tables.

## Mutation Pattern

All CRUD routes follow a consistent pattern using `MutationBuilder`:

```rust
MutationBuilder::<Entity, CreatePayload, UpdatePayload>::new("entities")
    .list(list_handler)
    .get(get_handler)
    .create(create_handler)
    .update(update_handler)
    .delete(delete_handler)
    .build()
```

This generates both the Axum router and TypeScript type metadata (via `HasJsonPayload<T>` trait). When adding a new entity, follow this pattern so types are auto-generated by `pnpm run generate-types`.

## Authentication & Authorisation

- **JWT** (`auth/jwt.rs`): Signed with `VIBEKANBAN_REMOTE_JWT_SECRET`. All protected routes use `require_session` middleware.
- **OAuth** (`auth/provider.rs`): GitHub and Google. At least one must be configured. Empty env vars are treated as disabled.
- **Membership**: All resource routes check organisation/project membership before DB access. Use `RequestContext` from the middleware to get user info.

## Environment Variables

**Required:**
- `VIBEKANBAN_REMOTE_JWT_SECRET` — base64 JWT secret (`openssl rand -base64 48`)
- `ELECTRIC_ROLE_PASSWORD` — password for the `electric_sync` database role
- `SERVER_DATABASE_URL` — Postgres connection string
- At least one of `GITHUB_OAUTH_CLIENT_ID`/`SECRET` or `GOOGLE_OAUTH_CLIENT_ID`/`SECRET`

**Optional (empty string = disabled):**
- `LOOPS_EMAIL_API_KEY` — email invitations
- `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_REVIEW_ENDPOINT`, `R2_REVIEW_BUCKET` — Cloudflare R2 storage
- `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_APP_WEBHOOK_SECRET` — GitHub App integration
- `STRIPE_SECRET_KEY`, `STRIPE_TEAM_SEAT_PRICE_ID`, `STRIPE_WEBHOOK_SECRET` — billing (requires `vk-billing` feature)

When parsing optional env vars, use the `Ok(v) if !v.is_empty()` pattern — Docker Compose `${VAR:-}` sets empty strings, not unset vars.

## Frontend (`remote-frontend/`)

- React 18 + React Router 7 + Vite + Tailwind
- Built during Docker image creation, served from `/srv/static`
- Uses `VITE_APP_BASE_URL` and `VITE_API_BASE_URL` (baked in at build time)
- OAuth uses PKCE flow (`pkce.ts`)
- ElectricSQL shapes consumed via the proxy at `/shape/*`

## Database

- **Migrations**: SQLx-managed in `migrations/`, run at startup. Add new migrations with timestamp prefix.
- **Offline mode**: Use `pnpm run remote:prepare-db` to generate SQLx offline data for CI builds.
- **Pool**: 10 max connections.

## Testing

```bash
cargo test --manifest-path crates/remote/Cargo.toml
```

SQLx compile-time checks require either a running Postgres or offline query data (`.sqlx/` directory).

## Common Pitfalls

- **Empty string vs unset**: Docker Compose `${VAR:-}` produces `""`, which `std::env::var()` returns as `Ok("")`. Always check `!v.is_empty()` for optional config.
- **ElectricSQL startup order**: Remote server must start first to create the `electric_sync` role. ElectricSQL will fail to connect if it starts before the server runs migrations.
- **Billing feature gate**: All billing code must be behind `#[cfg(feature = "vk-billing")]`. The `billing` crate is stripped from Cargo.toml during self-hosted Docker builds.
- **Frontend URL vars are build-time**: `VITE_*` variables are baked into the JS bundle. Changing them requires a rebuild.
- **SPA fallback path**: The frontend is served from `/srv/static` (hardcoded). This path only exists inside the Docker container.

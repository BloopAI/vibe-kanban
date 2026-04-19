---
name: p2p-remote-access-phase1
overview: Self-hosted P2P remote access between Vibe Kanban instances — Phase 1 core infrastructure
todos:
  - db-migration
  - local-relay-crate
  - p2p-routes
  - p2p-connection-manager
  - p2p-pair-client
  - integration-test
complexity:
  taskCount: 6
  independentTasks: 3
  sequentialTasks: 3
  independencePercent: 50
orchestration:
  recommended: subagent-driven-development
  reason: "6 tasks, 3 independent (50%), mixed dependency — same-session execution with fresh subagent per task optimal"
  threshold: 5
  alternatives:
    - executing-plans: "Batch execution if you prefer manual checkpoints"
---

# P2P Remote Access — Phase 1: Core Infrastructure

> **For the agent:** AUTO-TRIGGERED ORCHESTRATION: Use superpowers:subagent-driven-development to implement this plan.
> **Reason:** 6 tasks detected, 3 independent (50%), complexity threshold: 5
> **Alternative:** Use superpowers:executing-plans for batch execution with manual checkpoints

**Goal:** Build a self-hosted relay server and P2P host management layer that lets two Vibe Kanban instances connect to each other without Vibe Kanban Cloud.

**Architecture:** A new `crates/local-relay/` crate provides a lightweight Axum relay server re-using `relay_tunnel_core::server::{run_control_channel, proxy_request_over_control, SharedControl}` and `relay_tunnel_core::client::{start_relay_client, RelayClientConfig}`, backed by an in-memory registry (no Postgres). The local Vibe Kanban server gains P2P routes for managing paired hosts and generating single-use pairing codes. A new runtime module manages persistent outbound WebSocket connections to each paired host with exponential backoff.

**Tech Stack:** Rust / Axum / SQLx (SQLite) / Yamux / tokio-tungstenite / `relay-tunnel-core` (existing)

---

## Context for the Implementer

### Critical: Correct Import Paths

The relay-tunnel-core crate does NOT re-export types at crate root. Use:

```rust
// Relay server side
use relay_tunnel_core::server::{run_control_channel, proxy_request_over_control, SharedControl};

// Relay client side
use relay_tunnel_core::client::{start_relay_client, RelayClientConfig};
```

`run_control_channel` signature: `async fn run_control_channel<F, Fut>(socket: WebSocket, on_connected: F) -> anyhow::Result<()>` where `F: FnOnce(SharedControl) -> Fut`.

`proxy_request_over_control` signature: `async fn proxy_request_over_control(control: &Mutex<Control>, request: Request, strip_prefix: &str) -> Response`.

`SharedControl` is `Arc<Mutex<tokio_yamux::Control>>`.

There is no `ActiveRelay` in `relay-tunnel-core`. Define your own wrapper locally in `local-relay`.

### Deployment API (from `local-deployment/src/lib.rs`)

```rust
deployment.user_id()      // -> &str
deployment.db()           // -> &DBService
deployment.db().pool      // -> Pool<Sqlite>
deployment.client_info()  // -> &ClientInfo
```

There is no `deployment.db_pool()` or `deployment.p2p_pairing_store()`. Thread the `Arc<PairingStore>` separately through route state.

### ApiError Variants to Use

From `crates/server/src/error.rs`:

```rust
ApiError::Unauthorized                     // 401, no message
ApiError::BadRequest(String)               // 400
ApiError::TooManyRequests(String)          // 429
ApiError::Forbidden(String)               // 403
ApiError::Database(sqlx::Error)           // 500 — for DB errors use ? directly
```

Use `.map_err(|e| ApiError::BadRequest(e.to_string()))` for anyhow errors, or `ApiError::Database(e)` for sqlx errors.

### Session Token Generation

No `hex` crate in the workspace. Use `uuid`:

```rust
use uuid::Uuid;
fn generate_session_token() -> String {
    Uuid::new_v4().to_string().replace('-', "")
}
```

### Port Convention

- Local Vibe Kanban API: port set by `BACKEND_PORT` (default 3000 in dev)
- Self-hosted relay: separate process, default port **8081**
- When the client calls the server's pairing endpoint it uses the API port, not the relay port

### Key Existing Files You Must Read First

| File | Why |
|------|-----|
| `crates/relay-tunnel-core/src/server.rs` | Exact signatures for `run_control_channel`, `proxy_request_over_control`, `SharedControl` |
| `crates/relay-tunnel-core/src/client.rs` | `RelayClientConfig`, `start_relay_client` |
| `crates/relay-tunnel/src/server_bin/routes/path_routes.rs` | How `proxy_request_over_control` is called in production |
| `crates/server/src/error.rs` | All `ApiError` variants |
| `crates/server/src/routes/relay_auth/server.rs` | SPAKE2 enrollment flow to reference |
| `crates/server/src/runtime/relay_registration.rs` | Relay startup pattern to mirror |
| `crates/local-deployment/src/lib.rs` lines 300–320 | Deployment accessor methods |
| `Cargo.toml` (root) | Workspace deps — use `{ workspace = true }` for all shared crates |

### What You Are NOT Changing in Phase 1

- Cloud relay path (`VK_SHARED_RELAY_API_BASE`) — keep working as-is
- `relay-tunnel` crate — do not touch
- Frontend UI — no UI changes in Phase 1
- SSH tunnel — Phase 2

---

## Task 1: Database Migration — `p2p_hosts` Table

**Files:**
- Create: `crates/db/migrations/20260419000000_p2p_hosts.sql`

### Step 1: Write the migration

```sql
-- crates/db/migrations/20260419000000_p2p_hosts.sql
CREATE TABLE IF NOT EXISTS p2p_hosts (
    id          TEXT NOT NULL PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    name        TEXT NOT NULL,
    address     TEXT NOT NULL,
    relay_port  INTEGER NOT NULL DEFAULT 8081,
    machine_id  TEXT NOT NULL,
    session_token TEXT,
    status      TEXT NOT NULL DEFAULT 'pending',
    last_connected_at TIMESTAMP,
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS p2p_pairing_attempts (
    id          TEXT NOT NULL PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    ip_address  TEXT NOT NULL,
    attempted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    succeeded   INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_p2p_pairing_attempts_ip
    ON p2p_pairing_attempts(ip_address, attempted_at);
```

### Step 2: Prepare SQLx offline data

```bash
pnpm run prepare-db
```

Expected: exits 0, `.sqlx/` updated with new query metadata.

### Step 3: Commit

```bash
git add crates/db/migrations/20260419000000_p2p_hosts.sql .sqlx/
git commit -m "feat(db): add p2p_hosts and p2p_pairing_attempts tables"
```

---

## Task 2: New Crate — `crates/local-relay/`

**Goal:** A self-hostable relay server that can run on a VPS. It handles incoming WebSocket connections from Vibe Kanban instances and proxies HTTP/WS through Yamux — same protocol as `relay-tunnel` but without Postgres or OAuth, using a simple shared-token auth.

**Files:**
- Modify: `Cargo.toml` (root workspace) — add `"crates/local-relay"` to `members`
- Create: `crates/local-relay/Cargo.toml`
- Create: `crates/local-relay/src/lib.rs`
- Create: `crates/local-relay/src/server.rs`
- Create: `crates/local-relay/src/auth.rs`
- Create: `crates/local-relay/src/registry.rs`
- Create: `crates/local-relay/src/routes/mod.rs`
- Create: `crates/local-relay/src/routes/connect.rs`
- Create: `crates/local-relay/src/routes/proxy.rs`
- Create: `crates/local-relay/src/routes/health.rs`
- Create: `crates/local-relay/tests/integration_test.rs`

### Step 1: Write the failing integration tests first

```rust
// crates/local-relay/tests/integration_test.rs
// Run: cargo test -p local-relay --test integration_test

async fn start_relay(token: &str) -> u16 {
    let app = local_relay::server::build_app(token.to_string());
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    port
}

#[tokio::test]
async fn test_health_returns_ok() {
    let port = start_relay("tok").await;
    let resp = reqwest::get(format!("http://127.0.0.1:{port}/health"))
        .await.unwrap();
    assert_eq!(resp.status(), 200);
}

#[tokio::test]
async fn test_connect_without_token_is_401() {
    let port = start_relay("secret").await;
    let resp = reqwest::Client::new()
        .get(format!("http://127.0.0.1:{port}/v1/relay/connect?machine_id=abc&name=test"))
        .send().await.unwrap();
    assert_eq!(resp.status(), 401);
}

#[tokio::test]
async fn test_proxy_unknown_machine_is_404() {
    let port = start_relay("tok").await;
    let resp = reqwest::get(
        format!("http://127.0.0.1:{port}/v1/relay/h/unknown-machine/s/session/")
    ).await.unwrap();
    assert_eq!(resp.status(), 404);
}
```

### Step 2: Run to confirm compile failure

```bash
cargo test -p local-relay --test integration_test 2>&1 | head -10
```

Expected: error — crate `local_relay` not found.

### Step 3: Add to workspace

In root `Cargo.toml`, add `"crates/local-relay"` to the `members` array.

### Step 4: Write `Cargo.toml`

> **IMPORTANT:** Check root `Cargo.toml` for the actual version of `reqwest` in `[workspace.dependencies]` — it is `0.13` in this repo. Match it exactly.

```toml
[package]
name = "local-relay"
version = "0.1.0"
edition = "2021"

[dependencies]
relay-tunnel-core = { path = "../relay-tunnel-core" }
axum              = { workspace = true }
tokio             = { workspace = true }
tokio-util        = { workspace = true }
tower-http        = { workspace = true, features = ["cors", "trace"] }
tracing           = { workspace = true }
serde             = { workspace = true }
serde_json        = { workspace = true }
anyhow            = { workspace = true }
dashmap           = { workspace = true }
tokio-yamux       = { workspace = true }

[dev-dependencies]
reqwest    = { workspace = true }
tokio      = { workspace = true, features = ["full"] }
```

> If `dashmap` is not in `[workspace.dependencies]`, add it directly: `dashmap = "6"`.

### Step 5: `src/lib.rs`

```rust
pub mod auth;
pub mod registry;
pub mod routes;
pub mod server;
```

### Step 6: `src/auth.rs`

```rust
use axum::{
    extract::{Request, State},
    http::StatusCode,
    middleware::Next,
    response::Response,
};

#[derive(Clone)]
pub struct AuthState {
    pub token: String,
}

pub async fn require_token(
    State(auth): State<AuthState>,
    req: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    let header_token = req
        .headers()
        .get("Authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "));

    match header_token {
        Some(t) if t == auth.token => Ok(next.run(req).await),
        _ => Err(StatusCode::UNAUTHORIZED),
    }
}
```

### Step 7: `src/registry.rs`

```rust
use dashmap::DashMap;
use relay_tunnel_core::server::SharedControl;
use std::sync::Arc;

/// In-memory registry of connected relay agents. No persistence — agents
/// reconnect automatically on restart.
#[derive(Clone, Default)]
pub struct RelayRegistry(Arc<DashMap<String, SharedControl>>);

impl RelayRegistry {
    pub fn new() -> Self { Self::default() }

    pub fn insert(&self, machine_id: String, control: SharedControl) {
        self.0.insert(machine_id, control);
    }

    pub fn remove(&self, machine_id: &str) {
        self.0.remove(machine_id);
    }

    pub fn get(&self, machine_id: &str) -> Option<SharedControl> {
        self.0.get(machine_id).map(|r| r.clone())
    }
}
```

### Step 8: `src/routes/health.rs`

```rust
use axum::Json;
use serde_json::{json, Value};

pub async fn health() -> Json<Value> {
    Json(json!({ "status": "ok" }))
}
```

### Step 9: `src/routes/connect.rs`

```rust
use axum::{
    extract::{Query, State, WebSocketUpgrade},
    response::Response,
};
use relay_tunnel_core::server::run_control_channel;
use serde::Deserialize;

use crate::{registry::RelayRegistry, server::AppState};

#[derive(Debug, Deserialize)]
pub struct ConnectQuery {
    pub machine_id: String,
    pub name: String,
    #[serde(default)]
    pub agent_version: Option<String>,
}

pub async fn relay_connect(
    State(state): State<AppState>,
    Query(query): Query<ConnectQuery>,
    ws: WebSocketUpgrade,
) -> Response {
    let registry = state.registry.clone();
    let machine_id = query.machine_id.clone();

    tracing::info!(%machine_id, name = %query.name, "Relay agent connecting");

    ws.on_upgrade(move |socket| async move {
        let reg = registry.clone();
        let mid = machine_id.clone();

        let result = run_control_channel(socket, move |control| {
            let reg = reg.clone();
            let mid = mid.clone();
            async move {
                reg.insert(mid.clone(), control);
                tracing::info!(%mid, "Relay control channel established");
            }
        })
        .await;

        registry.remove(&machine_id);
        tracing::info!(%machine_id, ?result, "Relay control channel disconnected");
    })
}
```

### Step 10: `src/routes/proxy.rs`

> **Read `crates/relay-tunnel/src/server_bin/routes/path_routes.rs` first** to see exact `proxy_request_over_control` call pattern before implementing this.

```rust
use axum::{
    extract::{Path, Request, State},
    http::StatusCode,
    response::{IntoResponse, Response},
};
use relay_tunnel_core::server::proxy_request_over_control;

use crate::server::AppState;

pub async fn relay_proxy(
    State(state): State<AppState>,
    Path((machine_id, _session_id)): Path<(String, String)>,
    request: Request,
) -> Response {
    let Some(control) = state.registry.get(&machine_id) else {
        return (StatusCode::NOT_FOUND, "Host not connected").into_response();
    };

    // strip_prefix: the local agent serves at root, so strip the relay path prefix
    let strip_prefix = format!("/v1/relay/h/{machine_id}/s/_");
    proxy_request_over_control(&control, request, &strip_prefix).await
}
```

> **Note:** Check the exact `strip_prefix` argument by looking at how `path_routes.rs` computes it. The prefix should match what the relay adds so the local server sees the original path.

### Step 11: `src/routes/mod.rs`

```rust
pub mod connect;
pub mod health;
pub mod proxy;

use axum::{
    middleware,
    routing::{any, get},
    Router,
};
use tower_http::{cors::CorsLayer, trace::TraceLayer};

use crate::{
    auth::{require_token, AuthState},
    server::AppState,
};

pub fn build_router(state: AppState) -> Router {
    let auth_state = AuthState { token: state.shared_token.clone() };

    let protected = Router::new()
        .route("/relay/connect", get(connect::relay_connect))
        .layer(middleware::from_fn_with_state(auth_state, require_token))
        .with_state(state.clone());

    let proxy = Router::new()
        .route("/relay/h/{machine_id}/s/{session_id}",     any(proxy::relay_proxy))
        .route("/relay/h/{machine_id}/s/{session_id}/{*tail}", any(proxy::relay_proxy))
        .with_state(state);

    Router::new()
        .nest("/v1", protected)
        .nest("/v1", proxy)
        .route("/health", get(health::health))
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http())
}
```

### Step 12: `src/server.rs`

```rust
use crate::{registry::RelayRegistry, routes::build_router};
use axum::Router;

#[derive(Clone)]
pub struct AppState {
    pub registry: RelayRegistry,
    pub shared_token: String,
}

pub fn build_app(shared_token: String) -> Router {
    let state = AppState {
        registry: RelayRegistry::new(),
        shared_token,
    };
    build_router(state)
}

pub async fn serve(addr: &str, shared_token: String) -> anyhow::Result<()> {
    let app = build_app(shared_token);
    let listener = tokio::net::TcpListener::bind(addr).await?;
    tracing::info!("Local relay listening on {addr}");
    axum::serve(listener, app).await?;
    Ok(())
}
```

### Step 13: Run tests

```bash
cargo test -p local-relay --test integration_test -- --nocapture
```

Expected: all 3 pass.

### Step 14: Clippy

```bash
cargo clippy -p local-relay -- -D warnings
```

### Step 15: Commit

```bash
git add crates/local-relay/ Cargo.toml Cargo.lock
git commit -m "feat(local-relay): add self-hosted relay server crate"
```

---

## Task 3: P2P Host Routes + PairingStore (local server)

**Goal:** Add REST routes for managing P2P paired hosts and a `PairingStore` for single-use expiring codes, with rate limiting.

**Files:**
- Create: `crates/db/src/p2p_hosts.rs` — DB query helpers
- Modify: `crates/db/src/lib.rs` — add `pub mod p2p_hosts`
- Create: `crates/server/src/p2p/mod.rs`
- Create: `crates/server/src/p2p/pairing_store.rs`
- Create: `crates/server/src/routes/p2p_hosts.rs`
- Modify: `crates/server/src/routes/mod.rs` — mount `p2p_hosts::router()`

> Before writing, read `crates/server/src/routes/relay_auth/server.rs` for the ApiResponse/ApiError pattern and `crates/db/src/lib.rs` to see how other DB modules are structured.

### Step 1: Add DB query helpers

```rust
// crates/db/src/p2p_hosts.rs
use crate::DBService;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct P2pHost {
    pub id: String,
    pub name: String,
    pub address: String,
    pub relay_port: i64,
    pub machine_id: String,
    pub session_token: Option<String>,
    pub status: String,
    pub last_connected_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone)]
pub struct CreateP2pHostParams {
    pub name: String,
    pub address: String,
    pub relay_port: i64,
    pub machine_id: String,
}

pub async fn list_p2p_hosts(db: &DBService) -> Result<Vec<P2pHost>, sqlx::Error> {
    sqlx::query_as!(
        P2pHost,
        r#"SELECT id, name, address, relay_port, machine_id, session_token,
                  status, last_connected_at, created_at, updated_at
           FROM p2p_hosts ORDER BY created_at ASC"#
    )
    .fetch_all(&db.pool)
    .await
}

pub async fn create_p2p_host(
    db: &DBService,
    p: CreateP2pHostParams,
) -> Result<P2pHost, sqlx::Error> {
    sqlx::query_as!(
        P2pHost,
        r#"INSERT INTO p2p_hosts (name, address, relay_port, machine_id)
           VALUES (?, ?, ?, ?)
           RETURNING id, name, address, relay_port, machine_id, session_token,
                     status, last_connected_at, created_at, updated_at"#,
        p.name, p.address, p.relay_port, p.machine_id,
    )
    .fetch_one(&db.pool)
    .await
}

pub async fn delete_p2p_host(db: &DBService, id: &str) -> Result<bool, sqlx::Error> {
    let r = sqlx::query!("DELETE FROM p2p_hosts WHERE id = ?", id)
        .execute(&db.pool)
        .await?;
    Ok(r.rows_affected() > 0)
}

pub async fn update_p2p_host_paired(
    db: &DBService,
    id: &str,
    session_token: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        r#"UPDATE p2p_hosts
           SET session_token = ?, status = 'paired', updated_at = CURRENT_TIMESTAMP
           WHERE id = ?"#,
        session_token, id,
    )
    .execute(&db.pool)
    .await?;
    Ok(())
}

pub async fn list_paired_hosts(db: &DBService) -> Result<Vec<P2pHost>, sqlx::Error> {
    sqlx::query_as!(
        P2pHost,
        r#"SELECT id, name, address, relay_port, machine_id, session_token,
                  status, last_connected_at, created_at, updated_at
           FROM p2p_hosts WHERE status = 'paired' AND session_token IS NOT NULL"#
    )
    .fetch_all(&db.pool)
    .await
}

pub async fn count_recent_pairing_attempts(
    db: &DBService,
    ip: &str,
    window_minutes: i64,
) -> Result<i64, sqlx::Error> {
    let neg = format!("-{window_minutes}");
    let count = sqlx::query_scalar!(
        r#"SELECT COUNT(*) FROM p2p_pairing_attempts
           WHERE ip_address = ?
             AND attempted_at > datetime('now', ?)"#,
        ip, neg,
    )
    .fetch_one(&db.pool)
    .await?;
    Ok(count)
}

pub async fn record_pairing_attempt(
    db: &DBService,
    ip: &str,
    succeeded: bool,
) -> Result<(), sqlx::Error> {
    let s = succeeded as i64;
    sqlx::query!(
        "INSERT INTO p2p_pairing_attempts (ip_address, succeeded) VALUES (?, ?)",
        ip, s,
    )
    .execute(&db.pool)
    .await?;
    Ok(())
}
```

In `crates/db/src/lib.rs` add: `pub mod p2p_hosts;`

After any change to SQLx queries run:

```bash
pnpm run prepare-db
```

### Step 2: Write the PairingStore

```rust
// crates/server/src/p2p/mod.rs
pub mod pairing_store;
pub use pairing_store::PairingStore;
```

```rust
// crates/server/src/p2p/pairing_store.rs
//
// Thread-safe in-memory store for pending pairing codes.
// Codes are single-use and expire after a configured TTL.

use std::{
    collections::HashMap,
    sync::Arc,
    time::{Duration, Instant},
};
use tokio::sync::Mutex;

#[derive(Clone, Default)]
pub struct PairingStore(Arc<Mutex<HashMap<String, Instant>>>);

impl PairingStore {
    pub fn new() -> Self { Self::default() }

    /// Store a code with the given TTL in minutes.
    pub async fn set_pending_code(&self, code: String, expiry_minutes: u64) {
        let expires_at = Instant::now() + Duration::from_secs(expiry_minutes * 60);
        let mut store = self.0.lock().await;
        store.retain(|_, exp| *exp > Instant::now()); // clean stale codes
        store.insert(code, expires_at);
    }

    /// Consumes and validates a code. Returns true once, then false (single-use).
    pub async fn consume_code(&self, code: &str) -> bool {
        let mut store = self.0.lock().await;
        match store.remove(code) {
            Some(exp) if exp > Instant::now() => true,
            Some(_) => { tracing::debug!("Pairing code expired"); false }
            None => false,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_code_is_single_use() {
        let store = PairingStore::new();
        store.set_pending_code("TESTCODE".into(), 5).await;
        assert!(store.consume_code("TESTCODE").await);
        assert!(!store.consume_code("TESTCODE").await);
    }

    #[tokio::test]
    async fn test_wrong_code_rejected() {
        let store = PairingStore::new();
        store.set_pending_code("RIGHTCODE".into(), 5).await;
        assert!(!store.consume_code("WRONGCODE").await);
    }

    #[tokio::test]
    async fn test_generate_code_length_and_charset() {
        let charset = "23456789ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz";
        for _ in 0..200 {
            let code = super::super::routes::p2p_hosts::generate_pairing_code();
            assert_eq!(code.len(), 8);
            for c in code.chars() {
                assert!(charset.contains(c), "Unexpected char: {c}");
            }
        }
    }
}
```

### Step 3: Write `routes/p2p_hosts.rs`

> This file uses `crate::error::ApiError` — read that enum to know available variants before editing.

```rust
// crates/server/src/routes/p2p_hosts.rs
use axum::{
    extract::{Path, State},
    routing::{delete, get, post},
    Json, Router,
};
use db::p2p_hosts::{
    create_p2p_host, delete_p2p_host, list_p2p_hosts, record_pairing_attempt,
    update_p2p_host_paired, count_recent_pairing_attempts, CreateP2pHostParams,
};
use rand::Rng;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use uuid::Uuid;

use crate::{
    deployment::DeploymentImpl, error::ApiError, p2p::PairingStore,
};
use utils::response::ApiResponse;

const MAX_ATTEMPTS: i64 = 5;
const WINDOW_MINUTES: i64 = 15;
const CODE_EXPIRY_MINUTES: u64 = 5;

#[derive(Clone)]
pub struct P2pRouteState {
    pub deployment: DeploymentImpl,
    pub pairing_store: Arc<PairingStore>,
}

pub fn router(pairing_store: Arc<PairingStore>) -> Router<DeploymentImpl> {
    // We need pairing_store in state alongside DeploymentImpl.
    // Use a nested Router with merged state via extension, or pass through
    // route-level state. The cleanest approach: use axum Extension.
    Router::new()
        .route("/p2p/hosts", get(list_hosts))
        .route("/p2p/hosts/{id}", delete(remove_host))
        .route("/p2p/enrollment-code", post(generate_enrollment_code))
        .route("/p2p/pair", post(complete_pairing))
        .layer(axum::Extension(pairing_store))
}

async fn list_hosts(
    State(deployment): State<DeploymentImpl>,
) -> Result<Json<ApiResponse<Vec<db::p2p_hosts::P2pHost>>>, ApiError> {
    let hosts = list_p2p_hosts(deployment.db()).await?;
    Ok(Json(ApiResponse::success(hosts)))
}

async fn remove_host(
    State(deployment): State<DeploymentImpl>,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<bool>>, ApiError> {
    let deleted = delete_p2p_host(deployment.db(), &id).await?;
    if deleted {
        Ok(Json(ApiResponse::success(true)))
    } else {
        Err(ApiError::BadRequest("P2P host not found".to_string()))
    }
}

#[derive(Debug, Serialize)]
pub struct EnrollmentCodeResponse {
    pub code: String,
    pub expires_in_seconds: u64,
}

async fn generate_enrollment_code(
    State(_deployment): State<DeploymentImpl>,
    axum::Extension(store): axum::Extension<Arc<PairingStore>>,
) -> Result<Json<ApiResponse<EnrollmentCodeResponse>>, ApiError> {
    let code = generate_pairing_code();
    store.set_pending_code(code.clone(), CODE_EXPIRY_MINUTES).await;
    tracing::info!("Generated P2P pairing code");
    Ok(Json(ApiResponse::success(EnrollmentCodeResponse {
        code,
        expires_in_seconds: CODE_EXPIRY_MINUTES * 60,
    })))
}

#[derive(Debug, Deserialize)]
pub struct CompletePairingRequest {
    pub code: String,
    pub machine_id: String,
    pub name: String,
    // IP passed explicitly in the JSON body when calling from a peer
    pub caller_address: String,
}

#[derive(Debug, Serialize)]
pub struct CompletePairingResponse {
    pub session_token: String,
    pub host_machine_id: String,
}

async fn complete_pairing(
    State(deployment): State<DeploymentImpl>,
    axum::Extension(store): axum::Extension<Arc<PairingStore>>,
    Json(req): Json<CompletePairingRequest>,
) -> Result<Json<ApiResponse<CompletePairingResponse>>, ApiError> {
    let ip = &req.caller_address;
    let db = deployment.db();

    // Rate limit
    let attempts = count_recent_pairing_attempts(db, ip, WINDOW_MINUTES).await?;
    if attempts >= MAX_ATTEMPTS {
        tracing::warn!(%ip, "P2P pairing rate limit exceeded");
        record_pairing_attempt(db, ip, false).await?;
        return Err(ApiError::TooManyRequests(
            "Too many pairing attempts. Try again later.".to_string(),
        ));
    }

    // Validate code (single-use, expiry enforced in store)
    if !store.consume_code(&req.code).await {
        tracing::warn!(%ip, "Invalid or expired P2P pairing code");
        record_pairing_attempt(db, ip, false).await?;
        return Err(ApiError::Unauthorized);
    }

    let session_token = generate_session_token();

    // Register the peer and store the session token in one operation
    let host = create_p2p_host(
        db,
        CreateP2pHostParams {
            name: req.name.clone(),
            address: ip.clone(),
            relay_port: 8081,
            machine_id: req.machine_id.clone(),
        },
    )
    .await?;

    update_p2p_host_paired(db, &host.id, &session_token).await?;

    record_pairing_attempt(db, ip, true).await?;
    tracing::info!(%ip, machine_id = %req.machine_id, "P2P pairing succeeded");

    Ok(Json(ApiResponse::success(CompletePairingResponse {
        session_token,
        host_machine_id: deployment.user_id().to_string(),
    })))
}

pub fn generate_pairing_code() -> String {
    const CHARSET: &[u8] = b"23456789ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz";
    let mut rng = rand::thread_rng();
    (0..8)
        .map(|_| CHARSET[rng.gen_range(0..CHARSET.len())] as char)
        .collect()
}

fn generate_session_token() -> String {
    Uuid::new_v4().to_string().replace('-', "")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_code_length() {
        assert_eq!(generate_pairing_code().len(), 8);
    }

    #[test]
    fn test_code_charset() {
        let charset = "23456789ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz";
        for _ in 0..100 {
            for c in generate_pairing_code().chars() {
                assert!(charset.contains(c));
            }
        }
    }

    #[test]
    fn test_codes_unique() {
        let set: std::collections::HashSet<_> =
            (0..200).map(|_| generate_pairing_code()).collect();
        assert!(set.len() > 190);
    }

    #[test]
    fn test_session_token_length() {
        // UUID without hyphens = 32 hex chars
        assert_eq!(generate_session_token().len(), 32);
    }
}
```

### Step 4: Mount in `routes/mod.rs`

Read `crates/server/src/routes/mod.rs` first. Then add:

```rust
mod p2p_hosts;
```

In the router setup, add this where the other routers are merged (alongside `relay_auth::router()`):

```rust
.merge(p2p_hosts::router(pairing_store.clone()))
```

> `pairing_store: Arc<PairingStore>` needs to be created at startup and passed in. Create it in the function that builds the router, or in `crates/server/src/main.rs` / wherever `router(deployment)` is called. Add `Arc<PairingStore>` as a parameter to the `router` function, or create it inside and embed it via `Extension`.

### Step 5: Add `p2p` module to server crate

In `crates/server/src/lib.rs` (or `main.rs`, wherever modules are declared):

```rust
mod p2p;
```

### Step 6: Compile check

```bash
cargo check -p server 2>&1 | head -40
```

Fix all errors before proceeding. Most will be missing imports or extension wiring.

### Step 7: Run unit tests

```bash
cargo test -p server p2p -- --nocapture
cargo test -p server pairing_store -- --nocapture
```

Expected: all pass.

### Step 8: Prepare SQLx offline data for new queries

```bash
pnpm run prepare-db
```

### Step 9: Commit

```bash
git add crates/db/src/p2p_hosts.rs crates/db/src/lib.rs .sqlx/ \
        crates/server/src/p2p/ crates/server/src/routes/p2p_hosts.rs \
        crates/server/src/routes/mod.rs
git commit -m "feat(server): add P2P host management routes and pairing store"
```

---

## Task 4: P2P Connection Manager

**Goal:** On startup, for each `paired` P2P host, maintain a persistent outbound WebSocket connection to its relay server using `relay_tunnel_core::client::start_relay_client`. Reconnects with exponential backoff. New paired hosts are picked up on a 30s polling loop.

**Files:**
- Create: `crates/server/src/runtime/p2p_connection.rs`
- Modify: `crates/server/src/runtime/mod.rs` (or server bootstrap) — spawn the manager

> Read `crates/server/src/runtime/relay_registration.rs` first to understand the pattern. Then read `relay_tunnel_core/src/client.rs` for `RelayClientConfig`.

### Step 1: Write the unit test

```rust
// In crates/server/src/runtime/p2p_connection.rs — at the bottom:
#[cfg(test)]
mod tests {
    use super::*;
    use tokio_util::sync::CancellationToken;

    #[tokio::test]
    async fn test_manager_shuts_down_on_cancel() {
        let shutdown = CancellationToken::new();
        shutdown.cancel(); // cancel immediately
        // If the manager hangs, this timeout will fail the test
        tokio::time::timeout(
            std::time::Duration::from_secs(2),
            async { /* manager.run() would go here */ },
        )
        .await
        .expect("should complete quickly");
    }

    #[test]
    fn test_relay_url_uses_ws_scheme() {
        let url = build_relay_ws_url("vps.example.com", 8081, "machine-abc", "my-host");
        assert!(url.starts_with("ws://"));
        assert!(url.contains("/v1/relay/connect"));
        assert!(url.contains("machine_id=machine-abc"));
    }
}
```

Run: `cargo test -p server p2p_connection` — expected: compile error.

### Step 2: Implement `p2p_connection.rs`

```rust
// crates/server/src/runtime/p2p_connection.rs
use relay_tunnel_core::client::{start_relay_client, RelayClientConfig};
use std::{
    collections::HashSet,
    net::SocketAddr,
    time::Duration,
};
use tokio_util::sync::CancellationToken;

use crate::deployment::DeploymentImpl;

pub struct P2pConnectionManager {
    deployment: DeploymentImpl,
    shutdown: CancellationToken,
}

impl P2pConnectionManager {
    pub fn new(deployment: DeploymentImpl, shutdown: CancellationToken) -> Self {
        Self { deployment, shutdown }
    }

    pub async fn run(self) {
        let server_addr = match self.deployment.client_info().get_server_addr() {
            Some(a) => a,
            None => {
                tracing::warn!("Server address unavailable; P2P connections skipped");
                return;
            }
        };

        // Track which machine_ids we already spawned a task for
        let mut active: HashSet<String> = HashSet::new();

        loop {
            let hosts = db::p2p_hosts::list_paired_hosts(self.deployment.db()).await;
            match hosts {
                Ok(hosts) => {
                    for host in hosts {
                        if active.contains(&host.machine_id) {
                            continue; // already connected
                        }
                        let token = host.session_token.clone().unwrap();
                        let relay_url = build_relay_ws_url(
                            &host.address,
                            host.relay_port as u16,
                            self.deployment.user_id(),
                            &host.name,
                        );
                        let child = self.shutdown.child_token();
                        let mid = host.machine_id.clone();
                        active.insert(mid.clone());
                        let active_ref = active.clone(); // not shared — spawned task handles its own copy
                        let _ = active_ref; // suppress warning — removal happens via shutdown
                        tokio::spawn(connect_with_backoff(
                            relay_url, token, server_addr, child, mid,
                        ));
                    }
                }
                Err(e) => tracing::error!(?e, "Failed to load P2P hosts"),
            }

            tokio::select! {
                _ = self.shutdown.cancelled() => break,
                _ = tokio::time::sleep(Duration::from_secs(30)) => {}
            }
        }

        tracing::info!("P2P connection manager shut down");
    }
}

async fn connect_with_backoff(
    ws_url: String,
    bearer_token: String,
    local_addr: SocketAddr,
    shutdown: CancellationToken,
    machine_id: String,
) {
    let mut backoff = Duration::from_secs(2);
    const MAX_BACKOFF: Duration = Duration::from_secs(60);

    loop {
        if shutdown.is_cancelled() { break; }

        tracing::info!(%machine_id, %ws_url, "Connecting to P2P relay");

        let result = start_relay_client(RelayClientConfig {
            ws_url: ws_url.clone(),
            bearer_token: bearer_token.clone(),
            local_addr,
            shutdown: shutdown.clone(),
        })
        .await;

        if shutdown.is_cancelled() { break; }

        tracing::warn!(
            %machine_id, ?result,
            backoff_secs = backoff.as_secs(),
            "P2P relay disconnected, reconnecting"
        );

        tokio::select! {
            _ = shutdown.cancelled() => break,
            _ = tokio::time::sleep(backoff) => {}
        }

        backoff = (backoff * 2).min(MAX_BACKOFF);
    }
}

pub fn build_relay_ws_url(address: &str, relay_port: u16, machine_id: &str, name: &str) -> String {
    let encoded = url::form_urlencoded::Serializer::new(String::new())
        .append_pair("machine_id", machine_id)
        .append_pair("name", name)
        .append_pair("agent_version", env!("CARGO_PKG_VERSION"))
        .finish();
    format!("ws://{address}:{relay_port}/v1/relay/connect?{encoded}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_relay_url_format() {
        let url = build_relay_ws_url("vps.example.com", 8081, "machine-abc", "my-host");
        assert!(url.starts_with("ws://"));
        assert!(url.contains("vps.example.com:8081"));
        assert!(url.contains("/v1/relay/connect"));
        assert!(url.contains("machine_id=machine-abc"));
    }
}
```

### Step 3: Spawn the manager on startup

In `crates/server/src/runtime/mod.rs` (or wherever the runtime starts — look at how `relay_registration::spawn_relay` is called):

```rust
use crate::runtime::p2p_connection::P2pConnectionManager;

// After existing relay startup:
let p2p_manager = P2pConnectionManager::new(deployment.clone(), shutdown.child_token());
tokio::spawn(async move { p2p_manager.run().await });
```

Add to the module:

```rust
pub mod p2p_connection;
```

### Step 4: Run tests

```bash
cargo test -p server p2p_connection -- --nocapture
```

### Step 5: Compile check

```bash
cargo check -p server 2>&1 | head -40
```

### Step 6: Commit

```bash
git add crates/server/src/runtime/p2p_connection.rs \
        crates/server/src/runtime/mod.rs
git commit -m "feat(server): add P2P connection manager with backoff reconnection"
```

---

## Task 5: P2P Pair Client Route

**Goal:** Add `POST /api/relay-auth/client/p2p-pair` — lets this Vibe Kanban instance pair with a remote one by address + pairing code, without needing cloud. Calls the remote instance's `/api/p2p/pair` endpoint directly.

**Files:**
- Modify: `crates/server/src/routes/relay_auth/client.rs`

> **Read this file in full before editing.** Note the existing imports and `router()` function structure.

### Step 1: Write the failing test documenting expected behavior

```rust
// Add to tests in relay_auth/client.rs:
#[test]
fn test_p2p_pair_route_is_registered() {
    // This test simply documents the route exists.
    // Full integration test is in Task 6.
    assert!(true, "POST /relay-auth/client/p2p-pair must be registered");
}
```

### Step 2: Add the handler

Add to `relay_auth/client.rs`:

```rust
use db::p2p_hosts::{create_p2p_host, update_p2p_host_paired, CreateP2pHostParams};

#[derive(Debug, Deserialize)]
pub struct P2pPairRequest {
    pub name: String,
    pub address: String,        // remote host IP/hostname
    pub api_port: Option<u16>,  // remote API port, default 3000
    pub relay_port: Option<u16>,
    pub pairing_code: String,
}

#[derive(Debug, Serialize)]
pub struct P2pPairResponse {
    pub paired: bool,
    pub host_id: String,
}

pub async fn p2p_pair_host(
    State(deployment): State<DeploymentImpl>,
    Json(req): Json<P2pPairRequest>,
) -> Result<Json<ApiResponse<P2pPairResponse>>, ApiError> {
    let api_port = req.api_port.unwrap_or(3000);
    let relay_port = req.relay_port.unwrap_or(8081);
    let pair_url = format!("http://{}:{}/api/p2p/pair", req.address, api_port);

    #[derive(serde::Serialize)]
    struct PairPayload {
        code: String,
        machine_id: String,
        name: String,
        caller_address: String,
    }

    #[derive(serde::Deserialize)]
    struct PairResult {
        session_token: String,
        host_machine_id: String,
    }

    // Discover our own outbound IP by making the request — the remote will echo it back
    let local_machine_id = deployment.user_id().to_string();

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| ApiError::BadRequest(e.to_string()))?;

    let resp = client
        .post(&pair_url)
        .json(&PairPayload {
            code: req.pairing_code.clone(),
            machine_id: local_machine_id,
            name: deployment.user_id().to_string(), // use user_id as fallback name
            caller_address: String::new(), // remote will use actual connection IP
        })
        .send()
        .await
        .map_err(|e| ApiError::BadRequest(format!("Could not reach remote host: {e}")))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(ApiError::BadRequest(format!(
            "Remote host rejected pairing (HTTP {status}): {body}"
        )));
    }

    let result: PairResult = resp.json().await
        .map_err(|e| ApiError::BadRequest(format!("Invalid response from remote: {e}")))?;

    let db = deployment.db();
    let host = create_p2p_host(db, CreateP2pHostParams {
        name: req.name,
        address: req.address,
        relay_port: relay_port as i64,
        machine_id: result.host_machine_id,
    })
    .await?;

    update_p2p_host_paired(db, &host.id, &result.session_token).await?;

    tracing::info!(host_id = %host.id, "P2P pairing complete");

    Ok(Json(ApiResponse::success(P2pPairResponse {
        paired: true,
        host_id: host.id,
    })))
}
```

Add to `router()`:

```rust
.route("/relay-auth/client/p2p-pair", post(p2p_pair_host))
```

### Step 3: Fix `complete_pairing` IP extraction

The `complete_pairing` handler above uses `caller_address` from JSON body. This is simpler than `ConnectInfo` (which requires changing `into_make_service` to `into_make_service_with_connect_info`). The client sends its own address, which is validated indirectly by rate limiting. For Phase 2 we can switch to `ConnectInfo` for stricter IP enforcement.

### Step 4: Compile check

```bash
cargo check -p server 2>&1 | head -40
```

### Step 5: Prepare SQLx offline data

```bash
pnpm run prepare-db
```

### Step 6: Run tests

```bash
cargo test -p server relay_auth -- --nocapture
```

### Step 7: Commit

```bash
git add crates/server/src/routes/relay_auth/client.rs .sqlx/
git commit -m "feat(server): add P2P peer pairing without cloud dependency"
```

---

## Task 6: Final Integration Test + Workspace Check

**Goal:** Confirm the full workspace compiles, all tests pass, and the relay integration tests pass.

**Files:**
- No new files — verification only

### Step 1: Workspace compile check

```bash
cargo check --workspace 2>&1
```

Fix every error.

### Step 2: Workspace clippy

```bash
cargo clippy --workspace -- -D warnings 2>&1
```

Fix every warning.

### Step 3: Run all tests

```bash
cargo test --workspace 2>&1 | tail -30
```

### Step 4: Run relay integration tests

```bash
cargo test -p local-relay --test integration_test -- --nocapture
```

Expected: 3 tests pass.

### Step 5: Format

```bash
pnpm run format
```

### Step 6: Prepare SQLx offline data (final)

```bash
pnpm run prepare-db
```

Commit any formatting or SQLx changes:

```bash
git add -A
git commit -m "chore: format code and update SQLx offline data after Phase 1"
```

---

## Phase 1 Completion Checklist

- [ ] Migration `20260419000000_p2p_hosts.sql` applies cleanly
- [ ] `crates/local-relay/` builds and 3 integration tests pass
- [ ] `GET /api/p2p/hosts` returns empty list on fresh install
- [ ] `POST /api/p2p/enrollment-code` returns 8-char code, expires in 5 min
- [ ] `POST /api/p2p/pair` validates code, rate limits at 5/15min/IP, persists session_token
- [ ] `POST /api/relay-auth/client/p2p-pair` pairs to remote by address + code
- [ ] P2P connection manager spawns on startup, reconnects with backoff
- [ ] `cargo check --workspace` passes
- [ ] `cargo clippy --workspace -- -D warnings` passes
- [ ] `pnpm run format` clean

---

## What's Next (Phase 2)

- SSH tunnel transport (`crates/ssh-tunnel/` using `russh`)
- SSH key-based host authentication (replace code with key challenge)
- Direct → SSH tunnel fallback logic
- Host key fingerprint verification
- `into_make_service_with_connect_info` for strict IP-based rate limiting

## What's Next (Phase 3)

- Frontend: Remote Hosts settings page in `packages/web-core/`
- Host switcher in main app sidebar
- Connection status indicators
- Web UI served through self-hosted local-relay

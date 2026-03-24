# Slack Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add outbound Slack notifications to the remote server so that per-project Slack channels receive messages when issue statuses change, comments are added, or PRs are created.

**Architecture:** A new `crates/remote/src/slack/` module (mirroring `crates/remote/src/linear/`) handles DB access, Slack API calls, and fire-and-forget notification functions. Three API routes handle connect/disconnect/status. A new `web-core` settings panel (mirroring the Linear panel) lets users connect a Slack channel per project.

**Tech Stack:** Rust (Axum, SQLx, reqwest, secrecy), React + TypeScript (makeLocalApiRequest, web-core), Postgres migration.

---

## File Map

**Create:**
- `crates/remote/migrations/20260323100000_slack_integration.sql` — DB migration
- `crates/remote/src/slack/mod.rs` — module re-exports
- `crates/remote/src/slack/client.rs` — Slack HTTP API wrapper (`auth_test`, `post_message`)
- `crates/remote/src/slack/db.rs` — SQL queries for `slack_project_connections`
- `crates/remote/src/slack/notify.rs` — fire-and-forget notification functions
- `crates/remote/src/routes/slack.rs` — API route handlers
- `packages/web-core/src/shared/dialogs/settings/settings/slack-integration/index.tsx` — state manager
- `packages/web-core/src/shared/dialogs/settings/settings/slack-integration/connect-panel.tsx` — UI component

**Modify:**
- `crates/remote/src/lib.rs` — add `pub mod slack;`
- `crates/remote/src/routes/mod.rs` — add `mod slack;` and merge `slack::protected_router()` into `v1_protected`
- `crates/remote/src/routes/issues.rs` — add `notify_status_change` tokio::spawn calls alongside existing Linear spawns
- `crates/remote/src/routes/issue_comments.rs` — add `notify_comment_added` tokio::spawn calls alongside existing Linear spawns
- `packages/web-core/src/shared/dialogs/settings/settings/RemoteProjectsSettingsSection.tsx` — add `<SlackIntegration>` section

---

## Task 1: Database migration

**Files:**
- Create: `crates/remote/migrations/20260323100000_slack_integration.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- crates/remote/migrations/20260323100000_slack_integration.sql
CREATE TABLE slack_project_connections (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id          UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    channel_id          TEXT        NOT NULL,
    encrypted_bot_token TEXT        NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (project_id)
);
```

- [ ] **Step 2: Run the migration against the dev database**

```bash
pnpm run prepare-db
```

Expected: exits 0, no errors. The `slack_project_connections` table now exists.

- [ ] **Step 3: Commit**

```bash
git add crates/remote/migrations/20260323100000_slack_integration.sql
git commit -m "feat(slack): add slack_project_connections migration"
```

---

## Task 2: Slack module skeleton + crypto re-use

**Files:**
- Create: `crates/remote/src/slack/mod.rs`
- Modify: `crates/remote/src/lib.rs`

Context: The `crates/remote/src/linear/crypto.rs` module already implements `encrypt` and `decrypt` using AES-256-GCM. The Slack module reuses it directly — no copy needed.

- [ ] **Step 1: Create `crates/remote/src/slack/mod.rs`**

```rust
pub mod client;
pub mod db;
pub mod notify;
```

- [ ] **Step 2: Add the module to `crates/remote/src/lib.rs`**

Open `crates/remote/src/lib.rs`. Find the line `pub mod linear;` and add below it:

```rust
pub mod slack;
```

- [ ] **Step 3: Verify it compiles (no logic yet)**

```bash
cargo check -p remote
```

Expected: compiles with "can't find module" errors for `client`, `db`, `notify` — that's fine, we'll add them next. Or add empty stub files first:

```bash
touch crates/remote/src/slack/client.rs
touch crates/remote/src/slack/db.rs
touch crates/remote/src/slack/notify.rs
```

Then:

```bash
cargo check -p remote
```

Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add crates/remote/src/slack/ crates/remote/src/lib.rs
git commit -m "feat(slack): add slack module skeleton"
```

---

## Task 3: Slack API client (`client.rs`)

**Files:**
- Create: `crates/remote/src/slack/client.rs`

The Slack Web API uses `POST https://slack.com/api/<method>` with a bearer token. Responses always return HTTP 200; check the `"ok"` field in the JSON body.

- [ ] **Step 1: Write the failing tests first**

Add to `crates/remote/src/slack/client.rs`:

```rust
#[cfg(test)]
mod tests {
    // These are unit tests for response parsing — they don't hit the network.
    use super::*;

    #[test]
    fn auth_test_response_ok_true_succeeds() {
        let body = serde_json::json!({ "ok": true, "user": "bot", "team": "MyTeam" });
        let resp: SlackResponse = serde_json::from_value(body).unwrap();
        assert!(resp.ok);
    }

    #[test]
    fn auth_test_response_ok_false_is_error() {
        let body = serde_json::json!({ "ok": false, "error": "invalid_auth" });
        let resp: SlackResponse = serde_json::from_value(body).unwrap();
        assert!(!resp.ok);
        assert_eq!(resp.error.as_deref(), Some("invalid_auth"));
    }
}
```

- [ ] **Step 2: Run tests to verify they fail (type not defined yet)**

```bash
cargo test -p remote slack::client 2>&1 | head -20
```

Expected: compile error — `SlackResponse` not found.

- [ ] **Step 3: Implement `client.rs`**

```rust
use reqwest::Client;
use serde::Deserialize;

const SLACK_API_BASE: &str = "https://slack.com/api";

#[derive(Debug, Deserialize)]
pub struct SlackResponse {
    pub ok: bool,
    pub error: Option<String>,
}

#[derive(Debug, thiserror::Error)]
pub enum SlackClientError {
    #[error("HTTP error: {0}")]
    Http(#[from] reqwest::Error),
    #[error("Slack API error: {0}")]
    Api(String),
}

/// Validate a bot token using auth.test. Returns Ok(()) if valid.
pub async fn auth_test(http: &Client, bot_token: &str) -> Result<(), SlackClientError> {
    let resp: SlackResponse = http
        .post(format!("{SLACK_API_BASE}/auth.test"))
        .bearer_auth(bot_token)
        .send()
        .await?
        .json()
        .await?;

    if resp.ok {
        Ok(())
    } else {
        Err(SlackClientError::Api(
            resp.error.unwrap_or_else(|| "unknown_error".into()),
        ))
    }
}

/// Post a plain-text message to a Slack channel.
pub async fn post_message(
    http: &Client,
    bot_token: &str,
    channel_id: &str,
    text: &str,
) -> Result<(), SlackClientError> {
    let resp: SlackResponse = http
        .post(format!("{SLACK_API_BASE}/chat.postMessage"))
        .bearer_auth(bot_token)
        .json(&serde_json::json!({
            "channel": channel_id,
            "text": text,
        }))
        .send()
        .await?
        .json()
        .await?;

    if resp.ok {
        Ok(())
    } else {
        Err(SlackClientError::Api(
            resp.error.unwrap_or_else(|| "unknown_error".into()),
        ))
    }
}
```

- [ ] **Step 4: Run tests**

```bash
cargo test -p remote slack::client
```

Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add crates/remote/src/slack/client.rs
git commit -m "feat(slack): add Slack API client (auth_test, post_message)"
```

---

## Task 4: Database queries (`db.rs`)

**Files:**
- Create: `crates/remote/src/slack/db.rs`

Reference: `crates/remote/src/linear/db.rs` for the query patterns (sqlx `query_as!`, `query!`).

- [ ] **Step 1: Write `db.rs`**

```rust
use chrono::{DateTime, Utc};
use sqlx::PgPool;
use uuid::Uuid;

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct SlackProjectConnection {
    pub id: Uuid,
    pub project_id: Uuid,
    pub channel_id: String,
    pub encrypted_bot_token: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

pub struct UpsertConnectionInput {
    pub project_id: Uuid,
    pub channel_id: String,
    pub encrypted_bot_token: String,
}

/// Get the Slack connection for a project. Returns None if not configured.
pub async fn get_connection_for_project(
    pool: &PgPool,
    project_id: Uuid,
) -> sqlx::Result<Option<SlackProjectConnection>> {
    sqlx::query_as!(
        SlackProjectConnection,
        r#"
        SELECT id, project_id, channel_id, encrypted_bot_token, created_at, updated_at
        FROM slack_project_connections
        WHERE project_id = $1
        "#,
        project_id
    )
    .fetch_optional(pool)
    .await
}

/// Get a connection by its UUID (used by the DELETE route).
pub async fn get_connection_by_id(
    pool: &PgPool,
    id: Uuid,
) -> sqlx::Result<Option<SlackProjectConnection>> {
    sqlx::query_as!(
        SlackProjectConnection,
        r#"
        SELECT id, project_id, channel_id, encrypted_bot_token, created_at, updated_at
        FROM slack_project_connections
        WHERE id = $1
        "#,
        id
    )
    .fetch_optional(pool)
    .await
}

/// Upsert a connection. On conflict (same project_id), update channel and token.
/// Returns the connection id.
pub async fn upsert_connection(
    pool: &PgPool,
    input: UpsertConnectionInput,
) -> sqlx::Result<Uuid> {
    let row = sqlx::query!(
        r#"
        INSERT INTO slack_project_connections (project_id, channel_id, encrypted_bot_token)
        VALUES ($1, $2, $3)
        ON CONFLICT (project_id)
        DO UPDATE SET
            channel_id          = EXCLUDED.channel_id,
            encrypted_bot_token = EXCLUDED.encrypted_bot_token,
            updated_at          = NOW()
        RETURNING id
        "#,
        input.project_id,
        input.channel_id,
        input.encrypted_bot_token,
    )
    .fetch_one(pool)
    .await?;
    Ok(row.id)
}

/// Delete a connection by id. Returns true if a row was deleted.
pub async fn delete_connection(pool: &PgPool, id: Uuid) -> sqlx::Result<bool> {
    let result = sqlx::query!(
        "DELETE FROM slack_project_connections WHERE id = $1",
        id
    )
    .execute(pool)
    .await?;
    Ok(result.rows_affected() > 0)
}
```

- [ ] **Step 2: Regenerate SQLx offline cache**

```bash
pnpm run prepare-db
```

Expected: exits 0. The `.sqlx/` directory now has query metadata for the new queries.

- [ ] **Step 3: Check compilation**

```bash
cargo check -p remote
```

Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add crates/remote/src/slack/db.rs .sqlx/
git commit -m "feat(slack): add Slack DB queries"
```

---

## Task 5: Notification functions (`notify.rs`)

**Files:**
- Create: `crates/remote/src/slack/notify.rs`

These functions fetch their own data from the DB (following `linear::outbound::push_issue_to_linear` which calls `fetch_issue` internally). They are fire-and-forget: errors are logged and swallowed.

- [ ] **Step 1: Write `notify.rs`**

Column name notes (verified against migrations):
- `issue_comments` has `message TEXT` (not `body`) and `author_id UUID` (not `user_id`)
- `users` has `username TEXT` and `email TEXT` — no `name` column

```rust
use reqwest::Client;
use sqlx::PgPool;
use uuid::Uuid;

use crate::{linear::crypto, slack::{client, db}};

async fn send(pool: &PgPool, http: &Client, enc_key: &str, project_id: Uuid, text: &str) {
    let Ok(Some(conn)) = db::get_connection_for_project(pool, project_id).await else {
        return;
    };
    let Ok(bot_token) = crypto::decrypt(enc_key, &conn.encrypted_bot_token) else {
        tracing::warn!(%project_id, "failed to decrypt Slack bot token");
        return;
    };
    if let Err(e) = client::post_message(http, &bot_token, &conn.channel_id, text).await {
        tracing::warn!(%project_id, error = %e, "failed to send Slack notification");
    }
}

/// Notify Slack when an issue's status changes.
pub async fn notify_status_change(
    pool: &PgPool,
    http: &Client,
    enc_key: &str,
    vk_issue_id: Uuid,
) {
    let Ok(Some(row)) = sqlx::query!(
        r#"
        SELECT i.title, i.project_id, p.name AS project_name, ps.name AS status_name
        FROM issues i
        JOIN projects p ON p.id = i.project_id
        JOIN project_statuses ps ON ps.id = i.status_id
        WHERE i.id = $1
        "#,
        vk_issue_id
    )
    .fetch_optional(pool)
    .await
    else {
        return;
    };

    let text = format!(
        "[{}] Issue status changed: {} → {}",
        row.project_name, row.title, row.status_name
    );
    send(pool, http, enc_key, row.project_id, &text).await;
}

/// Notify Slack when a comment is added to an issue.
pub async fn notify_comment_added(
    pool: &PgPool,
    http: &Client,
    enc_key: &str,
    vk_comment_id: Uuid,
) {
    let Ok(Some(row)) = sqlx::query!(
        r#"
        SELECT ic.message, i.title AS issue_title, i.project_id,
               p.name AS project_name,
               COALESCE(u.username, u.email, 'Unknown') AS author
        FROM issue_comments ic
        JOIN issues i ON i.id = ic.issue_id
        JOIN projects p ON p.id = i.project_id
        LEFT JOIN users u ON u.id = ic.author_id
        WHERE ic.id = $1
        "#,
        vk_comment_id
    )
    .fetch_optional(pool)
    .await
    else {
        return;
    };

    let text = format!(
        "[{}] New comment on \"{}\" by {}",
        row.project_name, row.issue_title, row.author.unwrap_or_else(|| "Unknown".into())
    );
    send(pool, http, enc_key, row.project_id, &text).await;
}

/// Notify Slack when a PR is created.
/// project_id, project_name, pr_title, and author are passed directly (in scope at call site).
/// Note: this adds `project_name: &str` vs the spec signature to avoid an extra DB query.
pub async fn notify_pr_created(
    pool: &PgPool,
    http: &Client,
    enc_key: &str,
    project_id: Uuid,
    project_name: &str,
    pr_title: &str,
    author: &str,
) {
    let text = format!("[{}] PR opened: \"{}\" by {}", project_name, pr_title, author);
    send(pool, http, enc_key, project_id, &text).await;
}
```

- [ ] **Step 2: Check compilation**

```bash
cargo check -p remote
```

Expected: exits 0. If SQLx reports unknown column errors, verify column names against `crates/remote/migrations/` — the correct names are `message`, `author_id`, `username` as noted above.

- [ ] **Step 3: Regenerate SQLx cache**

```bash
pnpm run prepare-db
```

- [ ] **Step 4: Commit**

```bash
git add crates/remote/src/slack/notify.rs .sqlx/
git commit -m "feat(slack): add fire-and-forget notification functions"
```

---

## Task 6: API routes (`routes/slack.rs`)

**Files:**
- Create: `crates/remote/src/routes/slack.rs`
- Modify: `crates/remote/src/routes/mod.rs`

Reference patterns from `crates/remote/src/routes/linear.rs`:
- `Extension(ctx): Extension<RequestContext>` for auth context
- `State(state): State<AppState>` for DB pool and config
- `ensure_project_access(pool, ctx.user.id, project_id).await?` for authorization
- Return `(StatusCode::CREATED, Json(...)).into_response()` for 201 responses
- 503 guard: `state.config().linear_encryption_key.as_ref().ok_or_else(|| ErrorResponse::service_unavailable(...))`

- [ ] **Step 1: Write `routes/slack.rs`**

```rust
use axum::{
    Router,
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{delete, get, post},
    Extension, Json,
};
use secrecy::ExposeSecret;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    AppState,
    auth::RequestContext,
    linear::crypto,
    slack::{client, db},
};
use super::{
    error::ErrorResponse,
    organization_members::ensure_project_access,
};

pub fn protected_router() -> Router<AppState> {
    Router::new()
        .route("/slack/connect", post(connect))
        .route("/slack/connections/:id", delete(disconnect))
        .route("/slack/status", get(status))
}

// ── Request / response types ──────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct ConnectRequest {
    project_id: Uuid,
    bot_token: String,
    channel_id: String,
}

#[derive(Debug, Serialize)]
struct ConnectResponse {
    connection_id: Uuid,
    channel_id: String,
}

#[derive(Debug, Deserialize)]
struct StatusQuery {
    project_id: Uuid,
}

#[derive(Debug, Serialize)]
struct StatusResponse {
    connected: bool,
    connection_id: Option<Uuid>,
    channel_id: Option<String>,
}

// ── Handlers ──────────────────────────────────────────────────────────────────

async fn connect(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Json(req): Json<ConnectRequest>,
) -> Result<impl IntoResponse, ErrorResponse> {
    let enc_key = state
        .config()
        .linear_encryption_key
        .as_ref()
        .ok_or_else(|| {
            ErrorResponse::new(StatusCode::SERVICE_UNAVAILABLE, "Slack integration not configured")
        })?;

    ensure_project_access(state.pool(), ctx.user.id, req.project_id).await?;

    // Validate token before storing
    client::auth_test(&state.http_client, &req.bot_token)
        .await
        .map_err(|e| {
            tracing::warn!(error = %e, "Slack auth_test failed");
            ErrorResponse::new(StatusCode::UNPROCESSABLE_ENTITY, "Invalid Slack bot token")
        })?;

    let encrypted_token = crypto::encrypt(enc_key.expose_secret(), &req.bot_token)
        .map_err(|e| {
            tracing::error!(error = %e, "failed to encrypt Slack token");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "encryption failed")
        })?;

    let connection_id = db::upsert_connection(
        state.pool(),
        db::UpsertConnectionInput {
            project_id: req.project_id,
            channel_id: req.channel_id.clone(),
            encrypted_bot_token: encrypted_token,
        },
    )
    .await
    .map_err(|e| {
        tracing::error!(error = %e, "failed to upsert Slack connection");
        ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "database error")
    })?;

    Ok((
        StatusCode::CREATED,
        Json(ConnectResponse {
            connection_id,
            channel_id: req.channel_id,
        }),
    ))
}

async fn disconnect(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, ErrorResponse> {
    let conn = db::get_connection_by_id(state.pool(), id)
        .await
        .map_err(|e| {
            tracing::error!(error = %e, %id, "failed to fetch Slack connection");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "database error")
        })?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "connection not found"))?;

    ensure_project_access(state.pool(), ctx.user.id, conn.project_id).await?;

    db::delete_connection(state.pool(), id)
        .await
        .map_err(|e| {
            tracing::error!(error = %e, %id, "failed to delete Slack connection");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "database error")
        })?;

    Ok(StatusCode::NO_CONTENT)
}

async fn status(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Query(query): Query<StatusQuery>,
) -> Result<Json<StatusResponse>, ErrorResponse> {
    state
        .config()
        .linear_encryption_key
        .as_ref()
        .ok_or_else(|| {
            ErrorResponse::new(StatusCode::SERVICE_UNAVAILABLE, "Slack integration not configured")
        })?;

    ensure_project_access(state.pool(), ctx.user.id, query.project_id).await?;

    let conn = db::get_connection_for_project(state.pool(), query.project_id)
        .await
        .map_err(|e| {
            tracing::error!(error = %e, "failed to fetch Slack status");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "database error")
        })?;

    Ok(Json(match conn {
        Some(c) => StatusResponse {
            connected: true,
            connection_id: Some(c.id),
            channel_id: Some(c.channel_id),
        },
        None => StatusResponse {
            connected: false,
            connection_id: None,
            channel_id: None,
        },
    }))
}
```

- [ ] **Step 2: Register the router in `routes/mod.rs`**

Open `crates/remote/src/routes/mod.rs`.

Find `mod linear;` and add below it:
```rust
mod slack;
```

Find the line `.merge(linear::protected_router())` in `v1_protected` and add after it:
```rust
.merge(slack::protected_router())
```

- [ ] **Step 3: Check compilation**

```bash
cargo check -p remote
```

Expected: exits 0. Fix any method name issues (e.g. `state.http_client()` vs `state.http_client` — check how `AppState` exposes the reqwest client by looking at `crates/remote/src/state.rs`).

- [ ] **Step 4: Commit**

```bash
git add crates/remote/src/routes/slack.rs crates/remote/src/routes/mod.rs
git commit -m "feat(slack): add connect/disconnect/status API routes"
```

---

## Task 7: Wire notification hooks into issue and comment mutations

**Files:**
- Modify: `crates/remote/src/routes/issues.rs`
- Modify: `crates/remote/src/routes/issue_comments.rs`

Pattern to follow (already exists for Linear in both files):
```rust
if let Some(enc_key) = state
    .config()
    .linear_encryption_key
    .as_ref()
    .map(|k| k.expose_secret().to_string())
{
    let (pool, http, id) = (state.pool().clone(), state.http_client.clone(), issue_id);
    tokio::spawn(async move {
        crate::linear::outbound::push_issue_to_linear(&pool, &http, &enc_key, id).await;
    });
}
```

Add an identical block right after each existing Linear spawn, calling the Slack notify function instead.

- [ ] **Step 1: Add `notify_status_change` to `issues.rs`**

In `crates/remote/src/routes/issues.rs`, find the **`update_issue`** handler (NOT `create_issue` — creating an issue is not a status change event). In `update_issue`, look for the `if status_changed` guard that wraps the `push_issue_to_linear` spawn. Place the Slack spawn **inside the same `if status_changed` block**, right after the Linear spawn:

```rust
if let Some(enc_key) = state
    .config()
    .linear_encryption_key
    .as_ref()
    .map(|k| k.expose_secret().to_string())
{
    let (pool, http, id) = (state.pool().clone(), state.http_client.clone(), issue_id);
    tokio::spawn(async move {
        crate::slack::notify::notify_status_change(&pool, &http, &enc_key, id).await;
    });
}
```

Do NOT add this to `create_issue` — that would fire a spurious "status changed" notification for every new issue.

- [ ] **Step 2: Add `notify_comment_added` to `issue_comments.rs`**

In `crates/remote/src/routes/issue_comments.rs`, find every `tokio::spawn` block that calls `push_comment_to_linear`. After each one, add:

```rust
if let Some(enc_key) = state
    .config()
    .linear_encryption_key
    .as_ref()
    .map(|k| k.expose_secret().to_string())
{
    let (pool, http, cid) = (state.pool().clone(), state.http_client.clone(), comment_id);
    tokio::spawn(async move {
        crate::slack::notify::notify_comment_added(&pool, &http, &enc_key, cid).await;
    });
}
```

Add this to the create handler only (not delete, not update).

- [ ] **Step 3: Check compilation**

```bash
cargo check -p remote
```

Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add crates/remote/src/routes/issues.rs crates/remote/src/routes/issue_comments.rs
git commit -m "feat(slack): wire status_change and comment_added notifications into mutation hooks"
```

---

## Task 8: Frontend — settings panel

**Files:**
- Create: `packages/web-core/src/shared/dialogs/settings/settings/slack-integration/index.tsx`
- Create: `packages/web-core/src/shared/dialogs/settings/settings/slack-integration/connect-panel.tsx`
- Modify: `packages/web-core/src/shared/dialogs/settings/settings/RemoteProjectsSettingsSection.tsx`

Reference: `packages/web-core/src/shared/dialogs/settings/settings/linear-integration/index.tsx` and `connect-panel.tsx` for the exact patterns (makeLocalApiRequest, SpinnerIcon, error state handling).

- [ ] **Step 1: Create `connect-panel.tsx`**

```tsx
import { useState } from 'react';
import { makeLocalApiRequest } from '@/shared/lib/localApiTransport';
import { PrimaryButton } from '@vibe/ui/components/PrimaryButton';

interface ConnectedState {
  connectionId: string;
  channelId: string;
}

interface Props {
  projectId: string;
  connected: ConnectedState | null;
  onConnected: (state: ConnectedState) => void;
  onDisconnected: () => void;
}

export function SlackConnectPanel({
  projectId,
  connected,
  onConnected,
  onDisconnected,
}: Props) {
  const [botToken, setBotToken] = useState('');
  const [channelId, setChannelId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleConnect() {
    setLoading(true);
    setError(null);
    try {
      const res = await makeLocalApiRequest('/v1/slack/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, bot_token: botToken, channel_id: channelId }),
      });
      if (res.status === 422) {
        setError('Invalid Slack bot token. Please check your token and try again.');
        return;
      }
      if (!res.ok) {
        setError('Failed to connect. Please try again.');
        return;
      }
      const data: { connection_id: string; channel_id: string } = await res.json();
      onConnected({ connectionId: data.connection_id, channelId: data.channel_id });
      setBotToken('');
      setChannelId('');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleDisconnect() {
    if (!connected) return;
    setLoading(true);
    try {
      await makeLocalApiRequest(`/v1/slack/connections/${connected.connectionId}`, {
        method: 'DELETE',
      });
      onDisconnected();
    } catch {
      console.error('Failed to disconnect Slack');
    } finally {
      setLoading(false);
    }
  }

  if (connected) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-secondary">
          Connected to channel <span className="font-mono">{connected.channelId}</span>
        </p>
        <PrimaryButton
          variant="destructive"
          onClick={() => void handleDisconnect()}
          disabled={loading}
        >
          Disconnect
        </PrimaryButton>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <label className="text-sm font-medium">Bot Token</label>
        <input
          type="password"
          className="w-full rounded border px-3 py-2 text-sm"
          placeholder="xoxb-..."
          value={botToken}
          onChange={(e) => setBotToken(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">Channel ID</label>
        <input
          type="text"
          className="w-full rounded border px-3 py-2 text-sm"
          placeholder="C0XXXXXXXXX"
          value={channelId}
          onChange={(e) => setChannelId(e.target.value)}
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <PrimaryButton
        onClick={() => void handleConnect()}
        disabled={loading || !botToken || !channelId}
      >
        Connect
      </PrimaryButton>
    </div>
  );
}
```

- [ ] **Step 2: Create `index.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { SpinnerIcon } from '@phosphor-icons/react';
import { makeLocalApiRequest } from '@/shared/lib/localApiTransport';
import { SlackConnectPanel } from './connect-panel';

interface ConnectedState {
  connectionId: string;
  channelId: string;
}

interface Props {
  projectId: string;
}

export function SlackIntegration({ projectId }: Props) {
  const [connected, setConnected] = useState<ConnectedState | null | undefined>(undefined);

  function loadStatus() {
    makeLocalApiRequest(`/v1/slack/status?project_id=${projectId}`)
      .then((r) => r.json())
      .then((data: { connected: boolean; connection_id?: string; channel_id?: string }) => {
        if (data.connected && data.connection_id && data.channel_id) {
          setConnected({ connectionId: data.connection_id, channelId: data.channel_id });
        } else {
          setConnected(null);
        }
      })
      .catch(() => setConnected(null));
  }

  useEffect(() => {
    loadStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  if (connected === undefined) {
    return (
      <div className="flex items-center gap-2 py-2">
        <SpinnerIcon className="size-icon-xs animate-spin text-low" weight="bold" />
        <span className="text-sm text-low">Loading&hellip;</span>
      </div>
    );
  }

  return (
    <SlackConnectPanel
      projectId={projectId}
      connected={connected}
      onConnected={setConnected}
      onDisconnected={() => setConnected(null)}
    />
  );
}
```

- [ ] **Step 3: Wire into `RemoteProjectsSettingsSection.tsx`**

Open `packages/web-core/src/shared/dialogs/settings/settings/RemoteProjectsSettingsSection.tsx`.

Find the import for `LinearIntegration` and add below it:
```tsx
import { SlackIntegration } from './slack-integration';
```

Find the JSX block that renders `<LinearIntegration ... />` (around line 1387). After that entire settings card/section, add a new section in the same style:

```tsx
{/* Slack integration */}
<SettingsCard>
  <SettingsField
    label={t('settings.remoteProjects.form.slack.label', 'Slack Integration')}
    description={t(
      'settings.remoteProjects.form.slack.description',
      'Send notifications to a Slack channel.'
    )}
  >
    <SlackIntegration projectId={selectedProject.id} />
  </SettingsField>
</SettingsCard>
```

- [ ] **Step 4: Run type checks**

```bash
pnpm run check
```

Expected: exits 0. Fix any TypeScript errors (e.g. component prop mismatches — check how `SettingsCard`, `SettingsField` are used in the same file for exact prop names).

- [ ] **Step 5: Commit**

```bash
git add packages/web-core/src/shared/dialogs/settings/settings/slack-integration/ \
        packages/web-core/src/shared/dialogs/settings/settings/RemoteProjectsSettingsSection.tsx
git commit -m "feat(slack): add Slack settings panel to project settings"
```

---

## Task 9: Format, lint, final check

- [ ] **Step 1: Format all code**

```bash
pnpm run format
```

Expected: exits 0.

- [ ] **Step 2: Lint**

```bash
pnpm run lint
```

Expected: exits 0. Fix any ESLint or clippy warnings.

- [ ] **Step 3: Full type check**

```bash
pnpm run check
```

Expected: exits 0.

- [ ] **Step 4: Run Rust tests**

```bash
cargo test --workspace
```

Expected: all tests pass, including the new `slack::client` tests.

- [ ] **Step 5: Final commit**

```bash
git add -p  # stage any formatting changes
git commit -m "chore: format and lint Slack integration"
```

---

## Manual Smoke Test (after deployment)

1. Open project settings → Slack Integration section should appear.
2. Enter an invalid bot token → should show "Invalid Slack bot token" error.
3. Enter the real bot token (`xoxb-...`) and channel ID (`C0ALP6LUF1R`) → should connect, show "Connected to channel C0ALP6LUF1R".
4. Change an issue's status → Slack channel should receive `[ProjectName] Issue status changed: ... → ...`.
5. Add a comment to an issue → Slack channel should receive `[ProjectName] New comment on "..." by ...`.
6. Click Disconnect → connection removed, panel returns to disconnected state.

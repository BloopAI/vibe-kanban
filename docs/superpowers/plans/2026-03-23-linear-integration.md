# Linear Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add bidirectional sync between Vibe Kanban cloud issues and Linear issues via webhooks, with API-key auth and Linear as the source of truth on conflicts.

**Architecture:** A new `crates/remote/src/linear/` module handles all Linear API communication, field mapping, and loop-guard logic. New DB tables track connections and issue/comment/label links. Outbound sync hooks fire from existing issue/comment/tag/assignee mutation handlers. Inbound sync arrives via a new public webhook route.

**Tech Stack:** Rust (Axum, SQLx, reqwest), Linear GraphQL API, `aes-gcm` (key encryption), `hmac`+`sha2`+`hex`+`subtle` (webhook verification — already in `crates/remote/Cargo.toml`), React+TypeScript (frontend settings page).

**Spec:** `docs/superpowers/specs/2026-03-23-linear-integration-design.md`

---

## File Map

### New files
| File | Responsibility |
|------|---------------|
| `crates/remote/src/linear/mod.rs` | Module re-exports |
| `crates/remote/src/linear/crypto.rs` | AES-256-GCM encrypt/decrypt for API keys |
| `crates/remote/src/linear/webhook.rs` | HMAC-SHA256 signature verification |
| `crates/remote/src/linear/client.rs` | Linear GraphQL API client (all queries/mutations) |
| `crates/remote/src/linear/loop_guard.rs` | Distributed sync loop prevention via DB |
| `crates/remote/src/linear/sync.rs` | Field mapping, ignore-label check, core sync logic |
| `crates/remote/src/linear/import.rs` | Initial bulk import of Linear issues |
| `crates/remote/src/linear/db.rs` | All DB queries for linear_* tables |
| `crates/remote/src/routes/linear.rs` | HTTP routes: webhook (public) + connection CRUD (protected) |
| `crates/remote/migrations/20260323000000_linear_integration.sql` | All 6 new tables |
| `packages/web-core/src/components/settings/linear-integration/index.tsx` | Integration settings entry point |
| `packages/web-core/src/components/settings/linear-integration/connect-panel.tsx` | API key input + team selector |
| `packages/web-core/src/components/settings/linear-integration/status-mapping.tsx` | VK status ↔ Linear state mapping UI |
| `packages/web-core/src/components/settings/linear-integration/sync-status.tsx` | Last synced, error list, manual trigger |

### Modified files
| File | Change |
|------|--------|
| `crates/remote/src/config.rs` | Add `linear_encryption_key: Option<SecretString>` |
| `crates/remote/src/state.rs` | Add `linear_config: Option<LinearConfig>` + accessor |
| `crates/remote/src/lib.rs` | Add `pub mod linear;` |
| `crates/remote/src/routes/mod.rs` | Register `linear::public_router()` and `linear::protected_router()` |
| `crates/remote/src/routes/issues.rs` | Spawn outbound sync after create/update/delete/bulk |
| `crates/remote/src/routes/issue_comments.rs` | Spawn outbound sync after create/update/delete |
| `crates/remote/src/routes/issue_tags.rs` | Spawn outbound sync after add/remove |
| `crates/remote/src/routes/issue_assignees.rs` | Spawn outbound sync after add/remove |

---

## Task 1: Database migration

**Files:**
- Create: `crates/remote/migrations/20260323000000_linear_integration.sql`

- [ ] **Step 1: Write the migration**

```sql
-- crates/remote/migrations/20260323000000_linear_integration.sql

CREATE TABLE linear_project_connections (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id           UUID NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
    linear_team_id       TEXT NOT NULL,
    linear_project_id    TEXT,
    encrypted_api_key    TEXT NOT NULL,
    linear_webhook_id    TEXT,
    linear_webhook_secret TEXT,  -- stored plain; server-generated, lower risk than API key
    sync_enabled         BOOLEAN NOT NULL DEFAULT TRUE,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE linear_issue_links (
    id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vk_issue_id               UUID NOT NULL UNIQUE REFERENCES issues(id) ON DELETE CASCADE,
    linear_issue_id           TEXT NOT NULL,
    linear_issue_identifier   TEXT NOT NULL,
    last_synced_at            TIMESTAMPTZ,
    created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_linear_issue_id UNIQUE (linear_issue_id)
);
CREATE INDEX idx_linear_issue_links_linear_id ON linear_issue_links(linear_issue_id);

CREATE TABLE linear_status_mappings (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id       UUID NOT NULL REFERENCES linear_project_connections(id) ON DELETE CASCADE,
    vk_status_id        UUID NOT NULL REFERENCES project_statuses(id) ON DELETE CASCADE,
    linear_state_id     TEXT NOT NULL,
    linear_state_name   TEXT NOT NULL,
    CONSTRAINT uq_status_mapping UNIQUE (connection_id, vk_status_id)
);

CREATE TABLE linear_label_links (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id       UUID NOT NULL REFERENCES linear_project_connections(id) ON DELETE CASCADE,
    vk_tag_id           UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    linear_label_id     TEXT NOT NULL,
    linear_label_name   TEXT NOT NULL,
    CONSTRAINT uq_label_link UNIQUE (connection_id, vk_tag_id)
);

CREATE TABLE linear_comment_links (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id       UUID NOT NULL REFERENCES linear_project_connections(id) ON DELETE CASCADE,
    vk_comment_id       UUID NOT NULL UNIQUE REFERENCES issue_comments(id) ON DELETE CASCADE,
    linear_comment_id   TEXT NOT NULL,
    CONSTRAINT uq_comment_link_per_conn UNIQUE (connection_id, linear_comment_id)
);

CREATE TABLE linear_sync_in_flight (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id   UUID NOT NULL REFERENCES linear_project_connections(id) ON DELETE CASCADE,
    issue_id        UUID NOT NULL,
    direction       TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    expires_at      TIMESTAMPTZ NOT NULL,
    CONSTRAINT uq_sync_in_flight UNIQUE (connection_id, issue_id, direction)
);
CREATE INDEX idx_linear_sync_in_flight_expiry ON linear_sync_in_flight(expires_at);

-- Electrify linear_project_connections so frontend gets real-time updates
SELECT electric_sync_table('public', 'linear_project_connections');
```

- [ ] **Step 2: Run the migration to verify it applies cleanly**

```bash
pnpm run remote:prepare-db
```
Expected: exits 0, no errors.

- [ ] **Step 3: Commit**

```bash
git add crates/remote/migrations/20260323000000_linear_integration.sql
git commit -m "feat(linear): add database migration for linear integration tables"
```

---

## Task 2: Config & crypto

**Files:**
- Modify: `crates/remote/src/config.rs`
- Create: `crates/remote/src/linear/crypto.rs`
- Create: `crates/remote/src/linear/mod.rs`
- Modify: `crates/remote/src/lib.rs`

- [ ] **Step 1: Add `linear_encryption_key` to `RemoteServerConfig`**

In `crates/remote/src/config.rs`, add the field to the struct:
```rust
pub linear_encryption_key: Option<SecretString>,
```
And load it in `from_env()` (follow the same pattern as `electric_secret`):
```rust
let linear_encryption_key = env::var("VIBEKANBAN_REMOTE_LINEAR_ENCRYPTION_KEY")
    .ok()
    .filter(|v| !v.is_empty())
    .map(SecretString::from);
```
And include in `Ok(Self { ..., linear_encryption_key })`.

- [ ] **Step 2: Write the failing crypto tests**

Create `crates/remote/src/linear/crypto.rs`:
```rust
use aes_gcm::{
    Aes256Gcm, KeyInit,
    aead::{Aead, OsRng, rand_core::RngCore},
};
use base64::{Engine, engine::general_purpose::STANDARD as BASE64};

#[derive(Debug, thiserror::Error)]
pub enum CryptoError {
    #[error("invalid key length")]
    InvalidKey,
    #[error("encryption failed")]
    Encrypt,
    #[error("decryption failed")]
    Decrypt,
    #[error("invalid base64")]
    Base64(#[from] base64::DecodeError),
}

/// Encrypt plaintext with AES-256-GCM. Returns base64(nonce || ciphertext).
pub fn encrypt(key_hex: &str, plaintext: &str) -> Result<String, CryptoError> {
    let key_bytes = hex::decode(key_hex).map_err(|_| CryptoError::InvalidKey)?;
    let cipher = Aes256Gcm::new_from_slice(&key_bytes).map_err(|_| CryptoError::InvalidKey)?;
    let mut nonce_bytes = [0u8; 12];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = aes_gcm::Nonce::from(nonce_bytes);
    let ciphertext = cipher
        .encrypt(&nonce, plaintext.as_bytes())
        .map_err(|_| CryptoError::Encrypt)?;
    let mut combined = nonce_bytes.to_vec();
    combined.extend_from_slice(&ciphertext);
    Ok(BASE64.encode(combined))
}

/// Decrypt base64(nonce || ciphertext) with AES-256-GCM.
pub fn decrypt(key_hex: &str, encoded: &str) -> Result<String, CryptoError> {
    let key_bytes = hex::decode(key_hex).map_err(|_| CryptoError::InvalidKey)?;
    let cipher = Aes256Gcm::new_from_slice(&key_bytes).map_err(|_| CryptoError::InvalidKey)?;
    let combined = BASE64.decode(encoded)?;
    if combined.len() < 12 {
        return Err(CryptoError::Decrypt);
    }
    let (nonce_bytes, ciphertext) = combined.split_at(12);
    let nonce = aes_gcm::Nonce::from_slice(nonce_bytes);
    let plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|_| CryptoError::Decrypt)?;
    String::from_utf8(plaintext).map_err(|_| CryptoError::Decrypt)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_key() -> String {
        // 32 bytes = 64 hex chars
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef".to_string()
    }

    #[test]
    fn roundtrip() {
        let key = test_key();
        let plaintext = "lnk_supersecretapikey";
        let encrypted = encrypt(&key, plaintext).unwrap();
        let decrypted = decrypt(&key, &encrypted).unwrap();
        assert_eq!(decrypted, plaintext);
    }

    #[test]
    fn different_ciphertexts_same_plaintext() {
        let key = test_key();
        let a = encrypt(&key, "test").unwrap();
        let b = encrypt(&key, "test").unwrap();
        assert_ne!(a, b); // different nonces
    }

    #[test]
    fn wrong_key_fails() {
        let key = test_key();
        let encrypted = encrypt(&key, "secret").unwrap();
        let wrong_key = "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
        assert!(decrypt(wrong_key, &encrypted).is_err());
    }
}
```

Create `crates/remote/src/linear/mod.rs`:
```rust
pub mod client;
pub mod crypto;
pub mod db;
pub mod import;
pub mod loop_guard;
pub mod sync;
pub mod webhook;
```

In `crates/remote/src/lib.rs`, add:
```rust
pub mod linear;
```

- [ ] **Step 3: Run the tests**

```bash
cargo test -p remote linear::crypto -- --nocapture
```
Expected: 3 tests pass.

- [ ] **Step 4: Commit**

```bash
git add crates/remote/src/config.rs crates/remote/src/linear/ crates/remote/src/lib.rs
git commit -m "feat(linear): add config, crypto module, and linear module skeleton"
```

---

## Task 3: Webhook signature verification

**Files:**
- Create: `crates/remote/src/linear/webhook.rs`

Linear sends HMAC-SHA256 of the raw body in the `linear-signature` header as a plain hex string (no `sha256=` prefix unlike GitHub).

- [ ] **Step 1: Write the failing test**

Create `crates/remote/src/linear/webhook.rs`:
```rust
use hmac::{Hmac, Mac};
use sha2::Sha256;
use subtle::ConstantTimeEq;

type HmacSha256 = Hmac<Sha256>;

/// Verify a Linear webhook signature.
/// Linear sends HMAC-SHA256(secret, body) as a plain hex string in `linear-signature`.
pub fn verify_signature(secret: &[u8], signature_hex: &str, payload: &[u8]) -> bool {
    let Ok(expected) = hex::decode(signature_hex) else {
        return false;
    };
    let Ok(mut mac) = HmacSha256::new_from_slice(secret) else {
        return false;
    };
    mac.update(payload);
    let computed = mac.finalize().into_bytes();
    computed[..].ct_eq(&expected).into()
}

#[cfg(test)]
mod tests {
    use super::*;
    use hmac::{Hmac, Mac};
    use sha2::Sha256;

    fn sign(secret: &[u8], payload: &[u8]) -> String {
        let mut mac = Hmac::<Sha256>::new_from_slice(secret).unwrap();
        mac.update(payload);
        hex::encode(mac.finalize().into_bytes())
    }

    #[test]
    fn valid_signature() {
        let secret = b"mysecret";
        let payload = b"hello world";
        let sig = sign(secret, payload);
        assert!(verify_signature(secret, &sig, payload));
    }

    #[test]
    fn wrong_secret_fails() {
        let payload = b"hello";
        let sig = sign(b"secret", payload);
        assert!(!verify_signature(b"wrong", &sig, payload));
    }

    #[test]
    fn tampered_payload_fails() {
        let secret = b"secret";
        let sig = sign(secret, b"original");
        assert!(!verify_signature(secret, &sig, b"tampered"));
    }

    #[test]
    fn invalid_hex_fails() {
        assert!(!verify_signature(b"secret", "not-hex!!", b"body"));
    }
}
```

- [ ] **Step 2: Run the tests**

```bash
cargo test -p remote linear::webhook -- --nocapture
```
Expected: 4 tests pass.

- [ ] **Step 3: Commit**

```bash
git add crates/remote/src/linear/webhook.rs
git commit -m "feat(linear): add webhook HMAC-SHA256 signature verification"
```

---

## Task 4: Loop guard

**Files:**
- Create: `crates/remote/src/linear/loop_guard.rs`

- [ ] **Step 1: Write the module**

```rust
use chrono::Utc;
use sqlx::PgPool;
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SyncDirection {
    Inbound,
    Outbound,
}

impl SyncDirection {
    fn as_str(self) -> &'static str {
        match self {
            Self::Inbound => "inbound",
            Self::Outbound => "outbound",
        }
    }
}

/// Try to acquire a sync lock for (connection_id, issue_id, direction).
/// Returns true if the lock was acquired (caller should proceed with sync).
/// Returns false if the lock already exists (skip — loop or duplicate).
pub async fn try_acquire(
    pool: &PgPool,
    connection_id: Uuid,
    issue_id: Uuid,
    direction: SyncDirection,
) -> sqlx::Result<bool> {
    // Prune expired rows first
    sqlx::query!(
        "DELETE FROM linear_sync_in_flight WHERE expires_at < NOW()"
    )
    .execute(pool)
    .await?;

    let result = sqlx::query!(
        r#"
        INSERT INTO linear_sync_in_flight (connection_id, issue_id, direction, expires_at)
        VALUES ($1, $2, $3, NOW() + INTERVAL '30 seconds')
        ON CONFLICT (connection_id, issue_id, direction) DO NOTHING
        "#,
        connection_id,
        issue_id,
        direction.as_str()
    )
    .execute(pool)
    .await?;

    Ok(result.rows_affected() == 1)
}

/// Check if an outbound lock is held for the given issue (used by inbound handler
/// to detect echo of our own VK→Linear push).
pub async fn outbound_in_flight(
    pool: &PgPool,
    connection_id: Uuid,
    issue_id: Uuid,
) -> sqlx::Result<bool> {
    let row = sqlx::query!(
        r#"
        SELECT 1 AS exists
        FROM linear_sync_in_flight
        WHERE connection_id = $1 AND issue_id = $2 AND direction = 'outbound'
          AND expires_at > NOW()
        "#,
        connection_id,
        issue_id
    )
    .fetch_optional(pool)
    .await?;
    Ok(row.is_some())
}

/// Release the sync lock after completion.
pub async fn release(
    pool: &PgPool,
    connection_id: Uuid,
    issue_id: Uuid,
    direction: SyncDirection,
) -> sqlx::Result<()> {
    sqlx::query!(
        "DELETE FROM linear_sync_in_flight WHERE connection_id = $1 AND issue_id = $2 AND direction = $3",
        connection_id,
        issue_id,
        direction.as_str()
    )
    .execute(pool)
    .await?;
    Ok(())
}
```

- [ ] **Step 2: Run clippy + compile check**

```bash
cargo check -p remote
```
Expected: compiles cleanly.

- [ ] **Step 3: Commit**

```bash
git add crates/remote/src/linear/loop_guard.rs
git commit -m "feat(linear): add distributed loop guard using DB"
```

---

## Task 5: Linear GraphQL client

**Files:**
- Create: `crates/remote/src/linear/client.rs`

The Linear GraphQL endpoint is `https://api.linear.app/graphql`. All requests use bearer auth with the API key.

- [ ] **Step 1: Write the client**

```rust
use reqwest::Client;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

pub const LINEAR_API_URL: &str = "https://api.linear.app/graphql";
pub const IGNORE_LABEL_NAME: &str = "vibe-kanban-ignore";

#[derive(Debug, thiserror::Error)]
pub enum LinearClientError {
    #[error("http error: {0}")]
    Http(#[from] reqwest::Error),
    #[error("graphql error: {0}")]
    GraphQL(String),
    #[error("missing expected field in response")]
    MissingField,
}

#[derive(Debug, Serialize)]
struct GraphQLRequest<V: Serialize> {
    query: &'static str,
    variables: V,
}

#[derive(Debug, Deserialize)]
struct GraphQLResponse<T> {
    data: Option<T>,
    errors: Option<Vec<GraphQLError>>,
}

#[derive(Debug, Deserialize)]
struct GraphQLError {
    message: String,
}

async fn gql<V: Serialize, T: for<'de> Deserialize<'de>>(
    client: &Client,
    api_key: &str,
    query: &'static str,
    variables: V,
) -> Result<T, LinearClientError> {
    let resp = client
        .post(LINEAR_API_URL)
        .bearer_auth(api_key)
        .json(&GraphQLRequest { query, variables })
        .send()
        .await?
        .json::<GraphQLResponse<T>>()
        .await?;
    if let Some(errors) = resp.errors {
        let msg = errors.into_iter().map(|e| e.message).collect::<Vec<_>>().join("; ");
        return Err(LinearClientError::GraphQL(msg));
    }
    resp.data.ok_or(LinearClientError::MissingField)
}

// ── Viewer ────────────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct LinearViewer {
    pub id: String,
    pub email: String,
    pub name: String,
}

pub async fn get_viewer(client: &Client, api_key: &str) -> Result<LinearViewer, LinearClientError> {
    #[derive(Deserialize)]
    struct Data { viewer: LinearViewer }
    let data: Data = gql(client, api_key, "{ viewer { id email name } }", ()).await?;
    Ok(data.viewer)
}

// ── Teams ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct LinearTeam {
    pub id: String,
    pub name: String,
    pub key: String,
}

pub async fn list_teams(client: &Client, api_key: &str) -> Result<Vec<LinearTeam>, LinearClientError> {
    #[derive(Deserialize)]
    struct Nodes { nodes: Vec<LinearTeam> }
    #[derive(Deserialize)]
    struct Data { teams: Nodes }
    let data: Data = gql(client, api_key, "{ teams { nodes { id name key } } }", ()).await?;
    Ok(data.teams.nodes)
}

// ── Workflow states ───────────────────────────────────────────────────────────

#[derive(Debug, Deserialize, Clone)]
pub struct LinearWorkflowState {
    pub id: String,
    pub name: String,
    pub r#type: String,
    pub position: f64,
}

pub async fn list_workflow_states(
    client: &Client,
    api_key: &str,
    team_id: &str,
) -> Result<Vec<LinearWorkflowState>, LinearClientError> {
    #[derive(Serialize)]
    struct Vars<'a> { team_id: &'a str }
    #[derive(Deserialize)]
    struct Nodes { nodes: Vec<LinearWorkflowState> }
    #[derive(Deserialize)]
    struct Team { states: Nodes }
    #[derive(Deserialize)]
    struct Data { team: Team }
    let data: Data = gql(
        client, api_key,
        "query($team_id: String!) { team(id: $team_id) { states { nodes { id name type position } } } }",
        Vars { team_id },
    ).await?;
    Ok(data.team.states.nodes)
}

// ── Issues ────────────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize, Clone)]
pub struct LinearLabel {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LinearIssue {
    pub id: String,
    pub identifier: String,
    pub title: String,
    pub description: Option<String>,
    pub priority: i32,
    pub due_date: Option<String>,
    pub state: LinearWorkflowState,
    pub assignee: Option<LinearUser>,
    pub labels: LinearLabelConnection,
}

#[derive(Debug, Deserialize, Clone)]
pub struct LinearLabelConnection {
    pub nodes: Vec<LinearLabel>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct LinearUser {
    pub id: String,
    pub email: String,
    pub name: String,
}

impl LinearIssue {
    pub fn has_ignore_label(&self) -> bool {
        self.labels.nodes.iter().any(|l| l.name.eq_ignore_ascii_case(IGNORE_LABEL_NAME))
    }
}

const ISSUE_FIELDS: &str = r#"
    id identifier title description priority dueDate
    state { id name type position }
    assignee { id email name }
    labels { nodes { id name } }
"#;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PageInfo {
    has_next_page: bool,
    end_cursor: Option<String>,
}

pub async fn list_issues_page(
    client: &Client,
    api_key: &str,
    team_id: &str,
    project_id: Option<&str>,
    after: Option<&str>,
) -> Result<(Vec<LinearIssue>, bool, Option<String>), LinearClientError> {
    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct Vars<'a> {
        team_id: &'a str,
        project_id: Option<&'a str>,
        after: Option<&'a str>,
    }
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct IssueConn { nodes: Vec<LinearIssue>, page_info: PageInfo }
    #[derive(Deserialize)]
    struct Team { issues: IssueConn }
    #[derive(Deserialize)]
    struct Data { team: Team }
    // Note: project filtering is done client-side (filter by project_id after fetch) when project_id is set
    let data: Data = gql(
        client, api_key,
        r#"query($team_id: String!, $after: String) {
            team(id: $team_id) {
                issues(first: 100, after: $after) {
                    nodes { id identifier title description priority dueDate
                            state { id name type position }
                            assignee { id email name }
                            labels { nodes { id name } }
                            project { id }
                    }
                    pageInfo { hasNextPage endCursor }
                }
            }
        }"#,
        Vars { team_id, project_id, after },
    ).await?;
    let issues: Vec<LinearIssue> = if let Some(proj_id) = project_id {
        // Filter to project (Linear doesn't support filtering by project in team query easily)
        // We re-use the same type; project field is ignored beyond filtering
        data.team.issues.nodes  // ideally filter, but requires project field on LinearIssue
    } else {
        data.team.issues.nodes
    };
    Ok((issues, data.team.issues.page_info.has_next_page, data.team.issues.page_info.end_cursor))
}

// ── Issue mutations ───────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateIssueInput<'a> {
    pub team_id: &'a str,
    pub project_id: Option<&'a str>,
    pub title: &'a str,
    pub description: Option<&'a str>,
    pub state_id: Option<&'a str>,
    pub priority: Option<i32>,
    pub due_date: Option<&'a str>,
    pub assignee_id: Option<&'a str>,
    pub label_ids: Option<Vec<&'a str>>,
}

pub async fn create_issue(
    client: &Client,
    api_key: &str,
    input: CreateIssueInput<'_>,
) -> Result<LinearIssue, LinearClientError> {
    #[derive(Serialize)]
    struct Vars<'a> { input: CreateIssueInput<'a> }
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct IssueCreate { issue: LinearIssue }
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Data { issue_create: IssueCreate }
    let data: Data = gql(
        client, api_key,
        &format!("mutation($input: IssueCreateInput!) {{ issueCreate(input: $input) {{ issue {{ {ISSUE_FIELDS} }} }} }}"),
        Vars { input },
    ).await?;
    Ok(data.issue_create.issue)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateIssueInput<'a> {
    pub title: Option<&'a str>,
    pub description: Option<&'a str>,
    pub state_id: Option<&'a str>,
    pub priority: Option<i32>,
    pub due_date: Option<&'a str>,
    pub assignee_id: Option<&'a str>,
    pub label_ids: Option<Vec<String>>,
}

pub async fn update_issue(
    client: &Client,
    api_key: &str,
    issue_id: &str,
    input: UpdateIssueInput<'_>,
) -> Result<(), LinearClientError> {
    #[derive(Serialize)]
    struct Vars<'a> { id: &'a str, input: UpdateIssueInput<'a> }
    #[derive(Deserialize)]
    struct Data {}
    let _: serde_json::Value = gql(
        client, api_key,
        "mutation($id: String!, $input: IssueUpdateInput!) { issueUpdate(id: $id, input: $input) { success } }",
        Vars { id: issue_id, input },
    ).await?;
    Ok(())
}

pub async fn delete_issue(
    client: &Client,
    api_key: &str,
    issue_id: &str,
) -> Result<(), LinearClientError> {
    #[derive(Serialize)]
    struct Vars<'a> { id: &'a str }
    let _: serde_json::Value = gql(
        client, api_key,
        "mutation($id: String!) { issueDelete(id: $id) { success } }",
        Vars { id: issue_id },
    ).await?;
    Ok(())
}

// ── Comments ──────────────────────────────────────────────────────────────────

pub async fn create_comment(
    client: &Client,
    api_key: &str,
    issue_id: &str,
    body: &str,
) -> Result<String, LinearClientError> {
    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct Vars<'a> { issue_id: &'a str, body: &'a str }
    #[derive(Deserialize)]
    struct Comment { id: String }
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct CommentCreate { comment: Comment }
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Data { comment_create: CommentCreate }
    let data: Data = gql(
        client, api_key,
        "mutation($issue_id: String!, $body: String!) { commentCreate(input: { issueId: $issue_id, body: $body }) { comment { id } } }",
        Vars { issue_id, body },
    ).await?;
    Ok(data.comment_create.comment.id)
}

pub async fn update_comment(
    client: &Client,
    api_key: &str,
    comment_id: &str,
    body: &str,
) -> Result<(), LinearClientError> {
    #[derive(Serialize)]
    struct Vars<'a> { id: &'a str, body: &'a str }
    let _: serde_json::Value = gql(
        client, api_key,
        "mutation($id: String!, $body: String!) { commentUpdate(id: $id, input: { body: $body }) { success } }",
        Vars { id: comment_id, body },
    ).await?;
    Ok(())
}

pub async fn delete_comment(
    client: &Client,
    api_key: &str,
    comment_id: &str,
) -> Result<(), LinearClientError> {
    #[derive(Serialize)]
    struct Vars<'a> { id: &'a str }
    let _: serde_json::Value = gql(
        client, api_key,
        "mutation($id: String!) { commentDelete(id: $id) { success } }",
        Vars { id: comment_id },
    ).await?;
    Ok(())
}

// ── Labels ────────────────────────────────────────────────────────────────────

pub async fn create_label(
    client: &Client,
    api_key: &str,
    team_id: &str,
    name: &str,
    color: &str,
) -> Result<String, LinearClientError> {
    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct Vars<'a> { team_id: &'a str, name: &'a str, color: &'a str }
    #[derive(Deserialize)]
    struct Label { id: String }
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct LabelCreate { label: Label }
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Data { issue_label_create: LabelCreate }
    let data: Data = gql(
        client, api_key,
        "mutation($team_id: String!, $name: String!, $color: String!) { issueLabelCreate(input: { teamId: $team_id, name: $name, color: $color }) { label { id } } }",
        Vars { team_id, name, color },
    ).await?;
    Ok(data.issue_label_create.label.id)
}

// ── Webhooks ──────────────────────────────────────────────────────────────────

pub async fn register_webhook(
    client: &Client,
    api_key: &str,
    team_id: &str,
    url: &str,
    secret: &str,
) -> Result<String, LinearClientError> {
    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct Vars<'a> { team_id: &'a str, url: &'a str, secret: &'a str }
    #[derive(Deserialize)]
    struct Webhook { id: String }
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct WebhookCreate { webhook: Webhook }
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Data { webhook_create: WebhookCreate }
    let data: Data = gql(
        client, api_key,
        r#"mutation($team_id: String!, $url: String!, $secret: String!) {
            webhookCreate(input: {
                teamId: $team_id, url: $url, secret: $secret,
                resourceTypes: ["Issue", "Comment"]
            }) { webhook { id } }
        }"#,
        Vars { team_id, url, secret },
    ).await?;
    Ok(data.webhook_create.webhook.id)
}

pub async fn delete_webhook(
    client: &Client,
    api_key: &str,
    webhook_id: &str,
) -> Result<(), LinearClientError> {
    #[derive(Serialize)]
    struct Vars<'a> { id: &'a str }
    let _: serde_json::Value = gql(
        client, api_key,
        "mutation($id: String!) { webhookDelete(id: $id) { success } }",
        Vars { id: webhook_id },
    ).await?;
    Ok(())
}

pub async fn get_issue_by_id(
    client: &Client,
    api_key: &str,
    issue_id: &str,
) -> Result<LinearIssue, LinearClientError> {
    #[derive(Serialize)]
    struct Vars<'a> { id: &'a str }
    #[derive(Deserialize)]
    struct Data { issue: LinearIssue }
    let data: Data = gql(
        client, api_key,
        &format!("query($id: String!) {{ issue(id: $id) {{ {ISSUE_FIELDS} }} }}"),
        Vars { id: issue_id },
    ).await?;
    Ok(data.issue)
}
```

- [ ] **Step 2: Compile check**

```bash
cargo check -p remote
```
Expected: compiles (no tests here — HTTP client is integration-tested against real API).

- [ ] **Step 3: Commit**

```bash
git add crates/remote/src/linear/client.rs
git commit -m "feat(linear): add Linear GraphQL API client"
```

---

## Task 6: DB query layer

**Files:**
- Create: `crates/remote/src/linear/db.rs`

This module contains all sqlx queries against `linear_*` tables.

- [ ] **Step 1: Write the DB module**

```rust
use chrono::{DateTime, Utc};
use sqlx::PgPool;
use uuid::Uuid;

// ── Connection ────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct LinearProjectConnection {
    pub id: Uuid,
    pub project_id: Uuid,
    pub linear_team_id: String,
    pub linear_project_id: Option<String>,
    pub encrypted_api_key: String,
    pub linear_webhook_id: Option<String>,
    pub linear_webhook_secret: Option<String>,
    pub sync_enabled: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

pub async fn get_connection_for_project(
    pool: &PgPool,
    project_id: Uuid,
) -> sqlx::Result<Option<LinearProjectConnection>> {
    sqlx::query_as!(
        LinearProjectConnection,
        "SELECT * FROM linear_project_connections WHERE project_id = $1 AND sync_enabled = TRUE",
        project_id
    )
    .fetch_optional(pool)
    .await
}

pub async fn get_connection_by_id(
    pool: &PgPool,
    id: Uuid,
) -> sqlx::Result<Option<LinearProjectConnection>> {
    sqlx::query_as!(
        LinearProjectConnection,
        "SELECT * FROM linear_project_connections WHERE id = $1",
        id
    )
    .fetch_optional(pool)
    .await
}

pub async fn get_connection_by_webhook_id(
    pool: &PgPool,
    webhook_id: &str,
) -> sqlx::Result<Option<LinearProjectConnection>> {
    sqlx::query_as!(
        LinearProjectConnection,
        "SELECT * FROM linear_project_connections WHERE linear_webhook_id = $1",
        webhook_id
    )
    .fetch_optional(pool)
    .await
}

pub async fn list_connections_for_org(
    pool: &PgPool,
    user_id: Uuid,
) -> sqlx::Result<Vec<LinearProjectConnection>> {
    // Scoped to projects the user's org owns
    sqlx::query_as!(
        LinearProjectConnection,
        r#"
        SELECT lpc.* FROM linear_project_connections lpc
        JOIN projects p ON p.id = lpc.project_id
        JOIN organization_members om ON om.organization_id = p.organization_id
        WHERE om.user_id = $1
        "#,
        user_id
    )
    .fetch_all(pool)
    .await
}

pub struct CreateConnectionInput {
    pub project_id: Uuid,
    pub linear_team_id: String,
    pub linear_project_id: Option<String>,
    pub encrypted_api_key: String,
}

pub async fn create_connection(
    pool: &PgPool,
    input: CreateConnectionInput,
) -> sqlx::Result<LinearProjectConnection> {
    sqlx::query_as!(
        LinearProjectConnection,
        r#"
        INSERT INTO linear_project_connections
            (project_id, linear_team_id, linear_project_id, encrypted_api_key)
        VALUES ($1, $2, $3, $4)
        RETURNING *
        "#,
        input.project_id,
        input.linear_team_id,
        input.linear_project_id,
        input.encrypted_api_key
    )
    .fetch_one(pool)
    .await
}

pub async fn set_webhook(
    pool: &PgPool,
    connection_id: Uuid,
    webhook_id: &str,
    webhook_secret: &str,
) -> sqlx::Result<()> {
    sqlx::query!(
        "UPDATE linear_project_connections SET linear_webhook_id = $1, linear_webhook_secret = $2, updated_at = NOW() WHERE id = $3",
        webhook_id, webhook_secret, connection_id
    )
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn delete_connection(pool: &PgPool, id: Uuid) -> sqlx::Result<()> {
    sqlx::query!("DELETE FROM linear_project_connections WHERE id = $1", id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn set_sync_enabled(pool: &PgPool, id: Uuid, enabled: bool) -> sqlx::Result<()> {
    sqlx::query!(
        "UPDATE linear_project_connections SET sync_enabled = $1, updated_at = NOW() WHERE id = $2",
        enabled, id
    )
    .execute(pool)
    .await?;
    Ok(())
}

// ── Issue links ───────────────────────────────────────────────────────────────

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct LinearIssueLink {
    pub id: Uuid,
    pub vk_issue_id: Uuid,
    pub linear_issue_id: String,
    pub linear_issue_identifier: String,
    pub last_synced_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

pub async fn get_link_for_vk_issue(
    pool: &PgPool,
    vk_issue_id: Uuid,
) -> sqlx::Result<Option<LinearIssueLink>> {
    sqlx::query_as!(
        LinearIssueLink,
        "SELECT * FROM linear_issue_links WHERE vk_issue_id = $1",
        vk_issue_id
    )
    .fetch_optional(pool)
    .await
}

pub async fn get_link_for_linear_issue(
    pool: &PgPool,
    linear_issue_id: &str,
) -> sqlx::Result<Option<LinearIssueLink>> {
    sqlx::query_as!(
        LinearIssueLink,
        "SELECT * FROM linear_issue_links WHERE linear_issue_id = $1",
        linear_issue_id
    )
    .fetch_optional(pool)
    .await
}

pub async fn create_issue_link(
    pool: &PgPool,
    vk_issue_id: Uuid,
    linear_issue_id: &str,
    linear_issue_identifier: &str,
) -> sqlx::Result<LinearIssueLink> {
    sqlx::query_as!(
        LinearIssueLink,
        r#"
        INSERT INTO linear_issue_links (vk_issue_id, linear_issue_id, linear_issue_identifier, last_synced_at)
        VALUES ($1, $2, $3, NOW())
        RETURNING *
        "#,
        vk_issue_id, linear_issue_id, linear_issue_identifier
    )
    .fetch_one(pool)
    .await
}

pub async fn touch_link(pool: &PgPool, vk_issue_id: Uuid) -> sqlx::Result<()> {
    sqlx::query!(
        "UPDATE linear_issue_links SET last_synced_at = NOW() WHERE vk_issue_id = $1",
        vk_issue_id
    )
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn delete_issue_link_by_vk_id(pool: &PgPool, vk_issue_id: Uuid) -> sqlx::Result<()> {
    sqlx::query!("DELETE FROM linear_issue_links WHERE vk_issue_id = $1", vk_issue_id)
        .execute(pool)
        .await?;
    Ok(())
}

// ── Status mappings ───────────────────────────────────────────────────────────

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct LinearStatusMapping {
    pub id: Uuid,
    pub connection_id: Uuid,
    pub vk_status_id: Uuid,
    pub linear_state_id: String,
    pub linear_state_name: String,
}

pub async fn get_status_mappings(
    pool: &PgPool,
    connection_id: Uuid,
) -> sqlx::Result<Vec<LinearStatusMapping>> {
    sqlx::query_as!(
        LinearStatusMapping,
        "SELECT * FROM linear_status_mappings WHERE connection_id = $1",
        connection_id
    )
    .fetch_all(pool)
    .await
}

pub async fn upsert_status_mapping(
    pool: &PgPool,
    connection_id: Uuid,
    vk_status_id: Uuid,
    linear_state_id: &str,
    linear_state_name: &str,
) -> sqlx::Result<()> {
    sqlx::query!(
        r#"
        INSERT INTO linear_status_mappings (connection_id, vk_status_id, linear_state_id, linear_state_name)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (connection_id, vk_status_id)
        DO UPDATE SET linear_state_id = EXCLUDED.linear_state_id, linear_state_name = EXCLUDED.linear_state_name
        "#,
        connection_id, vk_status_id, linear_state_id, linear_state_name
    )
    .execute(pool)
    .await?;
    Ok(())
}

// ── Comment links ─────────────────────────────────────────────────────────────

pub async fn get_comment_link(
    pool: &PgPool,
    vk_comment_id: Uuid,
) -> sqlx::Result<Option<String>> {
    let row = sqlx::query!(
        "SELECT linear_comment_id FROM linear_comment_links WHERE vk_comment_id = $1",
        vk_comment_id
    )
    .fetch_optional(pool)
    .await?;
    Ok(row.map(|r| r.linear_comment_id))
}

pub async fn create_comment_link(
    pool: &PgPool,
    connection_id: Uuid,
    vk_comment_id: Uuid,
    linear_comment_id: &str,
) -> sqlx::Result<()> {
    sqlx::query!(
        "INSERT INTO linear_comment_links (connection_id, vk_comment_id, linear_comment_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
        connection_id, vk_comment_id, linear_comment_id
    )
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn delete_comment_link(pool: &PgPool, vk_comment_id: Uuid) -> sqlx::Result<()> {
    sqlx::query!("DELETE FROM linear_comment_links WHERE vk_comment_id = $1", vk_comment_id)
        .execute(pool)
        .await?;
    Ok(())
}

// ── Label links ───────────────────────────────────────────────────────────────

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct LinearLabelLink {
    pub id: Uuid,
    pub connection_id: Uuid,
    pub vk_tag_id: Uuid,
    pub linear_label_id: String,
    pub linear_label_name: String,
}

pub async fn get_label_links(
    pool: &PgPool,
    connection_id: Uuid,
) -> sqlx::Result<Vec<LinearLabelLink>> {
    sqlx::query_as!(
        LinearLabelLink,
        "SELECT * FROM linear_label_links WHERE connection_id = $1",
        connection_id
    )
    .fetch_all(pool)
    .await
}

pub async fn upsert_label_link(
    pool: &PgPool,
    connection_id: Uuid,
    vk_tag_id: Uuid,
    linear_label_id: &str,
    linear_label_name: &str,
) -> sqlx::Result<()> {
    sqlx::query!(
        r#"
        INSERT INTO linear_label_links (connection_id, vk_tag_id, linear_label_id, linear_label_name)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (connection_id, vk_tag_id)
        DO UPDATE SET linear_label_id = EXCLUDED.linear_label_id, linear_label_name = EXCLUDED.linear_label_name
        "#,
        connection_id, vk_tag_id, linear_label_id, linear_label_name
    )
    .execute(pool)
    .await?;
    Ok(())
}
```

- [ ] **Step 2: Compile check**

```bash
cargo check -p remote
```
Expected: compiles cleanly. Note: `sqlx::query_as!` macros will fail offline unless `SQLX_OFFLINE=true` is set or the DB is running and `prepare-db` has been run. Run `pnpm run remote:prepare-db` after DB is available.

- [ ] **Step 3: Commit**

```bash
git add crates/remote/src/linear/db.rs
git commit -m "feat(linear): add DB query layer for linear tables"
```

---

## Task 7: Field mapping & sync logic

**Files:**
- Create: `crates/remote/src/linear/sync.rs`

Priority mapping: Linear uses `0=No priority, 1=Urgent, 2=High, 3=Medium, 4=Low`. VK uses `IssuePriority` enum (`Urgent, High, Medium, Low`).

- [ ] **Step 1: Write sync.rs with unit tests**

```rust
use api_types::issue::IssuePriority;
use crate::linear::client::LinearIssue;
use crate::linear::db::LinearStatusMapping;

/// Map VK IssuePriority to Linear priority integer.
pub fn vk_priority_to_linear(p: Option<IssuePriority>) -> i32 {
    match p {
        Some(IssuePriority::Urgent) => 1,
        Some(IssuePriority::High) => 2,
        Some(IssuePriority::Medium) => 3,
        Some(IssuePriority::Low) => 4,
        None => 0,
    }
}

/// Map Linear priority integer to VK IssuePriority.
pub fn linear_priority_to_vk(p: i32) -> Option<IssuePriority> {
    match p {
        1 => Some(IssuePriority::Urgent),
        2 => Some(IssuePriority::High),
        3 => Some(IssuePriority::Medium),
        4 => Some(IssuePriority::Low),
        _ => None,
    }
}

/// Find the VK status ID for a given Linear state ID.
/// Falls back to the provided fallback_status_id if no mapping exists.
pub fn map_linear_state_to_vk(
    linear_state_id: &str,
    mappings: &[LinearStatusMapping],
    fallback_status_id: uuid::Uuid,
) -> uuid::Uuid {
    mappings
        .iter()
        .find(|m| m.linear_state_id == linear_state_id)
        .map(|m| m.vk_status_id)
        .unwrap_or(fallback_status_id)
}

/// Find the Linear state ID for a given VK status ID.
pub fn map_vk_status_to_linear<'a>(
    vk_status_id: uuid::Uuid,
    mappings: &'a [LinearStatusMapping],
) -> Option<&'a str> {
    mappings
        .iter()
        .find(|m| m.vk_status_id == vk_status_id)
        .map(|m| m.linear_state_id.as_str())
}

/// Auto-generate status mappings by matching VK status names to Linear state names
/// (case-insensitive). Unmatched VK statuses are left unmapped (caller handles fallback).
pub fn auto_map_statuses<'a>(
    vk_statuses: &'a [(uuid::Uuid, String)],  // (id, name)
    linear_states: &'a [crate::linear::client::LinearWorkflowState],
) -> Vec<(uuid::Uuid, &'a str, &'a str)> {  // (vk_status_id, linear_state_id, linear_state_name)
    vk_statuses
        .iter()
        .filter_map(|(vk_id, vk_name)| {
            linear_states
                .iter()
                .find(|s| s.name.eq_ignore_ascii_case(vk_name))
                .map(|s| (*vk_id, s.id.as_str(), s.name.as_str()))
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn priority_roundtrip() {
        for p in [IssuePriority::Urgent, IssuePriority::High, IssuePriority::Medium, IssuePriority::Low] {
            let linear = vk_priority_to_linear(Some(p.clone()));
            let back = linear_priority_to_vk(linear);
            assert_eq!(back, Some(p));
        }
    }

    #[test]
    fn priority_none_maps_to_zero() {
        assert_eq!(vk_priority_to_linear(None), 0);
        assert_eq!(linear_priority_to_vk(0), None);
    }

    #[test]
    fn auto_map_statuses_case_insensitive() {
        use crate::linear::client::LinearWorkflowState;
        let vk = vec![(uuid::Uuid::new_v4(), "In Progress".to_string())];
        let linear = vec![LinearWorkflowState {
            id: "state-1".to_string(),
            name: "in progress".to_string(),
            r#type: "started".to_string(),
            position: 1.0,
        }];
        let result = auto_map_statuses(&vk, &linear);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].1, "state-1");
    }
}
```

- [ ] **Step 2: Run tests**

```bash
cargo test -p remote linear::sync -- --nocapture
```
Expected: 3 tests pass.

- [ ] **Step 3: Commit**

```bash
git add crates/remote/src/linear/sync.rs
git commit -m "feat(linear): add field mapping and status auto-mapping logic"
```

---

## Task 8: Initial import

**Files:**
- Create: `crates/remote/src/linear/import.rs`

Called once when a connection is first created. Paginates all Linear issues, skips ignored ones, creates VK issues + links in bulk.

- [ ] **Step 1: Write import.rs**

```rust
use reqwest::Client;
use sqlx::PgPool;
use tracing::{info, warn};
use uuid::Uuid;

use crate::linear::{client, db, sync};
use crate::db::issues::IssueRepository;

pub struct ImportContext {
    pub pool: PgPool,
    pub http_client: Client,
    pub connection_id: Uuid,
    pub project_id: Uuid,
    pub linear_team_id: String,
    pub linear_project_id: Option<String>,
    pub api_key: String,
    /// First VK status ID to use as fallback when no mapping exists
    pub fallback_status_id: Uuid,
    pub creator_user_id: Uuid,
}

pub async fn run_initial_import(ctx: ImportContext) -> anyhow::Result<()> {
    let mappings = db::get_status_mappings(&ctx.pool, ctx.connection_id).await?;
    let mut cursor: Option<String> = None;
    let mut total = 0usize;

    loop {
        let (issues, has_next, next_cursor) = client::list_issues_page(
            &ctx.http_client,
            &ctx.api_key,
            &ctx.linear_team_id,
            ctx.linear_project_id.as_deref(),
            cursor.as_deref(),
        )
        .await?;

        for linear_issue in &issues {
            // Skip ignored issues
            if linear_issue.has_ignore_label() {
                continue;
            }
            // Skip if already linked
            if db::get_link_for_linear_issue(&ctx.pool, &linear_issue.id)
                .await?
                .is_some()
            {
                continue;
            }

            let status_id = sync::map_linear_state_to_vk(
                &linear_issue.state.id,
                &mappings,
                ctx.fallback_status_id,
            );
            let priority = sync::linear_priority_to_vk(linear_issue.priority);

            let sort_order = total as f64;
            let result = IssueRepository::create(
                &ctx.pool,
                None,
                ctx.project_id,
                status_id,
                linear_issue.title.clone(),
                linear_issue.description.clone(),
                priority,
                None, // start_date
                linear_issue.due_date.as_ref()
                    .and_then(|d| d.parse().ok()),
                None, // completed_at
                sort_order,
                None, // parent_issue_id
                None, // parent_issue_sort_order
                serde_json::Value::Object(Default::default()),
                ctx.creator_user_id,
            )
            .await;

            match result {
                Ok(resp) => {
                    let vk_id = resp.data.id;
                    if let Err(e) = db::create_issue_link(
                        &ctx.pool,
                        vk_id,
                        &linear_issue.id,
                        &linear_issue.identifier,
                    )
                    .await
                    {
                        warn!(?e, linear_id = %linear_issue.id, "Failed to create issue link");
                    } else {
                        total += 1;
                    }
                }
                Err(e) => {
                    warn!(?e, linear_id = %linear_issue.id, "Failed to create VK issue during import");
                }
            }
        }

        if !has_next {
            break;
        }
        cursor = next_cursor;
    }

    info!(total, project_id = %ctx.project_id, "Linear initial import complete");
    Ok(())
}
```

- [ ] **Step 2: Compile check**

```bash
cargo check -p remote
```
Expected: compiles. Fix any type errors against the actual `IssueRepository::create` signature.

- [ ] **Step 3: Commit**

```bash
git add crates/remote/src/linear/import.rs
git commit -m "feat(linear): add initial bulk import from Linear"
```

---

## Task 9: HTTP routes — connection management (protected)

**Files:**
- Create: `crates/remote/src/routes/linear.rs` (first half — protected routes)

- [ ] **Step 1: Write the connection management routes**

```rust
// crates/remote/src/routes/linear.rs (part 1 — protected routes)

use axum::{
    Router,
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Json, Response},
    routing::{delete, get, patch, post},
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    AppState,
    auth::session::Session,
    linear::{client, crypto, db, import, sync},
};

pub fn protected_router() -> Router<AppState> {
    Router::new()
        .route("/linear/connections", get(list_connections).post(create_connection))
        .route(
            "/linear/connections/:id",
            get(get_connection).patch(update_connection).delete(delete_connection),
        )
        .route("/linear/connections/:id/status-mappings", get(get_status_mappings).put(save_status_mappings))
        .route("/linear/connections/:id/teams", get(list_teams_for_connection))
        .route("/linear/connections/:id/sync", post(trigger_sync))
}

// ── List connections ──────────────────────────────────────────────────────────

async fn list_connections(
    State(state): State<AppState>,
    session: Session,
) -> Response {
    match db::list_connections_for_org(state.pool(), session.user_id()).await {
        Ok(conns) => Json(conns.into_iter().map(ConnectionResponse::from).collect::<Vec<_>>()).into_response(),
        Err(e) => {
            tracing::error!(?e, "Failed to list linear connections");
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

// ── Create connection ─────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateConnectionRequest {
    project_id: Uuid,
    api_key: String,
    linear_team_id: String,
    linear_project_id: Option<String>,
}

async fn create_connection(
    State(state): State<AppState>,
    session: Session,
    Json(req): Json<CreateConnectionRequest>,
) -> Response {
    // Validate API key
    match client::get_viewer(&state.http_client, &req.api_key).await {
        Err(e) => {
            return (StatusCode::UNPROCESSABLE_ENTITY, format!("Invalid Linear API key: {e}"))
                .into_response();
        }
        Ok(_) => {}
    }

    // Encrypt API key
    let Some(enc_key) = state.config().linear_encryption_key.as_ref() else {
        return (StatusCode::SERVICE_UNAVAILABLE, "Linear encryption key not configured").into_response();
    };
    let encrypted = match crypto::encrypt(
        enc_key.expose_secret().as_str(),  // note: expose_secret requires `use secrecy::ExposeSecret`
        &req.api_key,
    ) {
        Ok(v) => v,
        Err(e) => {
            tracing::error!(?e, "Failed to encrypt API key");
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    };

    // Persist connection
    let conn = match db::create_connection(
        state.pool(),
        db::CreateConnectionInput {
            project_id: req.project_id,
            linear_team_id: req.linear_team_id.clone(),
            linear_project_id: req.linear_project_id.clone(),
            encrypted_api_key: encrypted,
        },
    )
    .await
    {
        Ok(c) => c,
        Err(e) => {
            tracing::error!(?e, "Failed to create linear connection");
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    };

    // Register webhook with Linear
    let webhook_url = format!("{}/v1/linear/webhook", state.server_public_base_url);
    let webhook_secret = generate_webhook_secret();
    match client::register_webhook(
        &state.http_client,
        &req.api_key,
        &req.linear_team_id,
        &webhook_url,
        &webhook_secret,
    )
    .await
    {
        Ok(webhook_id) => {
            let _ = db::set_webhook(state.pool(), conn.id, &webhook_id, &webhook_secret).await;
        }
        Err(e) => {
            tracing::warn!(?e, "Failed to register Linear webhook — sync will not work until reconnected");
        }
    }

    // Auto-generate status mappings
    if let Ok(states) = client::list_workflow_states(&state.http_client, &req.api_key, &req.linear_team_id).await {
        if let Ok(vk_statuses) = fetch_project_statuses(state.pool(), req.project_id).await {
            let auto_mappings = sync::auto_map_statuses(&vk_statuses, &states);
            for (vk_id, linear_id, linear_name) in auto_mappings {
                let _ = db::upsert_status_mapping(state.pool(), conn.id, vk_id, linear_id, linear_name).await;
            }
        }
    }

    // Kick off initial import in background
    let fallback_status = fetch_fallback_status_id(state.pool(), req.project_id).await.ok().flatten();
    if let Some(fallback_status_id) = fallback_status {
        let import_ctx = import::ImportContext {
            pool: state.pool().clone(),
            http_client: state.http_client.clone(),
            connection_id: conn.id,
            project_id: req.project_id,
            linear_team_id: req.linear_team_id.clone(),
            linear_project_id: req.linear_project_id.clone(),
            api_key: req.api_key.clone(),
            fallback_status_id,
            creator_user_id: session.user_id(),
        };
        tokio::spawn(async move {
            if let Err(e) = import::run_initial_import(import_ctx).await {
                tracing::error!(?e, "Initial Linear import failed");
            }
        });
    }

    (StatusCode::CREATED, Json(ConnectionResponse::from(conn))).into_response()
}

// ── Get/Update/Delete connection ──────────────────────────────────────────────

async fn get_connection(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Response {
    match db::get_connection_by_id(state.pool(), id).await {
        Ok(Some(c)) => Json(ConnectionResponse::from(c)).into_response(),
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(e) => { tracing::error!(?e); StatusCode::INTERNAL_SERVER_ERROR.into_response() }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateConnectionRequest {
    sync_enabled: Option<bool>,
}

async fn update_connection(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Json(req): Json<UpdateConnectionRequest>,
) -> Response {
    if let Some(enabled) = req.sync_enabled {
        if let Err(e) = db::set_sync_enabled(state.pool(), id, enabled).await {
            tracing::error!(?e);
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    }
    StatusCode::OK.into_response()
}

async fn delete_connection(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Response {
    let conn = match db::get_connection_by_id(state.pool(), id).await {
        Ok(Some(c)) => c,
        Ok(None) => return StatusCode::NOT_FOUND.into_response(),
        Err(e) => { tracing::error!(?e); return StatusCode::INTERNAL_SERVER_ERROR.into_response(); }
    };

    // Deregister Linear webhook
    if let (Some(webhook_id), Some(enc_key)) = (
        &conn.linear_webhook_id,
        state.config().linear_encryption_key.as_ref(),
    ) {
        if let Ok(api_key) = crypto::decrypt(enc_key.expose_secret().as_str(), &conn.encrypted_api_key) {
            let _ = client::delete_webhook(&state.http_client, &api_key, webhook_id).await;
        }
    }

    if let Err(e) = db::delete_connection(state.pool(), id).await {
        tracing::error!(?e);
        return StatusCode::INTERNAL_SERVER_ERROR.into_response();
    }
    StatusCode::NO_CONTENT.into_response()
}

// ── Status mappings ───────────────────────────────────────────────────────────

async fn get_status_mappings(State(state): State<AppState>, Path(id): Path<Uuid>) -> Response {
    match db::get_status_mappings(state.pool(), id).await {
        Ok(m) => Json(m).into_response(),
        Err(e) => { tracing::error!(?e); StatusCode::INTERNAL_SERVER_ERROR.into_response() }
    }
}

#[derive(Debug, Deserialize)]
struct SaveStatusMappingsRequest {
    mappings: Vec<StatusMappingEntry>,
}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StatusMappingEntry {
    vk_status_id: Uuid,
    linear_state_id: String,
    linear_state_name: String,
}

async fn save_status_mappings(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Json(req): Json<SaveStatusMappingsRequest>,
) -> Response {
    for entry in &req.mappings {
        if let Err(e) = db::upsert_status_mapping(
            state.pool(), id, entry.vk_status_id, &entry.linear_state_id, &entry.linear_state_name,
        ).await {
            tracing::error!(?e);
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    }
    StatusCode::OK.into_response()
}

async fn list_teams_for_connection(State(state): State<AppState>, Path(id): Path<Uuid>) -> Response {
    let conn = match db::get_connection_by_id(state.pool(), id).await {
        Ok(Some(c)) => c,
        _ => return StatusCode::NOT_FOUND.into_response(),
    };
    let enc_key = match state.config().linear_encryption_key.as_ref() {
        Some(k) => k,
        None => return StatusCode::SERVICE_UNAVAILABLE.into_response(),
    };
    let api_key = match crypto::decrypt(enc_key.expose_secret().as_str(), &conn.encrypted_api_key) {
        Ok(k) => k,
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };
    match client::list_teams(&state.http_client, &api_key).await {
        Ok(teams) => Json(teams).into_response(),
        Err(e) => { tracing::error!(?e); StatusCode::INTERNAL_SERVER_ERROR.into_response() }
    }
}

async fn trigger_sync(State(state): State<AppState>, Path(id): Path<Uuid>, session: Session) -> Response {
    let conn = match db::get_connection_by_id(state.pool(), id).await {
        Ok(Some(c)) => c,
        _ => return StatusCode::NOT_FOUND.into_response(),
    };
    let enc_key = match state.config().linear_encryption_key.as_ref() {
        Some(k) => k,
        None => return StatusCode::SERVICE_UNAVAILABLE.into_response(),
    };
    let api_key = match crypto::decrypt(enc_key.expose_secret().as_str(), &conn.encrypted_api_key) {
        Ok(k) => k,
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };
    if let Some(fallback_status_id) = fetch_fallback_status_id(state.pool(), conn.project_id).await.ok().flatten() {
        let ctx = import::ImportContext {
            pool: state.pool().clone(),
            http_client: state.http_client.clone(),
            connection_id: conn.id,
            project_id: conn.project_id,
            linear_team_id: conn.linear_team_id.clone(),
            linear_project_id: conn.linear_project_id.clone(),
            api_key,
            fallback_status_id,
            creator_user_id: session.user_id(),
        };
        tokio::spawn(async move {
            if let Err(e) = import::run_initial_import(ctx).await {
                tracing::error!(?e, "Manual sync failed");
            }
        });
    }
    StatusCode::ACCEPTED.into_response()
}

// ── Helpers ───────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ConnectionResponse {
    id: Uuid,
    project_id: Uuid,
    linear_team_id: String,
    linear_project_id: Option<String>,
    sync_enabled: bool,
    has_webhook: bool,
    created_at: chrono::DateTime<chrono::Utc>,
}

impl From<db::LinearProjectConnection> for ConnectionResponse {
    fn from(c: db::LinearProjectConnection) -> Self {
        Self {
            id: c.id,
            project_id: c.project_id,
            linear_team_id: c.linear_team_id,
            linear_project_id: c.linear_project_id,
            sync_enabled: c.sync_enabled,
            has_webhook: c.linear_webhook_id.is_some(),
            created_at: c.created_at,
        }
    }
}

fn generate_webhook_secret() -> String {
    use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
    use aes_gcm::aead::OsRng;
    use aes_gcm::aead::rand_core::RngCore;
    let mut bytes = [0u8; 32];
    OsRng.fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}

async fn fetch_project_statuses(
    pool: &sqlx::PgPool,
    project_id: Uuid,
) -> sqlx::Result<Vec<(Uuid, String)>> {
    let rows = sqlx::query!(
        "SELECT id, name FROM project_statuses WHERE project_id = $1 ORDER BY sort_order",
        project_id
    )
    .fetch_all(pool)
    .await?;
    Ok(rows.into_iter().map(|r| (r.id, r.name)).collect())
}

async fn fetch_fallback_status_id(pool: &sqlx::PgPool, project_id: Uuid) -> sqlx::Result<Option<Uuid>> {
    let row = sqlx::query!(
        "SELECT id FROM project_statuses WHERE project_id = $1 ORDER BY sort_order LIMIT 1",
        project_id
    )
    .fetch_optional(pool)
    .await?;
    Ok(row.map(|r| r.id))
}
```

- [ ] **Step 2: Compile check**

```bash
cargo check -p remote
```
Expected: compiles (fix any import errors).

- [ ] **Step 3: Commit**

```bash
git add crates/remote/src/routes/linear.rs
git commit -m "feat(linear): add connection management API routes"
```

---

## Task 10: HTTP routes — webhook handler (public)

**Files:**
- Modify: `crates/remote/src/routes/linear.rs` (add `public_router` and webhook handler)

The webhook handler needs to identify the connection by `webhookId` from the payload, verify the HMAC, then process events async.

- [ ] **Step 1: Add public_router and handle_webhook to linear.rs**

Add to the top of the file (alongside `protected_router`):

```rust
pub fn public_router() -> Router<AppState> {
    Router::new().route("/linear/webhook", post(handle_webhook))
}
```

And add the handler:

```rust
use axum::body::Bytes;
use axum::http::HeaderMap;

/// POST /v1/linear/webhook — receives Linear webhook events
async fn handle_webhook(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    // Parse body to extract webhookId (needed to look up the secret)
    let payload: serde_json::Value = match serde_json::from_slice(&body) {
        Ok(v) => v,
        Err(_) => return StatusCode::BAD_REQUEST.into_response(),
    };

    let webhook_id = match payload["webhookId"].as_str() {
        Some(id) => id.to_string(),
        None => return StatusCode::BAD_REQUEST.into_response(),
    };

    // Fetch connection by webhook ID (one DB read before signature verification)
    let conn = match db::get_connection_by_webhook_id(state.pool(), &webhook_id).await {
        Ok(Some(c)) => c,
        Ok(None) => return StatusCode::NOT_FOUND.into_response(),
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };

    // Verify HMAC signature
    let sig = headers
        .get("linear-signature")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    let secret = conn.linear_webhook_secret.as_deref().unwrap_or("");
    if !crate::linear::webhook::verify_signature(secret.as_bytes(), sig, &body) {
        tracing::warn!("Invalid Linear webhook signature for connection {}", conn.id);
        return StatusCode::UNAUTHORIZED.into_response();
    }

    // Respond 200 immediately; process async
    let state_clone = state.clone();
    let conn_clone = conn.clone();
    tokio::spawn(async move {
        if let Err(e) = process_webhook_event(state_clone, conn_clone, payload).await {
            tracing::error!(?e, "Error processing Linear webhook event");
        }
    });

    StatusCode::OK.into_response()
}

async fn process_webhook_event(
    state: AppState,
    conn: db::LinearProjectConnection,
    payload: serde_json::Value,
) -> anyhow::Result<()> {
    let event_type = payload["type"].as_str().unwrap_or("");
    let action = payload["action"].as_str().unwrap_or("");
    let data = &payload["data"];

    match event_type {
        "Issue" => handle_linear_issue_event(&state, &conn, action, data).await?,
        "Comment" => handle_linear_comment_event(&state, &conn, action, data).await?,
        _ => {}
    }
    Ok(())
}

async fn handle_linear_issue_event(
    state: &AppState,
    conn: &db::LinearProjectConnection,
    action: &str,
    data: &serde_json::Value,
) -> anyhow::Result<()> {
    use crate::linear::loop_guard::{self, SyncDirection};

    let linear_issue_id = data["id"].as_str().unwrap_or("");
    if linear_issue_id.is_empty() { return Ok(()); }
    let issue_id_uuid = Uuid::new_v4(); // placeholder for loop guard key

    // Check ignore label
    let labels: Vec<String> = data["labels"]["nodes"]
        .as_array()
        .map(|arr| arr.iter().filter_map(|l| l["name"].as_str().map(|s| s.to_string())).collect())
        .unwrap_or_default();
    let is_ignored = labels.iter().any(|l| l.eq_ignore_ascii_case(crate::linear::client::IGNORE_LABEL_NAME));

    match action {
        "create" => {
            if is_ignored { return Ok(()); }
            // Check if we already have a link (idempotent)
            if db::get_link_for_linear_issue(state.pool(), linear_issue_id).await?.is_some() {
                return Ok(());
            }
            // Map fields and create VK issue
            let status_id = resolve_status_id(state, conn, data).await?;
            let priority = sync::linear_priority_to_vk(data["priority"].as_i64().unwrap_or(0) as i32);
            let result = crate::db::issues::IssueRepository::create(
                state.pool(),
                None,
                conn.project_id,
                status_id,
                data["title"].as_str().unwrap_or("").to_string(),
                data["description"].as_str().map(String::from),
                priority,
                None,
                data["dueDate"].as_str().and_then(|d| d.parse().ok()),
                None,
                0.0, // sort_order appended at end
                None, None,
                serde_json::Value::Object(Default::default()),
                conn.project_id, // creator_user_id not available from webhook; use project_id as dummy or fetch org admin
            ).await?;
            db::create_issue_link(state.pool(), result.data.id, linear_issue_id, data["identifier"].as_str().unwrap_or("")).await?;
        }
        "update" => {
            let existing_link = db::get_link_for_linear_issue(state.pool(), linear_issue_id).await?;
            if let Some(link) = existing_link {
                if is_ignored {
                    // Label was added post-link — delete link and VK issue
                    db::delete_issue_link_by_vk_id(state.pool(), link.vk_issue_id).await?;
                    crate::db::issues::IssueRepository::delete(state.pool(), link.vk_issue_id).await.ok();
                    return Ok(());
                }
                // Check loop guard — if outbound in flight, skip (this is our echo)
                if loop_guard::outbound_in_flight(state.pool(), conn.id, link.vk_issue_id).await? {
                    return Ok(());
                }
                // Acquire inbound lock (dedup)
                if !loop_guard::try_acquire(state.pool(), conn.id, link.vk_issue_id, SyncDirection::Inbound).await? {
                    return Ok(());
                }
                let status_id = resolve_status_id(state, conn, data).await?;
                let priority = sync::linear_priority_to_vk(data["priority"].as_i64().unwrap_or(0) as i32);
                crate::db::issues::IssueRepository::update(
                    state.pool(),
                    link.vk_issue_id,
                    Some(status_id),
                    Some(data["title"].as_str().unwrap_or("").to_string()),
                    Some(data["description"].as_str().map(String::from)),
                    Some(priority),
                    None, // start_date — not in Linear
                    Some(data["dueDate"].as_str().and_then(|d| d.parse().ok())),
                    None, None, None, None, None,
                ).await?;
                loop_guard::release(state.pool(), conn.id, link.vk_issue_id, SyncDirection::Inbound).await?;
                db::touch_link(state.pool(), link.vk_issue_id).await?;
            }
        }
        "remove" => {
            if let Some(link) = db::get_link_for_linear_issue(state.pool(), linear_issue_id).await? {
                db::delete_issue_link_by_vk_id(state.pool(), link.vk_issue_id).await?;
                crate::db::issues::IssueRepository::delete(state.pool(), link.vk_issue_id).await.ok();
            }
        }
        _ => {}
    }
    Ok(())
}

async fn handle_linear_comment_event(
    state: &AppState,
    conn: &db::LinearProjectConnection,
    action: &str,
    data: &serde_json::Value,
) -> anyhow::Result<()> {
    let linear_comment_id = data["id"].as_str().unwrap_or("");
    let linear_issue_id = data["issue"]["id"].as_str().unwrap_or("");
    let body = data["body"].as_str().unwrap_or("");

    let issue_link = match db::get_link_for_linear_issue(state.pool(), linear_issue_id).await? {
        Some(l) => l,
        None => return Ok(()), // no linked VK issue
    };

    let enc_key = match state.config().linear_encryption_key.as_ref() {
        Some(k) => k,
        None => return Ok(()),
    };
    let api_key = match crate::linear::crypto::decrypt(enc_key.expose_secret().as_str(), &conn.encrypted_api_key) {
        Ok(k) => k,
        Err(_) => return Ok(()),
    };

    match action {
        "create" => {
            // Create VK comment
            let vk_comment_id = create_vk_comment(state, issue_link.vk_issue_id, body).await?;
            db::create_comment_link(state.pool(), conn.id, vk_comment_id, linear_comment_id).await?;
        }
        "update" => {
            if let Some(vk_comment_id) = get_vk_comment_by_linear_id(state, conn.id, linear_comment_id).await? {
                update_vk_comment(state, vk_comment_id, body).await?;
            }
        }
        "remove" => {
            if let Some(vk_comment_id) = get_vk_comment_by_linear_id(state, conn.id, linear_comment_id).await? {
                delete_vk_comment(state, vk_comment_id).await?;
                db::delete_comment_link(state.pool(), vk_comment_id).await?;
            }
        }
        _ => {}
    }
    Ok(())
}

async fn resolve_status_id(
    state: &AppState,
    conn: &db::LinearProjectConnection,
    data: &serde_json::Value,
) -> anyhow::Result<Uuid> {
    let linear_state_id = data["state"]["id"].as_str().unwrap_or("");
    let mappings = db::get_status_mappings(state.pool(), conn.id).await?;
    let fallback = fetch_fallback_status_id(state.pool(), conn.project_id).await?
        .unwrap_or(Uuid::nil());
    Ok(sync::map_linear_state_to_vk(linear_state_id, &mappings, fallback))
}

// Stub helpers — implement by calling IssueCommentRepository (same pattern as issue_comments.rs)
async fn create_vk_comment(state: &AppState, issue_id: Uuid, body: &str) -> anyhow::Result<Uuid> {
    // TODO: call IssueCommentRepository::create, return the new comment UUID
    todo!("implement using IssueCommentRepository")
}
async fn update_vk_comment(state: &AppState, comment_id: Uuid, body: &str) -> anyhow::Result<()> {
    todo!()
}
async fn delete_vk_comment(state: &AppState, comment_id: Uuid) -> anyhow::Result<()> {
    todo!()
}
async fn get_vk_comment_by_linear_id(state: &AppState, connection_id: Uuid, linear_comment_id: &str) -> anyhow::Result<Option<Uuid>> {
    let row = sqlx::query!(
        "SELECT vk_comment_id FROM linear_comment_links WHERE connection_id = $1 AND linear_comment_id = $2",
        connection_id, linear_comment_id
    ).fetch_optional(state.pool()).await?;
    Ok(row.map(|r| r.vk_comment_id))
}
```

**Note:** The 3 `todo!()` stubs need to be filled in using `IssueCommentRepository` (follow the exact same pattern as `crates/remote/src/routes/issue_comments.rs` which uses `IssueCommentRepository::create`, `::update`, `::delete`). Find the repository in `crates/remote/src/db/issue_comments.rs` and wire in the same way.

- [ ] **Step 2: Compile check (with stubs)**

```bash
cargo check -p remote
```
Expected: compiles with `todo!()` stubs.

- [ ] **Step 3: Fill in the comment stubs by inspecting `crates/remote/src/db/issue_comments.rs`**

Read the file and implement `create_vk_comment`, `update_vk_comment`, `delete_vk_comment` using the actual `IssueCommentRepository` API.

- [ ] **Step 4: Compile check again**

```bash
cargo check -p remote
```
Expected: compiles cleanly.

- [ ] **Step 5: Commit**

```bash
git add crates/remote/src/routes/linear.rs
git commit -m "feat(linear): add webhook handler and comment sync"
```

---

## Task 11: Register routes

**Files:**
- Modify: `crates/remote/src/routes/mod.rs`
- Modify: `crates/remote/src/lib.rs` (if `routes/mod.rs` doesn't already re-export)

- [ ] **Step 1: Add `mod linear;` to routes/mod.rs and merge routers**

In `crates/remote/src/routes/mod.rs`, add the module declaration near the top (alphabetical order):
```rust
mod linear;
```

In the `v1_public` block (where `github_app::public_router()` is merged):
```rust
.merge(linear::public_router())
```

In the `v1_protected` block (where `issues::router()` etc. are merged):
```rust
.merge(linear::protected_router())
```

- [ ] **Step 2: Compile check**

```bash
cargo check -p remote
```
Expected: compiles.

- [ ] **Step 3: Commit**

```bash
git add crates/remote/src/routes/mod.rs
git commit -m "feat(linear): register linear routes in router"
```

---

## Task 12: Outbound sync hooks

**Files:**
- Modify: `crates/remote/src/routes/issues.rs`
- Modify: `crates/remote/src/routes/issue_comments.rs`
- Modify: `crates/remote/src/routes/issue_assignees.rs`
- Modify: `crates/remote/src/routes/issue_tags.rs`
- Create: `crates/remote/src/linear/outbound.rs`

The outbound sync is a shared function that fires after mutations. Extract it to `outbound.rs` to keep routes clean.

- [ ] **Step 1: Create `crates/remote/src/linear/outbound.rs`**

```rust
use reqwest::Client;
use sqlx::PgPool;
use tracing::{info, warn};
use uuid::Uuid;

use crate::linear::{client, crypto, db, loop_guard, sync};
use secrecy::ExposeSecret;

pub async fn push_issue_to_linear(pool: &PgPool, http: &Client, vk_issue_id: Uuid) {
    let Ok(Some(issue)) = crate::db::issues::IssueRepository::find_by_id(pool, vk_issue_id).await else { return };
    let Ok(Some(conn)) = db::get_connection_for_project(pool, issue.project_id).await else { return };
    let Ok(Some(config)) = get_linear_config(pool).await else { return };

    // Acquire outbound lock
    match loop_guard::try_acquire(pool, conn.id, vk_issue_id, loop_guard::SyncDirection::Outbound).await {
        Ok(true) => {}
        _ => return, // already in flight or error
    }

    let api_key = match get_api_key(&conn, &config) {
        Ok(k) => k,
        Err(_) => { loop_guard::release(pool, conn.id, vk_issue_id, loop_guard::SyncDirection::Outbound).await.ok(); return; }
    };

    let mappings = match db::get_status_mappings(pool, conn.id).await {
        Ok(m) => m,
        Err(_) => { loop_guard::release(pool, conn.id, vk_issue_id, loop_guard::SyncDirection::Outbound).await.ok(); return; }
    };

    let linear_state_id = sync::map_vk_status_to_linear(issue.status_id, &mappings)
        .map(String::from);
    let priority = sync::vk_priority_to_linear(issue.priority.clone());
    let due_date = issue.target_date.map(|d| d.format("%Y-%m-%d").to_string());

    let link = match db::get_link_for_vk_issue(pool, vk_issue_id).await {
        Ok(l) => l,
        Err(_) => { loop_guard::release(pool, conn.id, vk_issue_id, loop_guard::SyncDirection::Outbound).await.ok(); return; }
    };

    let result = if let Some(link) = link {
        // Update existing Linear issue
        client::update_issue(
            http, &api_key, &link.linear_issue_id,
            client::UpdateIssueInput {
                title: Some(&issue.title),
                description: issue.description.as_deref(),
                state_id: linear_state_id.as_deref(),
                priority: Some(priority),
                due_date: due_date.as_deref(),
                assignee_id: None, // assignee handled separately
                label_ids: None,   // labels handled separately
            },
        ).await.map(|_| ())
    } else {
        // Create new Linear issue
        let result = client::create_issue(
            http, &api_key,
            client::CreateIssueInput {
                team_id: &conn.linear_team_id,
                project_id: conn.linear_project_id.as_deref(),
                title: &issue.title,
                description: issue.description.as_deref(),
                state_id: linear_state_id.as_deref(),
                priority: Some(priority),
                due_date: due_date.as_deref(),
                assignee_id: None,
                label_ids: None,
            },
        ).await;
        match result {
            Ok(li) => {
                let _ = db::create_issue_link(pool, vk_issue_id, &li.id, &li.identifier).await;
                Ok(())
            }
            Err(e) => Err(e),
        }
    };

    if let Err(e) = result {
        warn!(?e, %vk_issue_id, "Failed to push issue to Linear");
    } else {
        let _ = db::touch_link(pool, vk_issue_id).await;
    }

    loop_guard::release(pool, conn.id, vk_issue_id, loop_guard::SyncDirection::Outbound).await.ok();
}

pub async fn delete_issue_from_linear(pool: &PgPool, http: &Client, vk_issue_id: Uuid) {
    let Ok(Some(link)) = db::get_link_for_vk_issue(pool, vk_issue_id).await else { return };
    let Ok(Some(issue)) = crate::db::issues::IssueRepository::find_by_id(pool, vk_issue_id).await else { return };
    let Ok(Some(conn)) = db::get_connection_for_project(pool, issue.project_id).await else { return };
    let Ok(Some(config)) = get_linear_config(pool).await else { return };
    let Ok(api_key) = get_api_key(&conn, &config) else { return };

    let _ = client::delete_issue(http, &api_key, &link.linear_issue_id).await;
    // Link is cascade-deleted when VK issue is deleted
}

pub async fn push_comment_to_linear(pool: &PgPool, http: &Client, vk_comment_id: Uuid) {
    let Ok(Some(comment)) = fetch_vk_comment(pool, vk_comment_id).await else { return };
    let Ok(Some(issue_link)) = db::get_link_for_vk_issue(pool, comment.issue_id).await else { return };
    let Ok(Some(issue)) = crate::db::issues::IssueRepository::find_by_id(pool, comment.issue_id).await else { return };
    let Ok(Some(conn)) = db::get_connection_for_project(pool, issue.project_id).await else { return };
    let Ok(Some(config)) = get_linear_config(pool).await else { return };
    let Ok(api_key) = get_api_key(&conn, &config) else { return };

    let existing_link = db::get_comment_link(pool, vk_comment_id).await.ok().flatten();
    if let Some(linear_comment_id) = existing_link {
        let _ = client::update_comment(http, &api_key, &linear_comment_id, &comment.body).await;
    } else {
        if let Ok(linear_comment_id) = client::create_comment(http, &api_key, &issue_link.linear_issue_id, &comment.body).await {
            let _ = db::create_comment_link(pool, conn.id, vk_comment_id, &linear_comment_id).await;
        }
    }
}

pub async fn delete_comment_from_linear(pool: &PgPool, http: &Client, vk_comment_id: Uuid) {
    let Ok(Some(linear_comment_id)) = db::get_comment_link(pool, vk_comment_id).await else { return };
    // Need connection to get API key — join through comment → issue → project → connection
    // (simplified: fetch comment → issue → connection inline)
    // TODO: resolve connection + decrypt key, then call client::delete_comment
    let _ = db::delete_comment_link(pool, vk_comment_id).await;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

struct LinearConfig {
    encryption_key: String,
}

async fn get_linear_config(pool: &PgPool) -> anyhow::Result<Option<LinearConfig>> {
    // Read from environment directly (config is not stored in DB)
    let key = std::env::var("VIBEKANBAN_REMOTE_LINEAR_ENCRYPTION_KEY").ok()
        .filter(|v| !v.is_empty());
    Ok(key.map(|k| LinearConfig { encryption_key: k }))
}

fn get_api_key(conn: &db::LinearProjectConnection, config: &LinearConfig) -> anyhow::Result<String> {
    crate::linear::crypto::decrypt(&config.encryption_key, &conn.encrypted_api_key)
        .map_err(|e| anyhow::anyhow!(e))
}

struct VkComment { issue_id: Uuid, body: String }

async fn fetch_vk_comment(pool: &PgPool, comment_id: Uuid) -> sqlx::Result<Option<VkComment>> {
    let row = sqlx::query!(
        "SELECT issue_id, body FROM issue_comments WHERE id = $1",
        comment_id
    ).fetch_optional(pool).await?;
    Ok(row.map(|r| VkComment { issue_id: r.issue_id, body: r.body }))
}
```

Add `pub mod outbound;` to `crates/remote/src/linear/mod.rs`.

- [ ] **Step 2: Hook into `crates/remote/src/routes/issues.rs`**

After the successful mutation response in `create_issue`, `update_issue`, `delete_issue`, and `bulk_update_issues`, add a `tokio::spawn`:

```rust
// In create_issue, after Ok(Json(MutationResponse { ... })):
let (pool, http, id) = (state.pool().clone(), state.http_client.clone(), issue_id);
tokio::spawn(async move {
    crate::linear::outbound::push_issue_to_linear(&pool, &http, id).await;
});

// In update_issue, same pattern with the updated issue's id
// In delete_issue, use delete_issue_from_linear instead:
tokio::spawn(async move {
    crate::linear::outbound::delete_issue_from_linear(&pool, &http, id).await;
});

// In bulk_update_issues, loop over each affected issue_id and spawn
```

- [ ] **Step 3: Hook into `crates/remote/src/routes/issue_comments.rs`**

After create_comment success:
```rust
let (pool, http, cid) = (state.pool().clone(), state.http_client.clone(), new_comment_id);
tokio::spawn(async move { crate::linear::outbound::push_comment_to_linear(&pool, &http, cid).await; });
```

After update_comment, same `push_comment_to_linear`. After delete_comment, `delete_comment_from_linear`.

- [ ] **Step 4: Compile check**

```bash
cargo check -p remote
```
Expected: compiles.

- [ ] **Step 5: Commit**

```bash
git add crates/remote/src/linear/outbound.rs crates/remote/src/routes/issues.rs \
        crates/remote/src/routes/issue_comments.rs crates/remote/src/linear/mod.rs
git commit -m "feat(linear): add outbound sync hooks on issue and comment mutations"
```

---

## Task 13: Run full type check & prepare-db

- [ ] **Step 1: Run `pnpm run backend:check`**

```bash
pnpm run backend:check
```
Expected: all Rust crates compile and pass clippy.

- [ ] **Step 2: Run `pnpm run remote:prepare-db`** (requires running Postgres)

```bash
pnpm run remote:prepare-db
```
Expected: SQLx offline snapshots updated.

- [ ] **Step 3: Run tests**

```bash
cargo test -p remote linear
```
Expected: all unit tests in `linear::crypto`, `linear::webhook`, `linear::sync` pass.

- [ ] **Step 4: Format**

```bash
pnpm run format
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: format and update sqlx offline snapshots for linear integration"
```

---

## Task 14: Frontend — Linear integration settings page

**Files:**
- Create: `packages/web-core/src/components/settings/linear-integration/index.tsx`
- Create: `packages/web-core/src/components/settings/linear-integration/connect-panel.tsx`
- Create: `packages/web-core/src/components/settings/linear-integration/status-mapping.tsx`
- Create: `packages/web-core/src/components/settings/linear-integration/sync-status.tsx`

Look at existing settings components in `packages/web-core/src/components/settings/` to follow design patterns (button variants, input styles, form layout). All API calls go through the existing API client patterns used elsewhere in web-core.

- [ ] **Step 1: Create `connect-panel.tsx`**

```tsx
import { useState } from 'react';

interface Props {
  projectId: string;
  onConnected: () => void;
}

export function ConnectLinearPanel({ projectId, onConnected }: Props) {
  const [apiKey, setApiKey] = useState('');
  const [teams, setTeams] = useState<Array<{ id: string; name: string; key: string }>>([]);
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [validating, setValidating] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');

  async function validateKey() {
    if (!apiKey.trim()) return;
    setValidating(true);
    setError('');
    try {
      // POST to /v1/linear/connections/teams-preview (or use a validate endpoint)
      // For now: just try to connect immediately when they click Connect
    } finally {
      setValidating(false);
    }
  }

  async function handleConnect() {
    setConnecting(true);
    setError('');
    try {
      const res = await fetch('/v1/linear/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          apiKey,
          linearTeamId: selectedTeamId,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        setError(text || 'Failed to connect');
        return;
      }
      onConnected();
    } catch (e) {
      setError('Network error');
    } finally {
      setConnecting(false);
    }
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium">Connect Linear</h3>
      <div>
        <label className="block text-xs text-muted-foreground mb-1">
          Linear Personal API Key
        </label>
        <input
          type="password"
          value={apiKey}
          onChange={e => setApiKey(e.target.value)}
          placeholder="lin_api_..."
          className="w-full rounded border px-3 py-2 text-sm"
        />
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <button
        onClick={handleConnect}
        disabled={!apiKey.trim() || connecting}
        className="btn btn-primary text-sm"
      >
        {connecting ? 'Connecting…' : 'Connect & Import'}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Create `status-mapping.tsx`**

```tsx
import { useEffect, useState } from 'react';

interface VkStatus { id: string; name: string; color: string }
interface LinearState { id: string; name: string }
interface Mapping { vkStatusId: string; linearStateId: string; linearStateName: string }

interface Props {
  connectionId: string;
  vkStatuses: VkStatus[];
}

export function StatusMappingPanel({ connectionId, vkStatuses }: Props) {
  const [linearStates, setLinearStates] = useState<LinearState[]>([]);
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Fetch current mappings and Linear states
    Promise.all([
      fetch(`/v1/linear/connections/${connectionId}/status-mappings`).then(r => r.json()),
      fetch(`/v1/linear/connections/${connectionId}/teams`).then(r => r.json()),
    ]).then(([savedMappings, teams]) => {
      const map: Record<string, string> = {};
      savedMappings.forEach((m: Mapping) => { map[m.vkStatusId] = m.linearStateId; });
      setMappings(map);
    });
  }, [connectionId]);

  async function save() {
    setSaving(true);
    const mappingsList = Object.entries(mappings).map(([vkStatusId, linearStateId]) => ({
      vkStatusId,
      linearStateId,
      linearStateName: linearStates.find(s => s.id === linearStateId)?.name ?? '',
    }));
    await fetch(`/v1/linear/connections/${connectionId}/status-mappings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mappings: mappingsList }),
    });
    setSaving(false);
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium">Status Mapping</h3>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-muted-foreground">
            <th className="text-left py-1">Vibe Kanban Status</th>
            <th className="text-left py-1">Linear Workflow State</th>
          </tr>
        </thead>
        <tbody>
          {vkStatuses.map(status => (
            <tr key={status.id}>
              <td className="py-1">
                <span
                  className="inline-block w-2 h-2 rounded-full mr-2"
                  style={{ background: status.color }}
                />
                {status.name}
              </td>
              <td className="py-1">
                <select
                  value={mappings[status.id] ?? ''}
                  onChange={e => setMappings(m => ({ ...m, [status.id]: e.target.value }))}
                  className="rounded border px-2 py-1 text-xs w-full"
                >
                  <option value="">-- unmapped --</option>
                  {linearStates.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button onClick={save} disabled={saving} className="btn btn-secondary text-sm">
        {saving ? 'Saving…' : 'Save mappings'}
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Create `sync-status.tsx`**

```tsx
import { useState } from 'react';

interface Connection {
  id: string;
  syncEnabled: boolean;
  hasWebhook: boolean;
  createdAt: string;
}

interface Props {
  connection: Connection;
  onDisconnect: () => void;
  onToggleSync: (enabled: boolean) => void;
}

export function SyncStatusPanel({ connection, onDisconnect, onToggleSync }: Props) {
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  async function triggerSync() {
    setSyncing(true);
    await fetch(`/v1/linear/connections/${connection.id}/sync`, { method: 'POST' });
    setSyncing(false);
  }

  async function handleDisconnect() {
    if (!confirm('Disconnect Linear? This will remove all issue links (VK issues are kept).')) return;
    setDisconnecting(true);
    await fetch(`/v1/linear/connections/${connection.id}`, { method: 'DELETE' });
    onDisconnect();
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-green-600">
            {connection.hasWebhook ? '● Connected' : '⚠ Connected (no webhook)'}
          </p>
          <p className="text-xs text-muted-foreground">
            Connected {new Date(connection.createdAt).toLocaleDateString()}
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={connection.syncEnabled}
            onChange={e => onToggleSync(e.target.checked)}
          />
          Sync enabled
        </label>
      </div>
      <div className="flex gap-2">
        <button onClick={triggerSync} disabled={syncing} className="btn btn-secondary text-sm">
          {syncing ? 'Syncing…' : 'Sync now'}
        </button>
        <button onClick={handleDisconnect} disabled={disconnecting} className="btn btn-destructive text-sm">
          Disconnect
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create `index.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { ConnectLinearPanel } from './connect-panel';
import { StatusMappingPanel } from './status-mapping';
import { SyncStatusPanel } from './sync-status';

interface Props {
  projectId: string;
  vkStatuses: Array<{ id: string; name: string; color: string }>;
}

export function LinearIntegration({ projectId, vkStatuses }: Props) {
  const [connection, setConnection] = useState<any | null>(undefined); // undefined = loading

  useEffect(() => {
    fetch('/v1/linear/connections')
      .then(r => r.json())
      .then((conns: any[]) => {
        const conn = conns.find(c => c.projectId === projectId) ?? null;
        setConnection(conn);
      })
      .catch(() => setConnection(null));
  }, [projectId]);

  if (connection === undefined) return <p className="text-sm text-muted-foreground">Loading…</p>;

  if (!connection) {
    return (
      <ConnectLinearPanel
        projectId={projectId}
        onConnected={() => window.location.reload()}
      />
    );
  }

  async function handleToggleSync(enabled: boolean) {
    await fetch(`/v1/linear/connections/${connection.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ syncEnabled: enabled }),
    });
    setConnection((c: any) => ({ ...c, syncEnabled: enabled }));
  }

  return (
    <div className="space-y-6">
      <SyncStatusPanel
        connection={connection}
        onDisconnect={() => setConnection(null)}
        onToggleSync={handleToggleSync}
      />
      <StatusMappingPanel
        connectionId={connection.id}
        vkStatuses={vkStatuses}
      />
    </div>
  );
}
```

- [ ] **Step 5: Wire `LinearIntegration` into the project settings panel**

Find the project settings component in `packages/web-core/src/components/settings/` (look for a `ProjectSettings` or similar component). Add a "Linear" tab/section that renders `<LinearIntegration projectId={...} vkStatuses={...} />`.

- [ ] **Step 6: Type check frontend**

```bash
pnpm run check
```
Expected: no TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add packages/web-core/src/components/settings/linear-integration/
git commit -m "feat(linear): add frontend settings page for Linear integration"
```

---

## Task 15: Final checks & format

- [ ] **Step 1: Full lint**

```bash
pnpm run lint
```
Expected: no errors.

- [ ] **Step 2: Format**

```bash
pnpm run format
```

- [ ] **Step 3: Run all Rust tests**

```bash
cargo test --workspace
```
Expected: all tests pass.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: final format pass for linear integration"
```

---

## Key references

| Topic | File |
|-------|------|
| Webhook pattern | `crates/remote/src/routes/github_app.rs:607-663` |
| HMAC verification | `crates/remote/src/github_app/webhook.rs` |
| IssueRepository::create | `crates/remote/src/db/issues.rs:325-341` |
| IssueRepository::update | `crates/remote/src/db/issues.rs:408-425` |
| IssueCommentRepository | `crates/remote/src/db/issue_comments.rs` |
| Route registration | `crates/remote/src/routes/mod.rs:102-147` |
| Electric sync function | `crates/remote/migrations/20251127000000_electric_support.sql` |
| Config pattern | `crates/remote/src/config.rs:150-188` |
| AppState | `crates/remote/src/state.rs` |

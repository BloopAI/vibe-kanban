---
name: p2p-remote-access-phase2
overview: Self-hosted P2P remote access — Phase 2: SSH tunnel transport and SSH key authentication
todos:
  - db-migration-ssh
  - ssh-tunnel-crate
  - connection-strategy
  - ssh-key-auth
  - p2p-routes-ssh
  - integration-test-phase2
complexity:
  taskCount: 6
  independentTasks: 2
  sequentialTasks: 4
  independencePercent: 33
orchestration:
  recommended: subagent-driven-development
  reason: "6 tasks, 2 independent (33%), sequential dependencies — same-session execution with fresh subagent per task optimal"
  threshold: 5
  alternatives:
    - executing-plans: "Batch execution if you prefer manual checkpoints"
---

# P2P Remote Access — Phase 2: SSH Tunnel Transport & Key Auth

> **For the agent:** AUTO-TRIGGERED ORCHESTRATION: Use superpowers:subagent-driven-development to implement this plan.
> **Reason:** 6 tasks detected, 2 independent (33%), complexity threshold: 5
> **Alternative:** Use superpowers:executing-plans for batch execution with manual checkpoints

**Goal:** Add SSH tunnel transport as a fallback when direct WebSocket is blocked, and SSH key-based host authentication as an alternative to pairing codes.

**Architecture:** A new `crates/ssh-tunnel/` crate wraps `russh` to create local TCP port forwards over SSH. `P2pConnectionManager` tries direct WebSocket first, then falls back to SSH tunnel. Pairing can now use SSH key proof-of-identity instead of a manual code — if you have SSH access to the remote host, you're trusted.

**Tech Stack:** `russh` (already in workspace via `embedded-ssh`), `russh-keys`, `ssh-key` / `ssh-encoding`, existing `relay-tunnel-core`, `tokio`

---

## Context for the Implementer

### Phase 1 recap

After Phase 1:
- `p2p_hosts` table: `id, name, address, relay_port, machine_id, session_token, status, last_connected_at, created_at, updated_at`
- `POST /api/p2p/enrollment-code` — generates 8-char code (5 min TTL)
- `POST /api/p2p/pair` — validates code, stores session_token
- `POST /api/relay-auth/client/p2p-pair` — calls remote `/api/p2p/pair` with code
- `P2pConnectionManager` — connects outbound via `ws://{address}:{relay_port}/v1/relay/connect`

### What Phase 2 adds

| Feature | Detail |
|---------|--------|
| SSH tunnel transport | `P2pConnectionManager` tries direct WS first; if it fails, opens SSH tunnel and routes WS through `localhost:{forwarded_port}` |
| SSH key auth | New pairing flow: instead of code exchange, SSH connection proves identity; remote creates session token and returns it over SSH channel |
| DB schema extension | `ssh_user`, `ssh_port`, `ssh_key_path` columns on `p2p_hosts` |
| Host key verification | Known hosts file management; warn on first connect, error on mismatch |

### Critical: russh is already available

`russh` is used in `crates/embedded-ssh/`. Before writing any code:
- Read `crates/embedded-ssh/Cargo.toml` for the exact `russh` version in use
- Read `crates/embedded-ssh/src/lib.rs` for how russh sessions and channels are created
- Use the same `russh` version in `crates/ssh-tunnel/Cargo.toml`

### Key files to read before each task

| File | Task |
|------|------|
| `crates/embedded-ssh/Cargo.toml` | Task 2 — russh version |
| `crates/embedded-ssh/src/lib.rs` | Task 2 — russh session pattern |
| `crates/db/migrations/20260419000000_p2p_hosts.sql` | Task 1 — existing schema |
| `crates/db/src/p2p_hosts.rs` | Task 1, 5 — existing DB functions |
| `crates/server/src/runtime/p2p_connection.rs` | Task 3 — existing connection manager |
| `crates/server/src/routes/relay_auth/client.rs` | Task 4, 5 — existing pair route |
| `crates/server/src/routes/p2p_hosts.rs` | Task 5 — existing P2P routes |

### What You Are NOT Changing in Phase 2

- Cloud relay path (`VK_SHARED_RELAY_API_BASE`) — untouched
- `relay-tunnel` crate — untouched
- `relay-tunnel-core` — untouched
- Pairing code flow — still works alongside SSH key flow
- Frontend UI — Phase 3

---

## Task 1: DB Migration — SSH Columns

**Files:**
- Create: `crates/db/migrations/20260419000001_p2p_hosts_ssh.sql`
- Modify: `crates/db/src/p2p_hosts.rs` — add SSH fields to `P2pHost` struct, add `update_p2p_host_ssh_config`

### Step 1: Read existing schema

Read `crates/db/migrations/20260419000000_p2p_hosts.sql` to confirm current columns.

### Step 2: Create migration

```sql
-- crates/db/migrations/20260419000001_p2p_hosts_ssh.sql
ALTER TABLE p2p_hosts ADD COLUMN ssh_user TEXT;
ALTER TABLE p2p_hosts ADD COLUMN ssh_port INTEGER NOT NULL DEFAULT 22;
ALTER TABLE p2p_hosts ADD COLUMN ssh_key_path TEXT;
ALTER TABLE p2p_hosts ADD COLUMN connection_mode TEXT NOT NULL DEFAULT 'direct';
-- connection_mode: 'direct' | 'ssh' | 'auto'
-- 'auto' = try direct first, fall back to SSH

ALTER TABLE p2p_hosts ADD COLUMN known_host_key TEXT;
-- stored public key fingerprint for host key verification
```

### Step 3: Extend P2pHost struct

In `crates/db/src/p2p_hosts.rs`, add to `P2pHost`:

```rust
pub ssh_user: Option<String>,
pub ssh_port: i64,
pub ssh_key_path: Option<String>,
pub connection_mode: String,
pub known_host_key: Option<String>,
```

Add new function:

```rust
pub async fn update_p2p_host_ssh_config(
    db: &DBService,
    id: &str,
    ssh_user: Option<&str>,
    ssh_port: i64,
    ssh_key_path: Option<&str>,
    connection_mode: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        r#"UPDATE p2p_hosts
           SET ssh_user = ?, ssh_port = ?, ssh_key_path = ?,
               connection_mode = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?"#,
        ssh_user, ssh_port, ssh_key_path, connection_mode, id,
    )
    .execute(&db.pool)
    .await?;
    Ok(())
}

pub async fn update_known_host_key(
    db: &DBService,
    id: &str,
    key_fingerprint: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "UPDATE p2p_hosts SET known_host_key = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        key_fingerprint, id,
    )
    .execute(&db.pool)
    .await?;
    Ok(())
}
```

Update ALL existing query functions (`list_p2p_hosts`, `create_p2p_host`, `list_paired_hosts`) to include the new columns in their SELECT statements. Use dynamic queries (not `sqlx::query_as!` macros) since `sqlx-cli` is not installed — use `sqlx::query_as::<_, P2pHost>()` pattern matching what's already in the file.

### Step 4: Compile check

```bash
cargo check -p db 2>&1 | head -20
cargo check -p server 2>&1 | head -20
```

Fix all errors (most will be missing fields in struct literals elsewhere).

### Step 5: Commit

```bash
git add crates/db/migrations/20260419000001_p2p_hosts_ssh.sql \
        crates/db/src/p2p_hosts.rs
git commit -m "feat(db): add SSH tunnel config columns to p2p_hosts"
```

---

## Task 2: New Crate — `crates/ssh-tunnel/`

**Goal:** A portable SSH tunnel client that opens a local TCP port forward over an SSH connection. Used by the P2P connection manager as a transport layer.

**Files:**
- Modify: `Cargo.toml` (root) — add `"crates/ssh-tunnel"` to members
- Create: `crates/ssh-tunnel/Cargo.toml`
- Create: `crates/ssh-tunnel/src/lib.rs`
- Create: `crates/ssh-tunnel/src/tunnel.rs` — SSH tunnel management
- Create: `crates/ssh-tunnel/src/known_hosts.rs` — host key verification
- Create: `crates/ssh-tunnel/src/error.rs` — error types

> **CRITICAL:** Before writing Cargo.toml, read `crates/embedded-ssh/Cargo.toml` to get the exact russh version and feature flags used in this workspace. Use the exact same version.

### Step 1: Read russh usage pattern

Read `crates/embedded-ssh/src/lib.rs` and `crates/embedded-ssh/Cargo.toml` fully.

### Step 2: Write failing test

```rust
// crates/ssh-tunnel/tests/tunnel_test.rs
// This is a compile test only — real SSH requires a running server
#[test]
fn test_ssh_config_builds() {
    let config = ssh_tunnel::SshConfig {
        host: "example.com".to_string(),
        port: 22,
        user: "deploy".to_string(),
        key_path: std::path::PathBuf::from("/home/user/.ssh/id_ed25519"),
        remote_host: "127.0.0.1".to_string(),
        remote_port: 8081,
    };
    assert_eq!(config.host, "example.com");
    assert_eq!(config.port, 22);
}

#[test]
fn test_fingerprint_format() {
    // SHA256:base64-encoded fingerprint
    let fp = "SHA256:abc123def456";
    assert!(fp.starts_with("SHA256:"));
}
```

Run: `cargo test -p ssh-tunnel` — expected: compile error.

### Step 3: Write `Cargo.toml`

Use exact russh version from `embedded-ssh/Cargo.toml`.

```toml
[package]
name = "ssh-tunnel"
version = "0.1.0"
edition = "2021"

[dependencies]
russh       = { version = "MATCH_EMBEDDED_SSH", features = ["..."] }
russh-keys  = { version = "MATCH_EMBEDDED_SSH" }
tokio       = { workspace = true, features = ["net", "io-util"] }
tokio-util  = { workspace = true }
anyhow      = { workspace = true }
tracing     = { workspace = true }
thiserror   = { workspace = true }

[dev-dependencies]
tokio = { workspace = true, features = ["full"] }
```

### Step 4: Write `src/error.rs`

```rust
use thiserror::Error;

#[derive(Debug, Error)]
pub enum SshTunnelError {
    #[error("SSH connection failed: {0}")]
    Connection(#[from] russh::Error),
    #[error("Host key mismatch for {host}: expected {expected}, got {actual}")]
    HostKeyMismatch {
        host: String,
        expected: String,
        actual: String,
    },
    #[error("SSH key load error: {0}")]
    KeyLoad(String),
    #[error("Port forward failed: {0}")]
    PortForward(String),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
}
```

### Step 5: Write `src/known_hosts.rs`

```rust
// Manages host key fingerprints for P2P hosts.
// Phase 2 behavior:
//   - First connect: store fingerprint, log warning (trust on first use)
//   - Subsequent connects: verify fingerprint matches stored; error on mismatch

pub fn compute_fingerprint(key: &russh_keys::key::PublicKey) -> String {
    // Return SHA256:base64(sha256(key_bytes))
}

pub fn verify_or_store(
    stored: Option<&str>,
    actual_fingerprint: &str,
    host: &str,
) -> Result<Option<String>, SshTunnelError> {
    // Returns Some(new_fingerprint) if first-time (should be stored)
    // Returns None if fingerprint matches stored
    // Returns Err if mismatch
}
```

### Step 6: Write `src/tunnel.rs`

```rust
use std::net::SocketAddr;
use tokio_util::sync::CancellationToken;

/// Configuration for an SSH tunnel.
pub struct SshConfig {
    pub host: String,
    pub port: u16,
    pub user: String,
    pub key_path: std::path::PathBuf,
    pub remote_host: String,
    pub remote_port: u16,
}

/// An active SSH tunnel that forwards a local port to a remote service.
pub struct SshTunnel {
    /// The local address clients should connect to.
    pub local_addr: SocketAddr,
    // Internal: session handle, shutdown token
}

impl SshTunnel {
    /// Establish the SSH connection and start forwarding.
    /// The tunnel is active until the returned handle is dropped
    /// or `shutdown` is cancelled.
    pub async fn connect(
        config: SshConfig,
        known_host: Option<&str>,
        shutdown: CancellationToken,
    ) -> Result<(Self, Option<String>), SshTunnelError> {
        // 1. Connect TCP to host:port
        // 2. Handshake SSH session
        // 3. Verify/store host key fingerprint
        // 4. Authenticate with key_path (public key auth)
        // 5. Open a channel and request direct-tcpip forwarding
        //    from local listener → remote_host:remote_port
        // 6. Bind a local TcpListener on 127.0.0.1:0 (OS-assigned port)
        // 7. Spawn task: accept connections on local listener,
        //    proxy each to the SSH direct-tcpip channel
        // Returns (tunnel with local_addr, Option<new_fingerprint_to_store>)
    }
}
```

> **Implementation note:** Study the russh API in `embedded-ssh/src/lib.rs` carefully. The `direct-tcpip` channel is the SSH port forward mechanism. For each local TCP connection, open a new SSH channel with `session.channel_open_direct_tcpip(remote_host, remote_port, "127.0.0.1", local_client_port)`.

### Step 7: Write `src/lib.rs`

```rust
pub mod error;
pub mod known_hosts;
pub mod tunnel;

pub use error::SshTunnelError;
pub use tunnel::{SshConfig, SshTunnel};
```

### Step 8: Add to workspace and compile

Add `"crates/ssh-tunnel"` to root `Cargo.toml` members.

```bash
cargo check -p ssh-tunnel 2>&1 | head -40
cargo test -p ssh-tunnel 2>&1
```

The two compile-only tests should pass.

### Step 9: Commit

```bash
git add crates/ssh-tunnel/ Cargo.toml Cargo.lock
git commit -m "feat(ssh-tunnel): add SSH tunnel crate for P2P transport"
```

---

## Task 3: Connection Strategy — Direct → SSH Fallback

**Goal:** Modify `P2pConnectionManager` to implement the connection strategy:
1. Try direct WebSocket (`ws://address:relay_port`)
2. If direct fails (connection refused or timeout), try SSH tunnel then WS through localhost

**Files:**
- Modify: `crates/server/src/runtime/p2p_connection.rs`
- Modify: `crates/server/Cargo.toml` — add `ssh-tunnel = { path = "../../crates/ssh-tunnel" }` if not already present

> Read `crates/server/src/runtime/p2p_connection.rs` fully before editing.

### Step 1: Write the test

```rust
// In p2p_connection.rs tests:
#[test]
fn test_connection_mode_parsing() {
    assert!(matches!(ConnectionMode::from_str("direct"), ConnectionMode::Direct));
    assert!(matches!(ConnectionMode::from_str("ssh"), ConnectionMode::Ssh));
    assert!(matches!(ConnectionMode::from_str("auto"), ConnectionMode::Auto));
    assert!(matches!(ConnectionMode::from_str("unknown"), ConnectionMode::Auto)); // default
}

#[test]
fn test_direct_relay_url() {
    let url = build_relay_ws_url("vps.example.com", 8081, "m1", "host1");
    assert!(url.starts_with("ws://vps.example.com:8081"));
}
```

### Step 2: Add `ConnectionMode` enum

```rust
pub enum ConnectionMode {
    Direct,   // only try WS directly
    Ssh,      // only use SSH tunnel
    Auto,     // try direct first, fall back to SSH (default)
}

impl ConnectionMode {
    pub fn from_str(s: &str) -> Self {
        match s {
            "direct" => Self::Direct,
            "ssh" => Self::Ssh,
            _ => Self::Auto,
        }
    }
}
```

### Step 3: Update `P2pConnectionManager::run`

Extend the host data loaded from DB to include `ssh_user`, `ssh_port`, `ssh_key_path`, `connection_mode`, `known_host_key`.

For each paired host, spawn the appropriate connection strategy:

```rust
async fn connect_host(
    host: P2pHost,
    server_addr: SocketAddr,
    deployment: DeploymentImpl,
    shutdown: CancellationToken,
) {
    let mode = ConnectionMode::from_str(&host.connection_mode);
    let relay_url = build_relay_ws_url(&host.address, host.relay_port as u16, ...);

    match mode {
        ConnectionMode::Direct => {
            connect_with_backoff(relay_url, token, server_addr, shutdown, mid).await;
        }
        ConnectionMode::Ssh => {
            connect_via_ssh(host, server_addr, deployment, shutdown).await;
        }
        ConnectionMode::Auto => {
            // Try direct first with short timeout (5s)
            // If it fails, fall back to SSH
            if try_direct_once(&relay_url, &token, server_addr, 5).await.is_err() {
                connect_via_ssh(host, server_addr, deployment, shutdown).await;
            } else {
                connect_with_backoff(relay_url, token, server_addr, shutdown, mid).await;
            }
        }
    }
}

async fn connect_via_ssh(
    host: P2pHost,
    server_addr: SocketAddr,
    deployment: DeploymentImpl,
    shutdown: CancellationToken,
) {
    let key_path = match host.ssh_key_path {
        Some(p) => std::path::PathBuf::from(p),
        None => {
            tracing::warn!(machine_id = %host.machine_id, "No SSH key configured, skipping SSH tunnel");
            return;
        }
    };
    let user = host.ssh_user.unwrap_or_else(|| "root".to_string());

    let ssh_config = ssh_tunnel::SshConfig {
        host: host.address.clone(),
        port: host.ssh_port as u16,
        user,
        key_path,
        remote_host: "127.0.0.1".to_string(),
        remote_port: host.relay_port as u16,
    };

    // Backoff loop: connect SSH, then connect WS through tunnel
    let mut backoff = std::time::Duration::from_secs(2);
    loop {
        if shutdown.is_cancelled() { break; }

        match ssh_tunnel::SshTunnel::connect(ssh_config.clone(), host.known_host_key.as_deref(), shutdown.clone()).await {
            Ok((tunnel, new_fp)) => {
                // Store new fingerprint if first-time
                if let Some(fp) = new_fp {
                    let _ = db::p2p_hosts::update_known_host_key(deployment.db(), &host.id, &fp).await;
                }

                // Now connect WS through the local tunnel port
                let local_relay_url = format!("ws://127.0.0.1:{}/v1/relay/connect?...", tunnel.local_addr.port());
                let token = host.session_token.clone().unwrap_or_default();
                let result = start_relay_client(RelayClientConfig {
                    ws_url: local_relay_url,
                    bearer_token: token,
                    local_addr: server_addr,
                    shutdown: shutdown.clone(),
                }).await;

                if shutdown.is_cancelled() { break; }
                tracing::warn!(machine_id = %host.machine_id, ?result, "SSH tunnel WS disconnected");
            }
            Err(e) => {
                tracing::warn!(machine_id = %host.machine_id, error = %e, "SSH tunnel failed");
            }
        }

        tokio::select! {
            _ = shutdown.cancelled() => break,
            _ = tokio::time::sleep(backoff) => {}
        }
        backoff = (backoff * 2).min(std::time::Duration::from_secs(60));
    }
}
```

### Step 4: Compile and test

```bash
cargo check -p server 2>&1 | head -40
cargo test -p server -- p2p_connection 2>&1
```

### Step 5: Commit

```bash
git add crates/server/src/runtime/p2p_connection.rs crates/server/Cargo.toml
git commit -m "feat(server): add SSH tunnel fallback in P2P connection manager"
```

---

## Task 4: SSH Key-Based Pairing

**Goal:** Add a new pairing flow where SSH access to the remote host proves identity — no manual code needed. The local instance SSHes to the remote, runs a pairing command, and gets a session token back.

**Files:**
- Create: `crates/server/src/routes/p2p_ssh_pair.rs`
- Modify: `crates/server/src/routes/mod.rs` — mount new router

### Step 1: How it works

```
Local machine                         Remote VPS
─────────────                         ──────────
1. User adds host with SSH config
   (address, ssh_user, ssh_port,
    ssh_key_path)

2. Local SSHes to VPS and runs:
   POST http://127.0.0.1:{api_port}/api/p2p/ssh-pair
   { machine_id, name }
   (request goes over SSH tunnel,
    not over internet)

3. VPS sees request from 127.0.0.1
   (localhost), treats as trusted,
   skips pairing code,
   returns session_token

4. Local stores session_token
   and SSH config in DB
```

### Step 2: New route on remote (server side)

In `p2p_ssh_pair.rs`, add:

```
POST /p2p/ssh-pair
```

This endpoint ONLY accepts requests from `127.0.0.1` (localhost). Because it comes over an SSH tunnel, the caller has already proven SSH key access. No pairing code required.

```rust
#[derive(Debug, Deserialize)]
pub struct SshPairRequest {
    pub machine_id: String,
    pub name: String,
}

async fn ssh_pair(
    State(deployment): State<DeploymentImpl>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    Json(req): Json<SshPairRequest>,
) -> Result<Json<ApiResponse<CompletePairingResponse>>, ApiError> {
    // Only allow from localhost — SSH tunnel guarantees caller has SSH access
    if !addr.ip().is_loopback() {
        return Err(ApiError::Forbidden("ssh-pair only available over SSH tunnel".to_string()));
    }

    let session_token = uuid::Uuid::new_v4().to_string().replace('-', "");
    let db = deployment.db();

    let host = db::p2p_hosts::create_p2p_host(db, CreateP2pHostParams {
        name: req.name,
        address: addr.ip().to_string(),
        relay_port: 8081,
        machine_id: req.machine_id.clone(),
    }).await?;

    db::p2p_hosts::update_p2p_host_paired(db, &host.id, &session_token).await?;

    tracing::info!(machine_id = %req.machine_id, "SSH-based P2P pairing succeeded");

    Ok(Json(ApiResponse::success(CompletePairingResponse {
        session_token,
        host_machine_id: deployment.user_id().to_string(),
    })))
}
```

> **Note:** Using `ConnectInfo` requires `into_make_service_with_connect_info::<SocketAddr>()`. Check `crates/server/src/startup.rs` to see how the server is started. If it uses `into_make_service()`, this change is needed. If `ConnectInfo` is too invasive, use a different mechanism: check for an SSH-tunnel-specific header that the ssh-pair client sets, and validate it against a nonce.

### Step 3: New route on client side

Add `POST /relay-auth/client/ssh-pair` in `relay_auth/client.rs`:

```rust
#[derive(Debug, Deserialize)]
pub struct SshPairClientRequest {
    pub name: String,
    pub address: String,
    pub api_port: Option<u16>,
    pub relay_port: Option<u16>,
    pub ssh_user: String,
    pub ssh_port: Option<u16>,
    pub ssh_key_path: String,
}

async fn ssh_pair_host(
    State(deployment): State<DeploymentImpl>,
    Json(req): Json<SshPairClientRequest>,
) -> Result<Json<ApiResponse<P2pPairResponse>>, ApiError> {
    // 1. Create SSH tunnel to address:ssh_port with ssh_user + key
    //    forward 127.0.0.1:0 → 127.0.0.1:api_port on remote
    // 2. POST to http://127.0.0.1:{tunnel.local_port}/api/p2p/ssh-pair
    //    with { machine_id, name }
    // 3. Parse session_token from response
    // 4. Store p2p_host record with SSH config + session_token
    // 5. Close tunnel (pairing done; connection manager will re-open it)
}
```

### Step 4: Compile and test

```bash
cargo check -p server 2>&1 | head -40
cargo clippy -p server -- -D warnings 2>&1 | head -20
```

### Step 5: Commit

```bash
git add crates/server/src/routes/p2p_ssh_pair.rs \
        crates/server/src/routes/relay_auth/client.rs \
        crates/server/src/routes/mod.rs
git commit -m "feat(server): add SSH key-based P2P pairing flow"
```

---

## Task 5: Update P2P Routes for SSH Config

**Goal:** Update `POST /api/relay-auth/client/p2p-pair` (existing pairing route) and `GET /api/p2p/hosts` to include SSH config fields, and add `PUT /api/p2p/hosts/{id}/ssh-config` for updating SSH settings on an existing paired host.

**Files:**
- Modify: `crates/server/src/routes/p2p_hosts.rs`
- Modify: `crates/server/src/routes/relay_auth/client.rs` — extend `P2pPairRequest`

### Changes

1. **Extend `P2pPairRequest`** with optional SSH fields:
   ```rust
   pub ssh_user: Option<String>,
   pub ssh_port: Option<u16>,
   pub ssh_key_path: Option<String>,
   pub connection_mode: Option<String>,  // "direct" | "ssh" | "auto"
   ```
   After successful pairing, call `update_p2p_host_ssh_config` if any SSH fields were provided.

2. **Add `PUT /api/p2p/hosts/{id}/ssh-config`**:
   ```rust
   #[derive(Debug, Deserialize)]
   pub struct UpdateSshConfigRequest {
       pub ssh_user: Option<String>,
       pub ssh_port: Option<u16>,
       pub ssh_key_path: Option<String>,
       pub connection_mode: Option<String>,
   }
   ```
   Calls `update_p2p_host_ssh_config` on the DB.

3. **`P2pHost` response** already includes new fields (from Task 1 DB change) — no extra change needed.

### Compile, clippy, commit

```bash
cargo check -p server 2>&1 | head -20
cargo clippy -p server -- -D warnings 2>&1 | head -20
git add crates/server/src/routes/p2p_hosts.rs \
        crates/server/src/routes/relay_auth/client.rs
git commit -m "feat(server): expose SSH config in P2P pair and host routes"
```

---

## Task 6: Final Workspace Check

**Goal:** Ensure entire workspace compiles, existing tests still pass, and Phase 2 additions are sound.

### Steps

```bash
# 1. Full workspace compile
cargo check --workspace 2>&1 | tail -20

# 2. Workspace tests
cargo test --workspace --lib 2>&1 | tail -30

# 3. Phase 1 relay integration tests still pass
cargo test -p local-relay --test integration_test -- --nocapture

# 4. Phase 2 SSH tunnel compile tests
cargo test -p ssh-tunnel 2>&1

# 5. Server P2P tests
cargo test -p server -- p2p 2>&1

# 6. Clippy
cargo clippy --workspace -- -D warnings 2>&1 | head -40

# 7. Format
pnpm run format

# 8. Final commit
git add -A
git commit -m "chore: format and finalize Phase 2 P2P SSH tunnel support" 2>/dev/null || echo "nothing to commit"
```

### Completion Checklist

- [ ] `crates/ssh-tunnel/` compiles; compile-only tests pass
- [ ] `p2p_hosts` table has SSH columns (`ssh_user`, `ssh_port`, `ssh_key_path`, `connection_mode`, `known_host_key`)
- [ ] `P2pConnectionManager` supports `ConnectionMode`: Direct, SSH, Auto
- [ ] `POST /api/p2p/ssh-pair` only accepts from loopback
- [ ] `POST /api/relay-auth/client/ssh-pair` opens SSH tunnel, calls remote ssh-pair, stores result
- [ ] `PUT /api/p2p/hosts/{id}/ssh-config` updates SSH settings on existing host
- [ ] `cargo check --workspace` passes
- [ ] Phase 1 integration tests still pass

---

## What's Next (Phase 3)

- Frontend: Remote Hosts settings page in `packages/web-core/`
- SSH config form (user, port, key picker)
- Host switcher in main app sidebar (local / remote)
- Connection status indicators (direct / SSH / offline)
- Web UI served through self-hosted local-relay

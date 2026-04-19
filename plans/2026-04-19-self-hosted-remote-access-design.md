# Self-Hosted Remote Access Design

> Access one Vibe Kanban instance from another without Vibe Kanban Cloud

## Overview

This design enables bidirectional remote access between Vibe Kanban instances across different networks (e.g., local machine behind NAT ↔ VPS with public IP) without any dependency on Vibe Kanban Cloud.

### Requirements

- **Deployment**: Different networks (local machine behind NAT, VPS with public IP)
- **Control direction**: Bidirectional — either instance can control the other
- **Discovery**: Manual configuration (user enters host address in settings)
- **Authentication**: SSH key-based (primary) or SPAKE2 pairing codes (fallback)
- **Capabilities**: Full access — view and edit all projects, issues, workspaces
- **UI**: Desktop app (primary) + web UI (fallback)

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         VPS (Public IP)                         │
│  ┌─────────────────┐    ┌─────────────────┐                     │
│  │  Vibe Kanban    │    │  Relay Server   │◄──── Web UI access  │
│  │  (local data)   │    │  (self-hosted)  │      from anywhere  │
│  └────────┬────────┘    └────────┬────────┘                     │
│           │                      │                              │
└───────────┼──────────────────────┼──────────────────────────────┘
            │                      │
            │    Persistent WebSocket (outbound from local)
            │                      │
┌───────────┼──────────────────────┼──────────────────────────────┐
│           │                      │         Local Machine (NAT)  │
│  ┌────────▼────────┐    ┌────────▼────────┐                     │
│  │  Relay Client   │◄──►│  Vibe Kanban    │◄──── Desktop app    │
│  │  (connects out) │    │  (local data)   │                     │
│  └─────────────────┘    └─────────────────┘                     │
└─────────────────────────────────────────────────────────────────┘
```

**Key principle:** Local machine always initiates the connection (outbound WebSocket to VPS). Once connected, either side can send requests through the tunnel.

### What We Reuse

- Existing `relay-tunnel` and `relay-tunnel-core` crates
- SPAKE2 pairing from `relay-types` and `relay_auth` routes
- WebSocket multiplexing via Yamux

### What Changes

- Remove cloud dependency — relay runs on VPS, not cloud.vibekanban.com
- Manual host configuration instead of cloud-based discovery
- Self-contained authentication (no OAuth to cloud)
- SSH tunnel support as transport layer

## Connection & Pairing Flow

### First-Time Pairing (SSH Key Method)

```
Local Machine                         VPS
─────────────                         ───
1. User adds host with SSH config:
   - Address: vps.example.com
   - SSH User: deploy
   - SSH Port: 22 (or custom)
   - SSH Key: ~/.ssh/id_ed25519

2. Vibe Kanban connects via SSH, runs:
   `vibe-kanban pair --accept <local_host_id>`

3. VPS registers local machine as trusted
   (no manual pairing code needed)

Trust model: If you have SSH access, you're trusted
```

### First-Time Pairing (Code Method — Fallback)

```
Local Machine                         VPS
─────────────                         ───
1. User enters VPS address in settings
   (e.g., vps.example.com:8080)

2. VPS generates pairing code (e.g., A7Km3xPq)
   shown in VPS's settings UI

3. User enters pairing code on local machine

4. SPAKE2 exchange establishes shared secret

5. Both sides store pairing (host_id, secret)
   in local SQLite
```

### Subsequent Connections (Automatic)

```
Local Machine                         VPS
─────────────                         ───
1. On startup, connect to all paired hosts
   using stored address + credentials

2. WebSocket established, authenticated
   via stored session credentials

3. Bidirectional tunnel ready
   - Local can query VPS's API
   - VPS can query Local's API
```

### Configuration Storage

```sql
-- In local SQLite (no cloud DB)
CREATE TABLE paired_hosts (
    id TEXT PRIMARY KEY,
    address TEXT NOT NULL,
    name TEXT NOT NULL,
    ssh_user TEXT,
    ssh_port INTEGER DEFAULT 22,
    ssh_key_path TEXT,
    session_secret BLOB,  -- encrypted
    last_connected TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## Connection Strategy

```
┌─────────────────────────────────────────────────────────────────┐
│                     Connection Strategy                          │
├─────────────────────────────────────────────────────────────────┤
│  1. Try direct WebSocket (wss://vps.example.com:8081)           │
│     └─ If success → use direct connection                       │
│     └─ If blocked/timeout → fall back to SSH                    │
│                                                                 │
│  2. SSH tunnel fallback (ssh -L 8081:localhost:8081 user@vps)   │
│     └─ Uses configured SSH key                                  │
│     └─ WebSocket connects through localhost tunnel              │
└─────────────────────────────────────────────────────────────────┘
```

## Security Measures

### Against Brute Force Attacks

| Protection | Implementation |
|------------|----------------|
| **Rate limiting** | Max 5 pairing attempts per IP per 15 minutes, then 1-hour lockout |
| **Code complexity** | 8-character alphanumeric codes = ~8.5 trillion combinations |
| **Code expiry** | Pairing codes expire after 5 minutes |
| **Single-use codes** | Code invalidated after first attempt (success or fail) |
| **Exponential backoff** | After each failed attempt: 2s → 4s → 8s → 16s delay |

### Against Botnet/Unauthorized Access

| Protection | Implementation |
|------------|----------------|
| **Mutual authentication** | Both sides prove knowledge of shared secret |
| **Host allowlist** | Only explicitly paired hosts can connect |
| **Connection signing** | Every request signed with session key |
| **Session rotation** | Session keys rotated every 24 hours |
| **Revocation** | UI to unpair/block hosts; immediate effect |

### Pairing Code Generation

```rust
fn generate_pairing_code() -> String {
    // 8 chars from alphanumeric (excluding confusing chars: 0, O, l, 1, I)
    // Charset: 2-9, A-H, J-N, P-Z, a-k, m-z = 55 chars
    // 55^8 = ~8.5 trillion combinations
    let charset = "23456789ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz";
    (0..8).map(|_| random_char(charset)).collect()
}
```

### Audit Logging

```
[2026-04-19 10:23:45] PAIR_ATTEMPT ip=203.0.113.5 result=FAILED reason=INVALID_CODE
[2026-04-19 10:23:47] PAIR_ATTEMPT ip=203.0.113.5 result=RATE_LIMITED lockout_until=11:23:47
[2026-04-19 10:45:12] PAIR_SUCCESS ip=192.168.1.50 host_id=laptop-home
[2026-04-19 10:45:12] CONNECTION_ESTABLISHED host_id=laptop-home tunnel_id=abc123
```

## SSH Integration

### SSH Tunnel Implementation

```rust
struct SshTunnel {
    host: String,
    user: String,
    port: u16,
    key_path: PathBuf,
    local_port: u16,      // Local end of tunnel
    remote_port: u16,     // Remote port to forward
}

impl SshTunnel {
    async fn connect(&self) -> Result<TunnelHandle> {
        // Uses rust-based SSH (russh) - no shell exec
        // Creates: localhost:{local_port} → {host}:{remote_port}
    }
}

async fn connect_to_host(config: &HostConfig) -> Result<Connection> {
    // 1. Try direct WebSocket
    if let Ok(conn) = try_direct_websocket(&config.address).await {
        return Ok(conn);
    }
    
    // 2. Fall back to SSH tunnel
    let tunnel = SshTunnel::new(config)?;
    let handle = tunnel.connect().await?;
    let conn = websocket_via_tunnel(handle.local_port).await?;
    Ok(conn)
}
```

### Security Notes

- SSH key never leaves local machine
- Supports SSH agent for key management
- Supports passphrase-protected keys (prompts once, caches in memory)
- Host key verification (warns on first connect, errors on mismatch)

## User Interface

### Settings Page — Remote Hosts Tab

```
┌─────────────────────────────────────────────────────────────────┐
│  Settings                                                   ✕   │
├─────────────────────────────────────────────────────────────────┤
│  General │ Appearance │ Remote Hosts │ About                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─ This Host ─────────────────────────────────────────────┐    │
│  │  Host Name: My Laptop                          [Edit]   │    │
│  │  Host ID: laptop-abc123                                 │    │
│  │                                                         │    │
│  │  [Show Pairing Code]  ← Others use this to connect      │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  ┌─ Paired Hosts ──────────────────────────────────────────┐    │
│  │                                                         │    │
│  │  🟢 My VPS              vps.example.com:8080            │    │
│  │     Connected · Last sync: 2 min ago        [Unpair]    │    │
│  │                                                         │    │
│  │  🔴 Office Server       192.168.1.100:8080              │    │
│  │     Offline · Last seen: 3 days ago         [Unpair]    │    │
│  │                                                         │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  ┌─ Add Remote Host ───────────────────────────────────────┐    │
│  │  Connection Method:  ○ Direct  ● SSH  ○ Both (auto)     │    │
│  │                                                         │    │
│  │  Address: [vps.example.com      ]                       │    │
│  │  API Port: [8080]  Relay Port: [8081]                   │    │
│  │                                                         │    │
│  │  SSH User: [deploy              ]                       │    │
│  │  SSH Port: [22                  ]                       │    │
│  │  SSH Key:  [~/.ssh/id_ed25519   ]  [Browse]             │    │
│  │                                                         │    │
│  │  Auth:  ● SSH key  ○ Pairing code                       │    │
│  │                                                         │    │
│  │                      [Test Connection] [Save]           │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

### Main App — Remote Host Switcher

```
┌─────────────────────────────────────────────────────────────────┐
│  ☰  Vibe Kanban                              🔔  ⚙️  👤        │
├──────────────┬──────────────────────────────────────────────────┤
│              │                                                  │
│  WORKSPACES  │   ┌─────────────────────────────────────────┐    │
│  ─────────── │   │  Viewing: My VPS  [▼]                   │    │
│  📁 Project A│   │  ┌─ Switch Host ──────────────────────┐ │    │
│  📁 Project B│   │  │  ● This Device (local)             │ │    │
│              │   │  │  ○ My VPS 🟢                       │ │    │
│  REMOTE HOSTS│   │  │  ○ Office Server 🔴                │ │    │
│  ─────────── │   │  └────────────────────────────────────┘ │    │
│  🟢 My VPS   │   └─────────────────────────────────────────┘    │
│  🔴 Office   │                                                  │
│              │   [Projects and issues from selected host]       │
│  [+ Add Host]│                                                  │
│              │                                                  │
└──────────────┴──────────────────────────────────────────────────┘
```

## Implementation Plan

### Phase 1: Core Infrastructure

- Extract relay server to standalone self-hosted crate
- Add SSH tunnel client crate
- Database schema for paired hosts
- Basic pairing flow (code-based, no SSH yet)

### Phase 2: SSH Integration

- SSH key-based authentication
- SSH tunnel transport
- Connection fallback logic (direct → SSH)
- Host key verification

### Phase 3: UI/UX

- Settings page for remote hosts
- Host switcher in main app
- Connection status indicators
- Web UI access through self-hosted relay

### Phase 4: Security Hardening

- Rate limiting for pairing
- Audit logging
- Session rotation
- Host revocation

## Code Changes

### New Crates

```
crates/
├── p2p-relay/                    # Self-hosted relay server
│   ├── src/
│   │   ├── lib.rs
│   │   ├── server.rs             # Relay server (from relay-tunnel)
│   │   ├── client.rs             # Relay client
│   │   └── pairing.rs            # SPAKE2 + rate limiting
│   └── Cargo.toml
│
└── ssh-tunnel/                   # SSH transport
    ├── src/
    │   ├── lib.rs
    │   ├── tunnel.rs             # SSH tunnel management
    │   ├── key_auth.rs           # SSH key-based host auth
    │   └── known_hosts.rs        # Host key verification
    └── Cargo.toml
```

### Modified Files

```
crates/server/src/
├── routes/
│   ├── p2p_hosts.rs              # NEW: CRUD for paired hosts
│   └── relay_auth/               # MODIFIED: Add SSH auth option
└── runtime/
    └── p2p_connection.rs         # NEW: Connection manager

crates/db/migrations/
└── YYYYMMDD_p2p_hosts.sql        # NEW: paired_hosts table

packages/web-core/src/
├── shared/
│   ├── lib/
│   │   └── p2pApi.ts             # NEW: P2P host API client
│   └── dialogs/settings/
│       └── RemoteHostsSettings.tsx  # NEW: Settings UI
└── features/
    └── host-switcher/            # NEW: Host switching UI
```

## Dependencies

### Rust Crates

- `russh` — Pure Rust SSH client (for SSH tunneling)
- `spake2` — Already used for SPAKE2 pairing
- `yamux` — Already used for WebSocket multiplexing

### No New Frontend Dependencies

All UI components use existing design system from `web-core`.

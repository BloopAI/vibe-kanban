# Jira Integration for Vibe Kanban - Technical Overview

## Problem Solved
When creating tasks in Vibe Kanban, developers had to manually copy Jira ticket details. This integration lets you select from your assigned Jira tickets and auto-populate the task title and description, giving AI agents full context.

---

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────┐
│   React UI  │────▶│  Axum API   │────▶│ Claude CLI  │────▶│ Atlassian   │────▶│  Jira   │
│  (Frontend) │     │  (Backend)  │     │ (Subprocess)│     │ MCP Plugin  │     │   API   │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘     └─────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │   SQLite    │
                    │   Cache     │
                    └─────────────┘
```

---

## How the Claude MCP Call Works

The backend spawns a Claude CLI process to fetch Jira data:

```rust
Command::new("claude")
    .args([
        "-p",                           // Print mode (non-interactive, single response)
        "--permission-mode", "bypassPermissions",  // Allow MCP tools without prompts
        "--output-format", "json",      // Structured output for parsing
        "--model", "haiku",             // Faster model for simple API tasks
        prompt,                         // Instructions for Claude
    ])
    .stdin(Stdio::null())              // Close stdin to prevent hanging
    .stdout(Stdio::piped())
    .stderr(Stdio::piped())
    .output()
```

### Key flags explained:
- `-p` (print mode): Claude responds once and exits, no interactive session
- `--permission-mode bypassPermissions`: MCP plugins normally require user confirmation for each tool call. This flag bypasses that for automated use.
- `--model haiku`: Cheaper and faster than Sonnet/Opus - sufficient for structured data retrieval
- `stdin(Stdio::null())`: Critical - without this, the process waits for input and hangs

### The prompt instructs Claude to:
1. Use the Atlassian MCP `search` tool to find assigned, unresolved issues
2. Fetch full details for each issue (including description)
3. Return a JSON array with specific fields: `key`, `summary`, `status`, `url`, `description`

Claude's Atlassian MCP plugin handles authentication using credentials you configured when setting up the plugin (`claude mcp add atlassian`).

---

## Caching System

### Why caching?
Claude MCP calls take 10-20 seconds. Without caching, every dropdown open would freeze the UI.

### Implementation:
```sql
CREATE TABLE jira_cache (
    id         INTEGER PRIMARY KEY,
    cache_key  TEXT NOT NULL UNIQUE,    -- "my_issues"
    data       TEXT NOT NULL,           -- JSON blob
    cached_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### Flow:
1. User clicks "Load Jira tickets"
2. Backend checks cache: is there an entry < 5 minutes old?
   - **Yes (cache hit)**: Return instantly
   - **No (cache miss)**: Call Claude MCP, store result, return
3. User clicks "Refresh": Always calls Claude MCP, updates cache

### Endpoints:
- `GET /api/jira/my-issues` - Uses cache
- `POST /api/jira/refresh` - Bypasses cache

---

## Why Claude MCP Instead of Direct Jira API?

| Consideration | Claude MCP | Direct Jira API |
|---------------|------------|-----------------|
| **Setup time** | ~2 hours | 10-15 hours |
| **Authentication** | Uses existing MCP credentials | Requires OAuth 2.0 implementation |
| **Token management** | Handled by Claude | Must store/refresh tokens ourselves |
| **Latency** | ~10-20s (mitigated by caching) | ~1-2s |
| **Dependency** | Requires Claude CLI on server | Self-contained |

**Decision:** Since the team already uses Claude with Atlassian MCP configured, we leverage that existing auth. The latency downside is solved by caching.

---

## User Experience

| Action | Response Time | What Happens |
|--------|---------------|--------------|
| First load | ~10-20s | Claude MCP fetches from Jira |
| Repeat load (within 5 min) | ~10ms | Served from SQLite cache |
| Click "Refresh" | ~10-20s | Force-fetches fresh data |
| Select ticket | Instant | Title + description auto-fill |

---

## Files Changed

### Backend (Rust):
- `crates/services/src/services/jira.rs` - MCP call, JSON parsing, caching logic
- `crates/server/src/routes/jira.rs` - API endpoints
- `crates/db/src/models/jira_cache.rs` - Cache repository
- `crates/db/migrations/20260117000000_add_jira_cache.sql` - Schema

### Frontend (React):
- `frontend/src/components/tasks/JiraTicketSelector.tsx` - Dropdown component
- `frontend/src/components/dialogs/tasks/TaskFormDialog.tsx` - Integration

---

## Prerequisites for Users
1. Claude CLI installed and authenticated (`claude` command works)
2. Atlassian MCP plugin added: `claude mcp add atlassian`
3. Authenticated with Atlassian when prompted

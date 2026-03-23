# Slack Integration Design

**Date:** 2026-03-23
**Status:** Approved

## Overview

Add outbound Slack notifications to the remote server. When key events occur on a project (issue status change, comment added, PR created), a message is posted to a configured Slack channel. Configuration is per-project. All events are always notified — no per-event toggles.

## Database

New table `slack_project_connections` in the remote Postgres database:

```sql
CREATE TABLE slack_project_connections (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  channel_id          TEXT NOT NULL,
  encrypted_bot_token TEXT NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id)
);
```

- Bot token is encrypted at rest using AES-256-GCM via the existing `crypto` module and `VIBEKANBAN_REMOTE_LINEAR_ENCRYPTION_KEY` env var (reused).
- App-Level Token is not stored — only needed for Socket Mode (inbound events), not required for outbound-only.
- One connection per project enforced by the unique constraint.

## Rust Backend

### New module: `crates/remote/src/slack/`

Mirrors the structure of `crates/remote/src/linear/`:

| File | Responsibility |
|------|---------------|
| `mod.rs` | Re-exports sub-modules |
| `client.rs` | Thin `reqwest` wrapper around Slack `chat.postMessage` API |
| `db.rs` | SQL queries: get connection for project, upsert, delete |
| `notify.rs` | Public notification functions called from mutation hooks |

### Notification functions (`notify.rs`)

Three fire-and-forget async functions. Each:
1. Fetches the Slack connection for the project from the DB.
2. Decrypts the bot token.
3. Calls `client::post_message`.
4. On error: logs with `tracing::warn!` and returns — never propagates.

| Function | Trigger | Message format |
|----------|---------|----------------|
| `notify_status_change` | Issue status updated | `[ProjectName] Issue status changed: {title} → {new_status}` |
| `notify_comment_added` | Comment created on issue | `[ProjectName] New comment on "{issue_title}" by {author}` |
| `notify_pr_created` | PR created event | `[ProjectName] PR opened: "{pr_title}" by {author}` |

### API routes (`crates/remote/src/routes/slack.rs`)

Registered under `/api/slack/`, authenticated with existing auth middleware.

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/slack/connect` | Encrypt and store bot token + channel ID for the project |
| `DELETE` | `/api/slack/disconnect` | Remove the Slack connection for the project |
| `GET` | `/api/slack/status` | Return `{ connected: bool, channel_id: Option<String> }` |

### Integration points

- `notify_status_change` — called from the same mutation hook that triggers `push_issue_to_linear` on status updates.
- `notify_comment_added` — called from the comment creation mutation hook.
- `notify_pr_created` — called from the PR monitor event handler.

## Frontend

### New settings panel: `packages/web-core/src/shared/dialogs/settings/settings/slack-integration/`

Single component: `connect-panel.tsx`

**Disconnected state:**
- Input: Bot Token (password field)
- Input: Channel ID
- Button: "Connect"

**Connected state:**
- Shows configured channel ID
- Button: "Disconnect"

Plugs into the existing project settings dialog alongside the Linear integration section.

No new shared Rust→TS types required — API payloads are simple JSON not covered by the type generation pipeline.

## Error Handling

- Slack API failures are non-critical. All notification calls are fire-and-forget.
- Failed calls log a warning via `tracing::warn!` with the error and project/issue context.
- Connect/disconnect API errors return appropriate HTTP status codes to the frontend.

## Not in scope

- Inbound events from Slack (slash commands, interactive messages).
- Per-event notification toggles.
- Organization-level Slack connections.
- Message threading or rich Block Kit formatting (plain text messages only).

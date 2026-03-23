# Slack Integration Design

**Date:** 2026-03-23
**Status:** Approved

## Overview

Add outbound Slack notifications to the remote server. When key events occur on a project (issue status change, comment added, PR created), a message is posted to a configured Slack channel. Configuration is per-project. All events are always notified — no per-event toggles.

## Database

### Migration

New migration file: `crates/remote/migrations/20260323100000_slack_integration.sql`

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

- Bot token is encrypted at rest using AES-256-GCM via the existing `crypto` module.
- Uses `VIBEKANBAN_REMOTE_LINEAR_ENCRYPTION_KEY` env var — this key is shared between Linear and Slack integrations. Operators must ensure this key is set to enable either integration. If Linear integration is disabled (key removed), Slack tokens also become unreadable. Document this in deployment notes.
- App-Level Token is not stored — only needed for Socket Mode (inbound events), not required for outbound-only.
- One connection per project enforced by the unique constraint. Reconnecting replaces the existing row via upsert: `ON CONFLICT (project_id) DO UPDATE SET channel_id = EXCLUDED.channel_id, encrypted_bot_token = EXCLUDED.encrypted_bot_token, updated_at = NOW()`.

## Rust Backend

### New module: `crates/remote/src/slack/`

Mirrors the structure of `crates/remote/src/linear/`:

| File | Responsibility |
|------|---------------|
| `mod.rs` | Re-exports sub-modules |
| `client.rs` | Thin `reqwest` wrapper around Slack `chat.postMessage` and `auth.test` APIs |
| `db.rs` | SQL queries: get connection for project, upsert, delete |
| `notify.rs` | Public notification functions called from mutation hooks |

### Notification functions (`notify.rs`)

Three fire-and-forget async functions. Each:
1. Fetches the Slack connection for the project from the DB (by `project_id`).
2. Decrypts the bot token using `crypto::decrypt`.
3. Calls `client::post_message`.
4. On any error: logs with `tracing::warn!` and returns — never propagates.

The functions fetch all required display data (names, titles) themselves via DB queries, following the pattern of `outbound::push_issue_to_linear` which calls `fetch_issue` internally.

**`enc_key` guard at call sites:** Call sites hold `Option<SecretString>` from config. Before calling any `notify_*` function, the call site must guard: `let Some(enc_key) = state.config().linear_encryption_key.as_ref() else { return; };` and pass `enc_key.expose_secret()`. If the key is absent, skip the notification silently. The `notify_*` functions themselves receive `enc_key: &str` and do not re-check.

**Spawning pattern:** Each `notify_*` call must be wrapped in `tokio::spawn(...)`, matching the fire-and-forget pattern used for `push_issue_to_linear` at its call sites.

| Function | Signature | Message format |
|----------|-----------|----------------|
| `notify_status_change` | `(pool: &PgPool, http: &Client, enc_key: &str, vk_issue_id: Uuid)` | `[ProjectName] Issue status changed: {title} → {new_status}` |
| `notify_comment_added` | `(pool: &PgPool, http: &Client, enc_key: &str, vk_comment_id: Uuid)` | `[ProjectName] New comment on "{issue_title}" by {author}` |
| `notify_pr_created` | `(pool: &PgPool, http: &Client, enc_key: &str, project_id: Uuid, pr_title: &str, author: &str)` | `[ProjectName] PR opened: "{pr_title}" by {author}` |

For `notify_pr_created`, the PR data is passed directly (not fetched from DB) because the call site already has it in scope. **Call site TBD:** PR events on the remote server appear to be stored via `PullRequestRepository` in `crates/remote/src/db/`. The implementer must identify the mutation point where PRs are created/updated (likely a GitHub App webhook handler or a shape mutation) and wire `notify_pr_created` there. If no suitable call site exists yet, `notify_pr_created` can be scaffolded but left unwired until the PR pipeline is established.

### API routes (`crates/remote/src/routes/slack.rs`)

Exposes a `protected_router()` function (no public routes needed). Merged into `v1_protected` in `routes/mod.rs` alongside the Linear router — this nests the routes under `/v1`, making final URLs `/v1/slack/...`. This matches how `linear::protected_router()` is registered.

| Method | Path (relative, nested under `/v1`) | Body / Params | Description |
|--------|------|---------------|-------------|
| `POST` | `/slack/connect` | `{ project_id, bot_token, channel_id }` | Validate token, encrypt, upsert connection |
| `DELETE` | `/slack/connections/:id` | path param: connection UUID | Remove connection by ID |
| `GET` | `/slack/status?project_id=<uuid>` | query param | Return `{ connected: bool, connection_id: Option<Uuid>, channel_id: Option<String> }` |

**Authorization:** `POST /connect` and `GET /status` must call `ensure_project_access(pool, ctx.user.id, project_id).await?` — the `?` propagates both `403 FORBIDDEN` (not a member) and `404 NOT_FOUND` (project does not exist) as `ErrorResponse`. `DELETE /connections/:id` looks up the connection by ID, resolves its `project_id`, then calls `ensure_project_access` the same way.

**`DELETE` and the encryption key:** `DELETE /connections/:id` does not need to decrypt the bot token (there is no remote Slack webhook to tear down, unlike Linear). It simply deletes the row. No 503 guard is needed for DELETE — it succeeds whether or not the encryption key is configured.

**Missing encryption key:** If `state.config().linear_encryption_key` is `None`, `POST /connect` and `GET /status` must return `503 SERVICE_UNAVAILABLE` before doing any DB work. This matches the guard pattern used in `routes/linear.rs`.

**Token validation:** `POST /connect` calls `client::auth_test(http, &bot_token)` before storing. Slack's `auth.test` endpoint may return HTTP 200 with `"ok": false` on failure — `auth_test` must treat `ok: false` as an error. If validation fails, return HTTP 422 with a message such as `"Invalid Slack bot token"`. Only persist after successful validation.

**Success response for `POST /connect`:** Return `201 Created` with body `{ "connection_id": "<uuid>", "channel_id": "<channel_id>" }`.

### Integration points

- `notify_status_change(pool, http, enc_key, vk_issue_id)` — called from the mutation hook that triggers `push_issue_to_linear` on status updates.
- `notify_comment_added(pool, http, enc_key, vk_comment_id)` — called from the comment creation mutation hook.
- `notify_pr_created(pool, http, enc_key, project_id, pr_title, author)` — called from the PR monitor event handler when a PR is opened.

## Frontend

### New settings panel: `packages/web-core/src/shared/dialogs/settings/settings/slack-integration/`

Two files, following the Linear integration pattern:

- `index.tsx` — state manager: fetches status on mount, decides whether to render the connect or connected panel
- `connect-panel.tsx` — renders both disconnected and connected states inline (simpler than Linear's multi-panel structure since there is no status mapping)

**Transport:** Use `makeLocalApiRequest` (same as the Linear integration panel, e.g. `makeLocalApiRequest('/v1/slack/connect', { method: 'POST', ... })`). This utility proxies through the local app to the remote server and handles auth transparently — it is the correct transport for all `web-core` settings panels that talk to the remote server.

**Disconnected state (`connect-panel.tsx`):**
- Input: Bot Token (password field, `type="password"`)
- Input: Channel ID
- Button: "Connect" — calls `POST /v1/slack/connect`, shows inline error on 422

**Connected state (`connect-panel.tsx`):**
- Shows configured channel ID (read-only)
- Button: "Disconnect" — calls `DELETE /v1/slack/connections/:id` using `connection_id` from the status response

`index.tsx` plugs into the existing project settings dialog alongside the Linear integration section, in `RemoteProjectsSettingsSection.tsx`.

No new shared Rust→TS types required — API payloads are simple JSON not covered by the type generation pipeline.

## Error Handling

- Slack API notification failures are non-critical. All `notify_*` calls are fire-and-forget.
- Failed notification calls log a warning via `tracing::warn!` with the error and project/issue context.
- `POST /connect` returns 422 if the bot token fails Slack's `auth.test`.
- `POST /connect` and `DELETE` return 403 if the user is not a project member.
- Frontend shows inline errors for connect failures; disconnect failures are logged to console.

## Not in scope

- Inbound events from Slack (slash commands, interactive messages).
- Per-event notification toggles.
- Organization-level Slack connections.
- Message threading or rich Block Kit formatting (plain text messages only).

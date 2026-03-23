# Linear Integration Design — 2-Way Issue Sync

**Date:** 2026-03-23  
**Status:** Approved  
**Scope:** Remote server (`crates/remote/`) + shared web (`packages/web-core/`)

---

## Overview

Add a 2-way sync between Vibe Kanban (cloud) issues and Linear issues. Changes in either system propagate to the other in near real-time via webhooks. Linear is the source of truth on conflicts.

**Synced fields:** title, description, status, priority, assignee, labels, due/target dates, comments.

**Auth:** Linear personal API key (stored encrypted server-side).

**Granularity:** Per Vibe Kanban project — each project can be independently linked to one Linear team (optionally filtered to a specific Linear project).

**Initial sync:** On first connection, all existing Linear issues are imported into Vibe Kanban.

---

## Database Schema (Postgres, `crates/remote/`)

### `linear_project_connections`

Links a VK project to a Linear team/project. One row per connected project.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `project_id` | UUID FK → projects | unique |
| `linear_team_id` | TEXT | Linear team ID |
| `linear_project_id` | TEXT NULL | optional — filter to a specific Linear project |
| `encrypted_api_key` | TEXT | AES-256-GCM encrypted |
| `linear_webhook_id` | TEXT NULL | set after webhook registration |
| `linear_webhook_secret` | TEXT NULL | for HMAC verification |
| `sync_enabled` | BOOL | pause/resume sync |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

### `linear_issue_links`

Bidirectional map between VK issues and Linear issues.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `vk_issue_id` | UUID FK → issues | unique |
| `linear_issue_id` | TEXT | Linear's UUID |
| `linear_issue_identifier` | TEXT | e.g. "ENG-123" |
| `last_synced_at` | TIMESTAMPTZ NULL | |
| `created_at` | TIMESTAMPTZ | |

### `linear_status_mappings`

Maps VK project statuses to Linear workflow states for a connection.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `connection_id` | UUID FK → linear_project_connections | |
| `vk_status_id` | UUID FK → project_statuses | |
| `linear_state_id` | TEXT | Linear workflow state ID |
| `linear_state_name` | TEXT | cached display name |

---

## Architecture

### New module: `crates/remote/src/linear/`

- **`client.rs`** — async HTTP client wrapping Linear's GraphQL API
  - `get_issue(id)`, `create_issue(...)`, `update_issue(id, ...)`, `delete_issue(id)`
  - `create_comment(...)`, `update_comment(...)`, `delete_comment(...)`
  - `list_issues(team_id, project_id, cursor)` — paginated for initial import
  - `list_workflow_states(team_id)` — for status mapping setup
  - `register_webhook(team_id, url, secret)` → returns webhook ID
  - `delete_webhook(webhook_id)`
  - `get_viewer()` — used to validate the API key on save
  - Rate limit handling: respects `X-RateLimit-Remaining` headers; backs off if exhausted

- **`webhook.rs`** — incoming Linear webhook handling
  - HMAC-SHA256 signature verification (`Linear-Delivery` + `Linear-Signature` headers)
  - Event deserialization: `IssueCreate`, `IssueUpdate`, `IssueRemove`, `Comment*`
  - Returns `LinearWebhookEvent` enum

- **`sync.rs`** — core sync logic
  - `linear_to_vk(event, conn, db)` — maps Linear fields → VK issue fields, resolves conflicts (Linear wins)
  - `vk_to_linear(issue_id, change, conn, client)` — maps VK issue fields → Linear update payload
  - `map_status_to_linear(vk_status_id, mappings)` → `linear_state_id`
  - `map_status_from_linear(linear_state_id, mappings)` → `vk_status_id`
  - `map_priority_to_linear(priority)` / `map_priority_from_linear(linear_priority)`
  - `initial_import(connection, db, client)` — bulk import all Linear issues into VK; auto-generates status mappings

- **`loop_guard.rs`** — prevents sync loops
  - Short-lived (30s TTL) in-memory set of `(issue_id, source)` pairs currently being synced
  - Before pushing VK→Linear, check if the issue is already being processed from Linear→VK

### New routes: `crates/remote/src/routes/linear.rs`

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/v1/linear/webhook` | Receive Linear webhook events |
| `GET` | `/v1/linear/connections` | List connections for the authenticated org |
| `POST` | `/v1/linear/connections` | Create connection (validates key, fetches teams, registers webhook, starts initial import) |
| `GET` | `/v1/linear/connections/:id` | Get connection details |
| `PATCH` | `/v1/linear/connections/:id` | Update connection (enable/disable sync, update API key) |
| `DELETE` | `/v1/linear/connections/:id` | Remove connection (deregisters Linear webhook, removes links) |
| `GET` | `/v1/linear/connections/:id/status-mappings` | Get status mappings |
| `PUT` | `/v1/linear/connections/:id/status-mappings` | Save status mappings |
| `GET` | `/v1/linear/connections/:id/teams` | Proxy: list Linear teams for the configured API key |
| `POST` | `/v1/linear/connections/:id/sync` | Trigger manual re-import |

### Mutation hook in issues routes

After each successful issue mutation in `crates/remote/src/routes/issues.rs`:

```rust
// In create_issue, update_issue, delete_issue handlers:
tokio::spawn(linear_sync::maybe_push_to_linear(
    state.clone(),
    issue_id,
    change_type,
    request_id,  // for loop guard
));
```

The spawned task checks if there's an active `linear_project_connections` row for the issue's project, verifies the loop guard, then calls the Linear client.

Same pattern for comment mutations.

---

## Data Flow

### VK → Linear (outbound)

1. User creates/updates/deletes a VK issue via REST
2. Issue mutation commits to Postgres
3. Background task fires: checks `linear_issue_links` for the issue
   - **Link exists** → update the Linear issue via GraphQL
   - **No link, connection exists** → create a new Linear issue, store the link
   - **No connection** → no-op
4. Field mapping applied (see Field Mapping section)
5. Loop guard marks this issue as "outbound in flight" for 30s

### Linear → VK (inbound)

1. Linear delivers `POST /v1/linear/webhook`
2. Signature verified (HMAC-SHA256)
3. Connection identified from webhook ID
4. Loop guard checked — if issue is currently processing outbound, skip (Linear wins by natural ordering: last write wins, and we don't re-push what Linear just sent)
5. Look up `linear_issue_links` for the Linear issue ID
   - **Link found** → update the VK issue (all fields, Linear wins)
   - **Not found, event is IssueCreate** → create a new VK issue + link
   - **Not found, other events** → log warning, no-op
6. For `IssueRemove`: set VK issue to "cancelled" state (soft delete)
7. Handler returns HTTP 200 immediately; processing is async

### Initial Import

1. `POST /v1/linear/connections` body: `{ api_key, team_id, project_id? }`
2. Server validates API key via `get_viewer()`
3. Webhook registered with Linear → webhook ID + secret stored
4. Auto-generate status mappings: fetch Linear workflow states, match to VK statuses by name proximity (fuzzy), store in `linear_status_mappings`
5. User redirected to status mapping UI to review/adjust mappings
6. Background job pages through all Linear issues (via `list_issues`), creates VK issues + links in bulk
7. `last_synced_at` updated per link

---

## Field Mapping

| VK Field | Linear Field | Notes |
|---|---|---|
| `title` | `title` | Direct |
| `description` | `description` | Markdown preserved |
| `status_id` | `stateId` | Via `linear_status_mappings` |
| `priority` | `priority` | `Urgent=1, High=2, Medium=3, Low=4, None=0` |
| `target_date` | `dueDate` | ISO date |
| `creator_user_id` | `creatorId` | Matched by email; null if no match |
| Comments | Comments | Full CRUD, author matched by email |
| Labels | Labels | Synced by name; created on Linear side if missing |

**Assignee**: matched by email between VK users and Linear members. If no email match, left blank on VK; existing assignee preserved on Linear.

---

## Error Handling

| Scenario | Handling |
|---|---|
| Invalid API key on save | `get_viewer()` test call; return 422 with message |
| Linear API rate limit | Back off using `Retry-After` / `X-RateLimit-Reset`; queue outbound requests |
| Webhook signature mismatch | Return 401, log warning |
| Missing status mapping | Fall back to first VK status with `type = "todo"` (or lowest sort_order) |
| Assignee email mismatch | Leave assignee null, log at INFO level |
| Linear webhook delivery failure | Linear retries with exponential backoff; VK handler is idempotent |
| VK→Linear push failure | Log error, mark `last_synced_at` as null; surfaced in connection status UI |
| Sync loop | Loop guard (30s TTL in-memory set per connection) prevents re-pushing Linear-originated changes |

---

## Frontend (`packages/web-core/src/`)

New **"Integrations"** tab in project settings:

### Connect Linear Panel

- Text input: "Linear API Key" (masked input, validated on blur)
- After validation: dropdown to select Linear team, optional dropdown for specific Linear project
- "Connect & Import" button → creates connection, triggers initial import
- Progress indicator for initial import

### Status Mapping UI

- Table: VK Status (name + color) ↔ Linear Workflow State (dropdown)
- Auto-populated from initial import; user can adjust
- "Save mappings" button

### Sync Status Panel

- Last synced timestamp
- Count of linked issues
- Any sync errors (expandable list)
- "Sync now" (manual trigger) button
- Toggle to pause/resume sync

### Disconnect

- "Disconnect Linear" button with confirmation
- On confirm: deletes connection, deregisters webhook, removes all `linear_issue_links` (VK issues remain, just unlinked)

---

## Security

- API keys stored encrypted at rest (AES-256-GCM, key from `LINEAR_ENCRYPTION_KEY` env var)
- Webhook signature verified on every inbound request before any DB access
- All Linear routes behind the existing JWT auth middleware (except `POST /v1/linear/webhook` which uses the webhook secret for auth)
- API key never returned in GET responses (return masked version: `lnk_****abcd`)

---

## Environment Variables

New vars added to `crates/remote/`:

```
LINEAR_ENCRYPTION_KEY=<32-byte hex>   # For encrypting stored API keys
```

Optional:
```
LINEAR_SYNC_ENABLED=true              # Feature flag to disable entirely
```

---

## Testing

- Unit tests in `crates/remote/src/linear/` for field mapping, status mapping, loop guard
- Integration test: mock Linear GraphQL server, test full webhook → VK issue update flow
- Migration: standard SQLx migration files in `crates/db/migrations/` (or remote migrations)

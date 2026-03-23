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
| `linear_webhook_secret` | TEXT NULL | stored plain (server-generated, lower blast-radius than API key); not encrypted |
| `sync_enabled` | BOOL | pause/resume sync |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

### `linear_issue_links`

Bidirectional map between VK issues and Linear issues.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `vk_issue_id` | UUID FK → issues | `UNIQUE` |
| `linear_issue_id` | TEXT | Linear's UUID; `UNIQUE` index for inbound lookups |
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

### `linear_label_links`

Maps VK tags to Linear labels to avoid creating duplicates on repeated syncs.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `connection_id` | UUID FK → linear_project_connections | |
| `vk_tag_id` | UUID FK → tags | |
| `linear_label_id` | TEXT | Linear label ID |
| `linear_label_name` | TEXT | cached display name |

### `linear_comment_links`

Maps VK comment IDs to Linear comment IDs, required for update/delete comment sync.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `connection_id` | UUID FK → linear_project_connections | |
| `vk_comment_id` | UUID FK → issue_comments | `UNIQUE` |
| `linear_comment_id` | TEXT | `UNIQUE` per `connection_id` |
| `created_at` | TIMESTAMPTZ | |

### `linear_sync_in_flight`

Distributed loop guard; prevents sync loops in multi-instance deployments.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `connection_id` | UUID FK → linear_project_connections | |
| `issue_id` | UUID | VK issue ID |
| `direction` | TEXT | `'inbound'` or `'outbound'` |
| `expires_at` | TIMESTAMPTZ | TTL: now() + 30s |

Index on `(connection_id, issue_id, direction)`. Expired rows pruned at the start of each sync operation.

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

- **`loop_guard.rs`** — prevents sync loops using the `linear_sync_in_flight` Postgres table
  - **VK→Linear path**: INSERT `(connection_id, issue_id, direction='outbound', expires_at = now() + 30s) ON CONFLICT DO NOTHING`. If 0 rows inserted, another outbound sync is already in flight for this issue — skip. On completion, delete the row.
  - **Linear→VK path (echo prevention)**: before applying the inbound event, check whether a `direction='outbound'` row exists for this issue. If yes, this webhook is an echo of our own VK→Linear push — skip the update.
  - **Linear→VK path (duplicate delivery guard)**: INSERT `(direction='inbound') ON CONFLICT DO NOTHING`. If 0 rows inserted, this exact event is already being processed (duplicate delivery) — skip.
  - `DELETE WHERE expires_at < now()` runs at the start of each operation to keep the table small

### New routes: `crates/remote/src/routes/linear.rs`

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/v1/linear/webhook` | Receive Linear webhook events |
| `GET` | `/v1/linear/connections` | List connections for the authenticated org (filtered via `projects → organization_members` join using the JWT's `user_id`) |
| `POST` | `/v1/linear/connections` | Create connection (validates key, fetches teams, registers webhook, starts initial import) |
| `GET` | `/v1/linear/connections/:id` | Get connection details |
| `PATCH` | `/v1/linear/connections/:id` | Update connection (enable/disable sync, update API key) |
| `DELETE` | `/v1/linear/connections/:id` | Remove connection (deregisters Linear webhook, removes links) |
| `GET` | `/v1/linear/connections/:id/status-mappings` | Get status mappings |
| `PUT` | `/v1/linear/connections/:id/status-mappings` | Save status mappings |
| `GET` | `/v1/linear/connections/:id/teams` | Proxy: list Linear teams for the configured API key |
| `POST` | `/v1/linear/connections/:id/sync` | Trigger manual re-import |

### Mutation hook in issues routes

After each successful issue mutation in `crates/remote/src/routes/issues.rs`, hook into `create_issue`, `update_issue`, `delete_issue`, **and `bulk_update_issues`**:

```rust
tokio::spawn(linear_sync::maybe_push_to_linear(
    state.clone(),
    issue_id,
    change_type,
    request_id,  // for loop guard
));
```

For `bulk_update_issues`, spawn one task per affected issue.

The spawned task checks if there's an active `linear_project_connections` row for the issue's project, verifies the loop guard via `linear_sync_in_flight`, then calls the Linear client.

Same pattern for comment mutations and `issue_assignees` mutations.

---

## Data Flow

### VK → Linear (outbound)

1. User creates/updates/deletes a VK issue via REST
2. Issue mutation commits to Postgres
3. Background task fires: checks whether a `linear_project_connections` row exists for the issue's project; if none, no-op
4. Loop guard: INSERT `(issue_id, direction='outbound')` into `linear_sync_in_flight ON CONFLICT DO NOTHING`. If 0 rows inserted, an outbound sync for this issue is already in flight — skip. Delete the row on completion.
5. Checks `linear_issue_links` for the issue:
   - **Link exists** → update the Linear issue via GraphQL with mapped fields
   - **No link** → create a new Linear issue, store the link in `linear_issue_links`
6. Field mapping applied (see Field Mapping section)

### Linear → VK (inbound)

1. Linear delivers `POST /v1/linear/webhook`
2. Parse the webhook ID from the request body (or a path/query param set during webhook registration)
3. Look up `linear_webhook_secret` from `linear_project_connections` by webhook ID — this one DB read is required before signature verification because the secret is needed to verify
4. Verify HMAC-SHA256 signature using the retrieved secret; return 401 if mismatch. No further DB writes or processing happen if verification fails
5. Connection is now identified (the row fetched in step 3); handler returns HTTP 200 immediately and continues processing asynchronously
6. Loop guard check: attempt `INSERT INTO linear_sync_in_flight (connection_id, issue_id, direction='inbound', ...) ON CONFLICT DO NOTHING`. If 0 rows inserted, an inbound event for this issue is already processing — skip (idempotent delivery guard). Also check for an existing `'outbound'` row: if found, this event is an echo of our own VK→Linear push — skip (loop break)
7. Look up `linear_issue_links` for the Linear issue ID
   - **Link found** → update the VK issue (all fields, Linear wins)
   - **Not found, event is IssueCreate** → create a new VK issue + link
   - **Not found, other events** → log warning, no-op
8. For `IssueRemove`: hard-delete the VK issue via the existing `IssueRepository::delete` path (same as a user-initiated delete). The `linear_issue_links` row is cascade-deleted. This mirrors Linear's behavior — if an issue is deleted in Linear, it is removed from VK. If preserving data is later required, this can be revisited by adding a `deleted_at` column, but no soft-delete mechanism exists today.
9. Delete the `linear_sync_in_flight` row on completion

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
| Labels (`issue_tags` join table) | Labels | Via `linear_label_links`; created on Linear if missing |
| Assignees (`issue_assignees` join table) | `assigneeId` (single) | See below |

**Assignee mapping:** VK supports multiple assignees (`issue_assignees` many-to-many join table); Linear supports one. Rules:
- **VK → Linear**: send the first assignee (lowest `created_at` in `issue_assignees`); if none, send null
- **Linear → VK**: clear all rows in `issue_assignees` for this issue, then insert one row for the matched VK user. Matched by email. If no email match, leave `issue_assignees` unchanged
- Mutations to `issue_assignees` also trigger the VK→Linear sync hook (send updated first-assignee to Linear)

**Label mapping:** Tags are synced via `linear_label_links`.
- **VK → Linear**: for each VK tag on the issue, look up the `linear_label_id` from `linear_label_links`; if no link exists, create the label in Linear then store the link
- **Linear → VK**: for each Linear label ID, look up the VK tag from `linear_label_links`; if no link, create the tag in VK then store the link

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
| Sync loop | Loop guard via `linear_sync_in_flight` Postgres table (TTL 30s, INSERT ON CONFLICT DO NOTHING; skip if 0 rows inserted) prevents re-pushing Linear-originated changes across all server instances |

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

- API keys stored encrypted at rest (AES-256-GCM, key from `VIBEKANBAN_REMOTE_LINEAR_ENCRYPTION_KEY` env var)
- Webhook signature verified before any DB writes or further processing; one DB read (fetch the webhook secret by webhook ID) is required prior to verification and is the only pre-verification DB access
- All Linear routes behind the existing JWT auth middleware (except `POST /v1/linear/webhook` which uses the webhook secret for auth)
- API key never returned in GET responses (return masked version: `lnk_****abcd`)

---

## Environment Variables

New vars added to `crates/remote/` following the `VIBEKANBAN_REMOTE_*` naming convention:

```
VIBEKANBAN_REMOTE_LINEAR_ENCRYPTION_KEY=<32-byte hex>   # For encrypting stored API keys
```

Optional:
```
VIBEKANBAN_REMOTE_LINEAR_SYNC_ENABLED=true              # Feature flag to disable entirely
```

---

## Migrations

All new tables go in `crates/remote/migrations/` (the remote Postgres migration path). Do **not** use `crates/db/migrations/` which is for the local SQLite desktop app only.

Tables to create:
1. `linear_project_connections`
2. `linear_issue_links` — add index on `linear_issue_id` (for inbound webhook lookups); enforce unique constraint on `linear_issue_id` to prevent one Linear issue mapping to two VK issues
3. `linear_status_mappings` — add `UNIQUE (connection_id, vk_status_id)`; use `INSERT ... ON CONFLICT DO NOTHING` / upsert on initial import to avoid duplicates
4. `linear_label_links` — add `UNIQUE (connection_id, vk_tag_id)`; same upsert strategy
5. `linear_comment_links` — add `UNIQUE (vk_comment_id)` and `UNIQUE (connection_id, linear_comment_id)`
6. `linear_sync_in_flight` — add `UNIQUE (connection_id, issue_id, direction)`; INSERT uses `ON CONFLICT DO NOTHING`, and if 0 rows inserted the sync is skipped (loop detected)

**ElectricSQL electrification:** `linear_project_connections` must call `electric_sync_table('linear_project_connections')` in its migration (as per `crates/remote/AGENTS.md`) so the frontend sync status panel receives real-time updates. The other tables are server-side only and do not need to be electrified.

## Testing

- Unit tests in `crates/remote/src/linear/` for field mapping, status mapping, loop guard
- Integration test: mock Linear GraphQL server, test full webhook → VK issue update flow

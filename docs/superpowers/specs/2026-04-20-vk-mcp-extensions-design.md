# VK MCP Extensions — Master Design

**Status:** Draft v1 (awaiting user review)
**Date:** 2026-04-20
**Author:** Claude (with t01094717190@gmail.com)
**Predecessor:** PR #merged `0095e565` "MCP error transparency" (PR1 — extended `ApiResponseEnvelope` with `error_kind` + classifier)

---

## 1. Background

The Vibe Kanban MCP server (`crates/mcp/`) exposes coding-agent orchestration to MCP clients (Claude Code, Cursor, custom orchestrators). The current surface has four classes of friction observed in production usage:

1. **Opaque executor failures.** When an agent process fails to spawn (missing binary, auth required, permission policy mismatch), the MCP returns a generic 500 with no machine-readable cause. PR1 plumbed `error_kind` *through* the MCP layer, but the server still buckets all `ExecutorError` variants as `ErrorInfo::internal("ExecutorError")` (`crates/server/src/error.rs:498`). Clients have nothing to switch on.
2. **Missing tools.** Project-level tag CRUD (`create_tag` / `delete_tag`) and a session-phase aggregate (`get_session_status`) exist on the server but are not exposed via MCP. Orchestrators have to either reach into the HTTP API directly (defeating the abstraction) or poll `get_execution` and re-derive state.
3. **An orphan window in `start_workspace`.** The MCP `start_workspace` tool (`crates/mcp/src/task_server/tools/task_attempts.rs:95`) calls the atomic `/api/workspaces/start` endpoint (good) but then performs a *separate* `link_workspace_to_issue` HTTP call (`task_attempts.rs:210-216`). If the link call fails, the workspace already exists and is unowned by the issue.
4. **Concurrent fan-out and lifecycle observation.** Spawning N workspaces requires N round-trips. Long-running sessions can only be observed via polling.

This spec covers four sub-projects (**S1–S4**) addressing items 1–4 respectively. A fifth concern — MCP transport stability (heartbeat / reconnect / parent-PID watch) — is **deferred** pending a concrete symptom report from the user (see §10).

## 2. Scope

### In scope
- Server-side: extend `ApiResponse` with `error_kind`; expand `ApiError::Executor(_)` mapping per variant; capture last 2 KiB of executor stderr into response `error_data`.
- Server-side: tighten `/api/workspaces/start` so issue linking happens inside the same handler (transactional with workspace creation).
- MCP-side: new tools `create_tag`, `delete_tag`, `get_session_status`, `batch_start`, `subscribe_session_events`.
- Type sharing: regenerate `shared/types.ts` so TS clients can switch on `ErrorKind`.

### Out of scope
- MCP transport stability / heartbeat / parent-PID watch (S5 — deferred).
- Server-side push to external webhooks. (Replaced by orchestrator-pull SSE subscription.)
- Authentication / authorization changes.
- Frontend (`packages/local-web`, `packages/remote-web`) UI changes. The TS types regenerate, but no React component is touched.
- Remote (`crates/remote`) crate changes — local-deployment only for this campaign.

## 3. Sub-project overview & dependency order

```
S1 (server error transparency)
   ↓ [error_kind / error_data shape used by]
S2 (create_tag, delete_tag, get_session_status)        — independent of S3
   ↓
S3 (start_workspace atomicity fix)                     — independent of S2
   ↓
S4a (batch_start)         depends on S1 + S3
S4b (SSE subscription)    depends on S1
```

**PR sequence:** PR1 (S1) → PR2 (S2 tags) → PR3 (S2 status) → PR4 (S3) → PR5 (S4a) → PR6 (S4b).
S2 and S3 could run in parallel branches if convenient, but S2-status assumes S1's `error_kind` is in the envelope, so PR3 must follow PR1.

---

## 4. S1 — Server error transparency

### 4.1 Problem

`ApiError::Executor(_)` collapses every `ExecutorError` variant to a single 500 with body `{"success": false, "message": "An internal error occurred. Please try again.", "error_data": null}`. Clients cannot distinguish "missing binary" from "auth required" from "JSON parse failure".

PR1 added `error_kind` to `ApiResponseEnvelope` *on the MCP-deserialize side* but the server never sets it. The server's `ApiResponse<T,E>` (`crates/utils/src/response.rs:5`) still has only `{success, data, error_data, message}`.

### 4.2 Design

**Server changes (`crates/utils/src/response.rs`):**

```rust
#[derive(Debug, Serialize, Deserialize, TS)]
pub struct ApiResponse<T, E = T> {
    success: bool,
    data: Option<T>,
    error_data: Option<E>,
    message: Option<String>,
    /// Stable machine-readable error code. Set by `ApiError::IntoResponse`.
    /// Always `None` on success.
    #[serde(skip_serializing_if = "Option::is_none", default)]
    error_kind: Option<String>,
}

impl<T, E> ApiResponse<T, E> {
    pub fn error_with_kind(message: &str, kind: &'static str) -> Self { ... }
    pub fn error_full(message: &str, kind: &'static str, data: E) -> Self { ... }
}
```

**Server changes (`crates/server/src/error.rs`):**

`ErrorInfo` gains an `error_kind: &'static str` field (separate from the existing `error_type`, which stays for tracing). The collapsed line 498 expands:

```rust
ApiError::Executor(executor_err) => match executor_err {
    ExecutorError::ExecutableNotFound { .. } => ErrorInfo {
        status: StatusCode::FAILED_DEPENDENCY,           // 424
        error_type: "ExecutorError",
        error_kind: "executor_not_found",
        message: Some(executor_err.to_string()),
    },
    ExecutorError::AuthRequired(_) => ErrorInfo {
        status: StatusCode::UNAUTHORIZED,                // 401
        error_kind: "executor_auth_required",
        ...
    },
    ExecutorError::FollowUpNotSupported(_) => ErrorInfo {
        status: StatusCode::CONFLICT,                    // 409
        error_kind: "executor_followup_unsupported",
        ...
    },
    ExecutorError::SpawnError(_) | ExecutorError::Io(_) => ErrorInfo {
        status: StatusCode::INTERNAL_SERVER_ERROR,
        error_kind: "executor_spawn_failed",
        ...
    },
    ExecutorError::Json(_) | ExecutorError::TomlSerialize(_) | ExecutorError::TomlDeserialize(_) => ErrorInfo {
        status: StatusCode::INTERNAL_SERVER_ERROR,
        error_kind: "executor_serde_error",
        ...
    },
    ExecutorError::CommandBuild(_) => ErrorInfo {
        status: StatusCode::BAD_REQUEST,                 // 400
        error_kind: "executor_command_build_failed",
        ...
    },
    ExecutorError::SetupHelperNotSupported => ErrorInfo {
        status: StatusCode::CONFLICT,
        error_kind: "executor_setup_helper_unsupported",
        ...
    },
    ExecutorError::ExecutorApprovalError(_) => ErrorInfo {
        status: StatusCode::CONFLICT,
        error_kind: "executor_approval_required",
        ...
    },
    ExecutorError::UnknownExecutorType(_) => ErrorInfo {
        status: StatusCode::BAD_REQUEST,
        error_kind: "executor_unknown_type",
        ...
    },
},
```

**Stderr tail capture for `start_execution` failures:**

`ContainerService::start_execution` (`crates/services/src/services/container.rs:1133`) currently writes failures to `MsgStore` via `LogMsg::Stderr` (line 1260) but the route handler never sees it. We add a side channel: when `start_workspace` / `follow_up` route handlers catch a `ContainerError::ExecutorError`, they construct `error_data` containing the last 2 KiB of stderr if available.

```rust
// New helper in crates/services/src/services/container.rs
pub struct ExecutorFailureContext {
    pub error: ExecutorError,
    pub stderr_tail: Option<String>,        // ≤ 2048 bytes UTF-8
    pub program: Option<String>,
}
```

The route handler maps this via the existing `ApiError::Executor` variant, extended to carry optional context (see D2):

```rust
// crates/server/src/error.rs
ApiError::Executor { source: ExecutorError, context: Option<ExecutorFailureContext> }
```

Existing `#[from] ExecutorError` impl is replaced by an explicit constructor (`ApiError::executor(source)` for the no-context case) to avoid a breaking change at every call site; the `?` operator is preserved via a custom `From<ExecutorError>` that sets `context: None`.

`error_data` payload:

```json
{
  "stderr_tail": "<last ≤2048 bytes>",
  "program": "claude"
}
```

### 4.3 `error_kind` canonical taxonomy (initial)

| `error_kind`                          | HTTP | Source                                          | Retry safe? |
|---------------------------------------|------|-------------------------------------------------|-------------|
| `executor_not_found`                  | 424  | `ExecutorError::ExecutableNotFound`             | no          |
| `executor_auth_required`              | 401  | `ExecutorError::AuthRequired`                   | no          |
| `executor_followup_unsupported`       | 409  | `ExecutorError::FollowUpNotSupported`           | no          |
| `executor_spawn_failed`               | 500  | `ExecutorError::{SpawnError,Io}`                | yes         |
| `executor_serde_error`                | 500  | `ExecutorError::{Json,TomlSerialize,TomlDeserialize}` | no    |
| `executor_command_build_failed`       | 400  | `ExecutorError::CommandBuild`                   | no          |
| `executor_setup_helper_unsupported`   | 409  | `ExecutorError::SetupHelperNotSupported`        | no          |
| `executor_approval_required`          | 409  | `ExecutorError::ExecutorApprovalError`          | no          |
| `executor_unknown_type`               | 400  | `ExecutorError::UnknownExecutorType`            | no          |
| `workspace_partial_creation`          | 409  | `WorkspaceManagerError::PartialCreation`        | depends     |
| `workspace_not_found`                 | 404  | `WorkspaceError::WorkspaceNotFound`             | no          |
| `session_busy`                        | 409  | (new) follow-up while prior execution Running   | yes (after) |
| `internal`                            | 500  | catch-all                                       | yes         |

Retry-safety is **descriptive**, not enforced server-side. MCP clients can use it for backoff.

### 4.4 Decisions

- **D1 — `error_kind` field type:** `Option<String>` not enum on the wire. Server enum lives in `error.rs`; clients get strings. Trade-off: forward-compatible for new variants, no breaking schema changes when adding kinds. Alternative considered: `ts-rs` enum — rejected because adding a variant becomes a breaking client change.
- **D2 — `ApiError::Executor` extension:** extend the existing variant to carry an optional `ExecutorFailureContext`, rather than introducing a parallel `ApiError::ExecutorWithContext`. Less code churn at call sites; default `None` for callers that don't have stderr.
- **D3 — Stderr tail size:** 2 KiB (2048 bytes), UTF-8 truncated with `…` prefix on left if cut. Same convention as MCP `body_tail` from PR1.
- **D4 — `error_kind` for already-typed errors:** existing 200+ `ErrorInfo` constructions in `error.rs` get `error_kind` set to the same string as `error_type` for now (e.g. `"WorkspaceError"`). PR1 lands focused on `ExecutorError` plus the taxonomy in §4.3. Other variants can be tightened in follow-up if needed; no breaking client change since clients fall back to `message`.

### 4.5 PR boundary (PR1)

- `crates/utils/src/response.rs` — `error_kind` field + helpers
- `crates/server/src/error.rs` — `ErrorInfo.error_kind`, expanded `ApiError::Executor` arm, all existing arms get `error_kind = error_type`
- `crates/services/src/services/container.rs` — `ExecutorFailureContext`, capture stderr tail in `start_execution`
- `crates/server/src/routes/sessions/mod.rs` — `follow_up` handler propagates context
- `crates/server/src/routes/workspaces/create.rs` — `create_and_start_workspace` handler propagates context
- `shared/types.ts` regen via `pnpm run generate-types`
- Tests:
  - Unit: `ApiResponse::error_full` round-trips `error_kind` + `error_data`
  - Unit: each `ExecutorError` variant maps to its expected `error_kind`
  - Integration: simulate `ExecutableNotFound` via `ContainerService` mock → 424 + `executor_not_found` + stderr tail in response

---

## 5. S2 — MCP tool补全 (tags + session status)

### 5.1 S2a: `create_tag` / `delete_tag`

**Server endpoints** (already exist, no server change):
- `POST /api/tags` body `CreateTag { tag_name }` → `Tag`
- `DELETE /api/tags/{id}` → `()`

**MCP tools** (new file `crates/mcp/src/task_server/tools/tags.rs`):

```rust
#[tool(description = "Create a project-level tag.")]
async fn create_tag(
    &self,
    Parameters(CreateTagRequest { tag_name }): Parameters<CreateTagRequest>,
) -> Result<CallToolResult, ErrorData> { ... }

#[tool(description = "Delete a project-level tag by ID. Use `list_tags` to look up the ID from a name.")]
async fn delete_tag(
    &self,
    Parameters(DeleteTagRequest { tag_id }): Parameters<DeleteTagRequest>,
) -> Result<CallToolResult, ErrorData> { ... }
```

**D5 — `delete_tag` lookup mode:** accept `tag_id: Uuid` only. Name lookup is convenience but introduces ambiguity (two tags can share a name across projects? — checked: no, unique). Decision: ID only for v1; client can call `list_tags` first if they have a name. Name-based deletion deferred to PR-follow-up only if a real consumer needs it.

### 5.2 S2b: `get_session_status` phase machine

**Problem:** `ExecutionProcessStatus` is `Running | Completed | Failed | Killed` (`crates/db/src/models/execution_process.rs:43`). Orchestrators want a higher-level lifecycle: is the agent still spawning? is it stuck? did it finish cleanly?

**Phase machine output:**

```rust
#[derive(Serialize, schemars::JsonSchema)]
struct GetSessionStatusResponse {
    session_id: String,
    phase: SessionPhase,
    last_activity_at: Option<String>,         // RFC3339
    current_execution_id: Option<String>,
    last_finished_execution_id: Option<String>,
    error_kind: Option<String>,               // when phase == Errored
    error_message: Option<String>,
}

#[derive(Serialize, schemars::JsonSchema)]
#[serde(rename_all = "snake_case")]
enum SessionPhase {
    Idle,        // session exists, no executions yet OR last execution finished cleanly
    Starting,    // most recent execution is Running and < 10 s old (no log yet)
    Running,     // most recent execution is Running and has produced log activity
    Stalled,     // Running, but no log activity for ≥ 5 min
    Done,        // most recent execution status == Completed
    Errored,     // most recent execution status ∈ {Failed, Killed}
}
```

**Derivation rules:**
- Fetch session via existing `GET /api/sessions/{id}`.
- Fetch most-recent `ExecutionProcess` for the session. The DB layer has `ExecutionProcess::find_by_session_id` (`crates/db/src/models/execution_process.rs:222`) which returns rows ordered by creation; in PR3 we add a thin server route `GET /api/sessions/{id}/latest-execution` that returns just the latest row (avoids client-side ordering and avoids loading all rows for chatty sessions).
- If no execution: `Idle`.
- If status `Completed`: `Done`.
- If status `Failed` or `Killed`: `Errored`; populate `error_kind` from the execution's stored exit reason if available; else `"executor_exit_nonzero"`; `error_message` from the last stderr line.
- If status `Running`:
  - Compute `idle = now - execution.updated_at`. If `idle < 10s`: `Starting` (just kicked off, nothing committed yet). If `idle ≥ 5 min`: `Stalled`. Else: `Running`.

**D6 — Stalled threshold:** 5 minutes. Rationale: a Claude Code "thinking" gap can legitimately reach a few minutes; coding agents rarely exceed this without producing tool-use output. Threshold is an MCP-side constant, easily tuned.

**D7 — Source of "last activity":** use `ExecutionProcess.updated_at` from the latest-execution row. The container service updates this row when status transitions (start, log batches checkpoint, finish). Coarser than per-log-line timestamps but requires zero new state and one HTTP call. Per-log-line precision is a v2 concern; if a user reports false-negative `Stalled` (e.g. agent producing logs but DB row not advancing), revisit with a `MsgStore.last_activity_at` accessor.

### 5.3 PR boundary

- **PR2 (S2a — tags):** `crates/mcp/src/task_server/tools/tags.rs` (new), wire into `task_server/mod.rs`. Pure MCP wiring. Expected diff < 200 LOC including tests.
- **PR3 (S2b — status):**
  - Server: new endpoint `GET /api/sessions/{id}/last-activity` (small handler, reuses MsgStore)
  - MCP: new tool `get_session_status` with phase derivation + unit tests for each phase transition (table-driven test, fake `now`)
  - Expected diff < 400 LOC

---

## 6. S3 — `start_workspace` atomicity fix

### 6.1 Problem

Current MCP flow (`crates/mcp/src/task_server/tools/task_attempts.rs:179-216`):

```
POST /api/workspaces/start  → workspace created + execution started  ✓
if let Some(issue_id) ... self.link_workspace_to_issue(...)          ← can fail
```

If `link_workspace_to_issue` fails (network blip, remote auth expired, issue deleted between resolve and link), the workspace exists but isn't linked. The MCP tool returns an error to the client; client retries → creates a *second* workspace. Orphan accumulation.

### 6.2 Options

| Option | Where the fix lives | Pros | Cons |
|--------|---------------------|------|------|
| A | MCP-side compensation: on link failure, `DELETE /api/workspaces/{id}` | No server change | Compensation can itself fail; not transactional; deletion is destructive of any partial work |
| B | Server-side: move issue-linking into `create_and_start_workspace` handler so it's part of the same request | Truly atomic in one handler; no compensation needed | Need to know issue context server-side at request time |
| **C (recommended)** | Server-side: extend `CreateAndStartWorkspaceRequest` with `link_to_issue: Option<{remote_project_id, issue_id}>` (which already exists as `linked_issue` field! verified in `create.rs:293`); have the handler perform the link inside the same DB transaction | Reuses existing field; one HTTP call; rollback on failure; no MCP-side compensation logic | Changes server semantics: link failure now fails workspace creation (intended — that's the point) |

### 6.3 Recommendation: Option C

Verified server-side state:
- `CreateAndStartWorkspaceRequest.linked_issue: Option<LinkedIssueInfo>` exists (`crates/db/src/models/requests.rs:35`).
- The server handler currently uses `linked_issue` *only* to import issue attachments (`crates/server/src/routes/workspaces/create.rs:347-387`). It does **not** create the workspace↔issue link record.
- The link record is created by a separate POST to `/api/workspaces/{id}/links`, which the MCP calls *after* `/api/workspaces/start` returns (`crates/mcp/src/task_server/tools/mod.rs:471-486`). This is the orphan window.

PR4 closes the loop:

1. Server `create_and_start_workspace` handler: when `linked_issue` is `Some(...)`, also call the existing link-creation logic from `routes/workspaces/links` (extract its DB-insert helper into `services::workspace_links::create_link`) *before returning success*. The whole creation runs inside one DB transaction; on failure the workspace insert rolls back and the worktree is cleaned up via `ManagedWorkspace::delete()` in the error path.
2. MCP `start_workspace` tool: stop calling `link_workspace_to_issue` separately; rely on server.
3. Keep the standalone `link_workspace_issue` MCP tool (`task_attempts.rs:228`) for the after-the-fact use case.

**D8 — Rollback mechanism on link failure:** server uses an explicit DB transaction wrapping {workspace insert, repo attaches, link insert}. The actual `start_execution` (which spawns processes) happens *after* the transaction commits, so if the link fails we never spawned anything. Worktree cleanup is the only side effect to undo, and it's handled by the existing `ManagedWorkspace::delete()` path on commit failure.

### 6.4 PR boundary (PR4)

- `crates/services/src/services/workspace_links.rs` — extract link-creation DB helper from `crates/server/src/routes/workspaces/links.rs` (or wherever `POST /links` currently lives) so both the standalone route and `create_and_start_workspace` can call it without duplicating SQL
- `crates/server/src/routes/workspaces/create.rs` — wrap workspace + repos + link in one DB transaction (`pool.begin()` → operate via `&mut tx` → `tx.commit()`); on any error, return early so the tx is dropped (rolled back); worktree cleanup runs in the error branch via the existing `ManagedWorkspace::delete()` path
- `crates/server/src/routes/workspaces/links.rs` — refactored to use the new shared helper (no behavior change for standalone link)
- `crates/mcp/src/task_server/tools/task_attempts.rs` — drop the post-call link (lines 209-216) since the server now does it
- Integration test: simulate link failure (e.g. invalid `project_id`) → verify no orphan workspace row remains
- Expected diff ~300 LOC

---

## 7. S4 — Concurrency & lifecycle

### 7.1 S4a: `batch_start`

**Goal:** spawn N workspaces in one MCP call.

**API:**

```rust
struct BatchStartRequest {
    items: Vec<StartWorkspaceRequest>,   // reuse single-item type from task_attempts.rs
    /// "all_or_nothing" → first failure aborts and rolls back successful workspaces.
    /// "best_effort"    → return per-item Result; partial success allowed.
    mode: BatchMode,                     // default: "best_effort"
    max_parallelism: Option<usize>,      // default: 4
}

struct BatchStartResponse {
    items: Vec<BatchStartItemResult>,
}

#[serde(tag = "status")]
enum BatchStartItemResult {
    Ok { workspace_id: String, execution_id: String },
    Err {
        index: usize,
        error_kind: String,
        message: String,
        retry_safe: bool,
    },
}
```

**D9 — Default mode:** `best_effort`. Rationale: `all_or_nothing` requires server-side rollback of arbitrary side effects (worktrees, git branches, possibly issue links); the cost of getting that right outweighs the value for most batch workloads. Clients that want strict semantics can iterate sequentially or implement their own rollback.

**D10 — Parallelism:** default 4, capped at 8. Coding-agent spawns are CPU-light but worktree-create is I/O-heavy; 4 keeps disk thrash bounded on typical dev hardware.

**Implementation:** MCP-side fan-out using `futures::stream::FuturesUnordered` over the existing single-item path (which after S3 = single HTTP call). No server change.

### 7.2 S4b: SSE subscription helper

**Goal:** orchestrator subscribes to a session's lifecycle events without polling. Replaces "webhook to orchestrator" — pull beats push for this topology.

**MCP tool:**

```rust
#[tool(description = "Stream lifecycle events for a session until it terminates or `timeout_secs` elapses.")]
async fn subscribe_session_events(
    &self,
    Parameters(SubscribeSessionEventsRequest {
        session_id,
        timeout_secs,         // default 600, max 3600
        include_log_lines,    // default false; if true, emit each stderr/stdout line
    }): Parameters<...>,
) -> Result<CallToolResult, ErrorData>
```

**Returns:** a single-shot `CallToolResult` containing a JSON array of events captured during the call. Per MCP semantics, tools don't stream — the call blocks until terminal event or timeout, then returns the accumulated events.

**Event shape:**

```json
{
  "ts": "2026-04-20T10:30:00Z",
  "type": "phase_change" | "log_line" | "execution_started" | "execution_finished" | "timeout",
  "phase": "running",                              // for phase_change
  "execution_id": "...",                           // for execution_*
  "level": "stderr",                               // for log_line
  "text": "...",                                   // for log_line (truncated to 1KiB)
  "error_kind": "executor_not_found"               // for execution_finished if errored
}
```

**Implementation:** subscribe to existing SSE `/api/events` server stream, filter to `session_id`, accumulate, return on terminal phase (Done / Errored) or `timeout_secs`.

**D11 — Why blocking single-shot vs streaming-tool:** rmcp 1.2 `tool` macro returns `CallToolResult` synchronously; true streaming requires raw protocol calls. Blocking-with-timeout is the pragmatic minimum for v1.

### 7.3 PR boundary

- **PR5 (S4a):** `crates/mcp/src/task_server/tools/batch.rs` (new). Pure MCP-side. ~250 LOC including table-driven tests.
- **PR6 (S4b):** `crates/mcp/src/task_server/tools/subscribe.rs` (new). Reuses MCP's existing reqwest client; needs `reqwest` SSE support — check feature flag in PR; if absent, add `reqwest-eventsource` as a dep. ~400 LOC.

---

## 8. Cross-cutting concerns

### 8.1 Type sharing
All new request/response types use `#[derive(Serialize, Deserialize, schemars::JsonSchema)]` for MCP, and where they cross the FFI boundary into TS, also `ts_rs::TS`. `pnpm run generate-types` runs at the end of each PR.

### 8.2 Testing
- Server-side: unit tests in `error.rs` for taxonomy mapping; integration test in `crates/server/tests/` for end-to-end stderr capture.
- MCP-side: unit tests next to each tool file. Phase machine, batch fan-out, and SSE subscription each get table-driven tests with a faked HTTP client (existing pattern in `tools/mod.rs::tests::response_classification`).
- No new e2e harness — existing `pnpm run dev` + manual smoke test for each PR.

### 8.3 Backward compatibility
- `error_kind` is `#[serde(skip_serializing_if = "Option::is_none")]` → existing clients that don't know about it see no change.
- All new MCP tools are additive. Existing tools' contracts unchanged.
- S3 changes the *behavior* of `/api/workspaces/start` when `linked_issue` is set: link failure now fails the request. Clients that rely on the old "workspace created even if link failed" behavior will see a regression — but that behavior was the bug.

### 8.4 Push gate compliance
Per user policy: read-only by default; show diff before commit; **wait for explicit authorization before push**. Each PR pauses at `git push` for sign-off.

## 9. Out of scope: S5 (deferred)

S5 — MCP transport stability — was originally framed as "10s heartbeat + 3-attempt reconnect backoff + disconnect events". On inspection:

- `rmcp` 1.2 stdio transport already includes protocol-level keepalive.
- The actual production symptom (what is failing? when? in which client?) was not specified.
- "Heartbeat" / "reconnect" are *solutions*, not *problems*. Without a symptom we'd be designing speculative infrastructure.

**Defer until** the user describes one of:
- MCP client (Claude Code / Cursor) reports the server died — under what trigger?
- Backend died but MCP didn't notice — what observable failure mode?
- MCP process became orphaned (parent died) and consumed resources — verified leak?
- Other concrete symptom?

Once described, S5 gets its own mini-spec.

## 10. Decision log

| ID | Decision | Alternatives | Status |
|----|----------|--------------|--------|
| D1 | `error_kind` is `Option<String>` on the wire | TS-RS enum | Accepted |
| D2 | Extend `ApiError::Executor` rather than add `ExecutorWithContext` | Parallel variant | Accepted |
| D3 | Stderr tail size: 2 KiB | 4 KiB / 1 KiB | Accepted |
| D4 | `error_kind` defaults to `error_type` for non-executor variants | Tighten all 200+ at once | Accepted (incremental) |
| D5 | `delete_tag` accepts ID only | Name lookup | Accepted (v1) |
| D6 | `Stalled` threshold: 5 min | 1 min / 10 min | Accepted (constant, tunable) |
| D7 | Last-activity proxied from `ExecutionProcess.updated_at` (no new endpoint, one new `/latest-execution` route) | Per-log-line via MsgStore endpoint; SSE replay | Accepted (v1) |
| D8 | S3 rollback uses DB transaction wrapping creation + link | MCP compensation; deferred link | Accepted |
| D9 | `batch_start` default mode: `best_effort` | `all_or_nothing` | Accepted |
| D10 | `batch_start` default parallelism: 4 (cap 8) | unbounded | Accepted |
| D11 | `subscribe_session_events` is blocking-single-shot | true streaming | Accepted (v1) |

## 11. Items most likely to draw a flip request

All D-numbers in §10 are owner-callable; these are the ones where I'd most expect the user to push back, listed for explicit acknowledgement:

- **D5** — `delete_tag` ID-only. If you want `delete_tag_by_name`, say so and I'll add it as a sibling tool.
- **D6** — `Stalled` threshold of 5 min. If your agents are typically slow (large diffs / long planning), this needs to go up; if they should produce continuous output, lower.
- **D9** — `batch_start` default `best_effort`. If you want strict `all_or_nothing` rollback, that's a meaningfully bigger PR (server-side compensation across N workspaces).
- **D11** — `subscribe_session_events` is blocking-single-shot, not true streaming. If you actually need streaming-per-event delivery to the MCP client, that requires lower-level rmcp protocol work.

If none of these need flipping, ack the spec and we go straight to writing-plans.

---

## Appendix A: Files touched (per PR)

| PR | Files |
|----|-------|
| 1 (S1) | `crates/utils/src/response.rs`, `crates/server/src/error.rs`, `crates/services/src/services/container.rs`, `crates/server/src/routes/sessions/mod.rs`, `crates/server/src/routes/workspaces/create.rs`, `shared/types.ts` (regen) |
| 2 (S2a tags) | `crates/mcp/src/task_server/tools/tags.rs` (new), `crates/mcp/src/task_server/mod.rs` |
| 3 (S2b status) | `crates/server/src/routes/sessions/mod.rs` (new `/latest-execution` route), `crates/mcp/src/task_server/tools/sessions.rs` (extend with `get_session_status`), `shared/types.ts` (regen) |
| 4 (S3 atomicity) | `crates/server/src/routes/workspaces/create.rs`, `crates/services/src/services/...` (link helper), `crates/mcp/src/task_server/tools/task_attempts.rs` (drop post-call link) |
| 5 (S4a batch) | `crates/mcp/src/task_server/tools/batch.rs` (new), `crates/mcp/src/task_server/mod.rs` |
| 6 (S4b subscribe) | `crates/mcp/src/task_server/tools/subscribe.rs` (new), `crates/mcp/Cargo.toml` (potentially `reqwest-eventsource`), `crates/mcp/src/task_server/mod.rs` |

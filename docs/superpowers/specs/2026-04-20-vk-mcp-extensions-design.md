# VK MCP Orchestration Extensions — Master Design

**Status:** Draft v2 (Tier A++ — supersedes v1)
**Date:** 2026-04-20
**Author:** Claude (with phuongmumma35@hotmail.com)
**Predecessor:** PR #merged `0095e565` "MCP error transparency" (PR1 — extended `ApiResponseEnvelope` with `error_kind` + classifier on the MCP-deserialize side)

---

## 1. Goal

Enable **session-spawning-sessions** orchestration on Vibe Kanban: a *manager* MCP session can create persistent todo items and spawn child sessions to execute them, observe each child's status and output, and aggregate results.

Concretely, a manager prompt should be able to:

1. Create N persistent todos (visible in the VK UI, survives restarts).
2. Spawn one or more child workspaces per todo.
3. Poll child status with structured error info.
4. Read child session output without overflowing manager context.
5. Update todo status as children complete.

The current MCP surface supports step 2 only. Steps 1, 3, 4, 5 are blocked by missing or half-built capabilities.

## 2. Background — current friction

The Vibe Kanban MCP server (`crates/mcp/`) exposes 22 tools today (workspace start, session follow-up, issue/repo/project queries, etc.). Four gaps block the orchestration loop:

1. **Opaque executor failures.** PR1 plumbed `error_kind` *through* the MCP layer, but the server still buckets all `ExecutorError` variants as `ErrorInfo::internal("ExecutorError")` (`crates/server/src/error.rs:498`). Manager has no machine-readable signal to branch on (retry? abort? ask human?).
2. **No way to read child session output.** The MCP `get_execution` tool returns metadata only; `final_message` is hard-coded `None` (`crates/mcp/src/task_server/tools/sessions.rs:354`). Manager can spawn a child but cannot extract its results.
3. **Task entity is half-built.** `db::models::task::Task` exists with `parent_workspace_id` and `status` fields and is referenced by `Workspace.task_id`, but only `find_all` / `find_by_id` are implemented. No CRUD endpoint, no MCP wiring. Manager has nowhere to persist its todo list.
4. **No UI surface for manager-spawned tasks.** Even when the data exists, an observer cannot trace "which manager spawned which workspace via which task". Debugging orchestration failures becomes impossible.

## 3. Scope — Tier A++ (4 PRs)

### In scope

| PR  | Theme                              | Server | MCP | UI |
|-----|------------------------------------|--------|-----|----|
| **PR-X1** | Error transparency           | ✓      | ✓   |    |
| **PR-X2** | Read child session output    |        | ✓   |    |
| **PR-X3** | Task entity + composite tool + concurrency | ✓ | ✓ |  |
| **PR-X4** | UI surface for task tree     |        |     | ✓  |

### Out of scope

- MCP transport stability / heartbeat / reconnect (no concrete symptom yet — defer until reported).
- `batch_start` MCP tool (LLM tool-loop is naturally serial; per-parent concurrency limit in PR-X3 provides the back-pressure manager needs).
- SSE-based push subscription (`subscribe_session_events`) — polling `get_execution` is sufficient at LLM cadence.
- Project-level tag CRUD MCP wiring — independent feature, defer.
- Retrofitting the existing `/api/workspaces/start` + `/api/workspaces/{id}/links` two-call flow with a server-side transaction. The new `/api/tasks/start` endpoint in PR-X3 *is* atomic; the legacy two-call path remains as-is and is left to caller-side handling.
- Multi-level task nesting (Task → Task). Only Workspace → Task → Workspace is supported.
- Authentication / authorization changes.
- Remote (`crates/remote`) crate changes — local-deployment only.

### Dependency order

```
PR-X1 (error_kind object + stderr tail + get_execution status)
  ↓ shape consumed by
PR-X2 (read_session_messages)
  ↓ independent
PR-X3 (Task CRUD + create_and_start_task + concurrency limit)
  ↓ data model consumed by
PR-X4 (UI breadcrumb + grouping)
```

PRs land in the order X1 → X2 → X3 → X4. X2 can run in parallel with X3 if convenient.

---

## 4. PR-X1 — Error transparency

### 4.1 Problem

`ApiError::Executor(_)` collapses every `ExecutorError` variant to a single 500. PR1 added `error_kind` to the MCP-side `ApiResponseEnvelope` but the server's `ApiResponse<T,E>` (`crates/utils/src/response.rs:5`) still has only `{success, data, error_data, message}`. Manager receives `success: false` plus a free-text message and cannot programmatically decide what to do.

### 4.2 Design

**Server: `crates/utils/src/response.rs`**

Add an `error` object (replaces flat `error_kind` from earlier draft) carrying everything a manager needs to branch on:

```rust
#[derive(Debug, Serialize, Deserialize, TS)]
pub struct ApiResponse<T, E = T> {
    success: bool,
    data: Option<T>,
    error_data: Option<E>,
    message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    error: Option<ApiErrorEnvelope>,
}

#[derive(Debug, Serialize, Deserialize, TS)]
pub struct ApiErrorEnvelope {
    /// Stable machine-readable kind. Manager switches on this.
    pub kind: String,
    /// True if the same request can be retried unchanged.
    pub retryable: bool,
    /// True if no automated retry will help (auth, missing binary, etc.).
    pub human_intervention_required: bool,
    /// Optional last 2 KiB of executor stderr for diagnostic surfacing.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stderr_tail: Option<String>,
    /// Optional executor program name (e.g. "claude", "codex").
    #[serde(skip_serializing_if = "Option::is_none")]
    pub program: Option<String>,
}
```

**Server: `crates/server/src/error.rs`**

`ErrorInfo` gains `error: ApiErrorEnvelope`. The collapsed line 498 expands to a 5-kind taxonomy (deliberately small — extend later if a real consumer needs more granularity):

| `kind`                       | HTTP | `ExecutorError` source                              | retryable | human_intervention |
|------------------------------|------|-----------------------------------------------------|-----------|--------------------|
| `executor_not_found`         | 500  | `ExecutableNotFound`                                | false     | true               |
| `auth_required`              | 500  | `AuthRequired`                                      | false     | true               |
| `follow_up_not_supported`    | 500  | `FollowUpNotSupported`                              | false     | false              |
| `spawn_failed`               | 500  | `SpawnError` / `Io` / others not above              | true      | false              |
| `internal`                   | 500  | catch-all + non-executor errors                     | true      | false              |

**D1 — HTTP status stays 500 for all executor errors.** Manager switches on `error.kind`, not status code. Re-mapping to 401/424/409 changes the wire contract for existing clients with no benefit.

**D2 — Five kinds, not thirteen.** A small canonical set is easier to switch on. Other `ExecutorError` variants (`Json`, `TomlSerialize`, `CommandBuild`, etc.) map to `internal` until a real consumer needs them split out. Forward-compatible because `kind` is a string.

**Stderr tail capture (`crates/services/src/services/container.rs`)**

`ContainerService::start_execution` writes failures to `MsgStore` via `LogMsg::Stderr` but route handlers never see it. Add:

```rust
pub struct ExecutorFailureContext {
    pub error: ExecutorError,
    pub stderr_tail: Option<String>,   // ≤ 2048 bytes UTF-8, left-truncated with "…" prefix
    pub program: Option<String>,
}
```

`ApiError::Executor` becomes `Executor { source: ExecutorError, context: Option<ExecutorFailureContext> }`. A custom `From<ExecutorError>` keeps the `?` operator working with `context: None`.

**Enhance `get_execution` MCP tool**

Today `get_execution` returns metadata. Extend its response with `status: ExecutionProcessStatus` (already exists in db) and the same `error` envelope shape when status is `Failed`:

```rust
struct GetExecutionResponse {
    workspace_id: String,
    execution_id: String,
    status: ExecutionProcessStatus,                  // Running | Completed | Failed | Killed
    started_at: String,
    finished_at: Option<String>,
    error: Option<ApiErrorEnvelope>,                 // populated when status == Failed
}
```

Manager polls `get_execution`; when `status` is terminal it knows to stop polling and (if Failed) read `error.retryable` / `error.human_intervention_required`.

### 4.3 PR boundary

- `crates/utils/src/response.rs` — `ApiErrorEnvelope`, `ApiResponse.error` field
- `crates/server/src/error.rs` — `ErrorInfo.error`, expanded `ApiError::Executor` arm with 5-kind mapping; existing arms get `error.kind = error_type` and `retryable = true, human_intervention_required = false` defaults
- `crates/services/src/services/container.rs` — `ExecutorFailureContext`, capture stderr tail in `start_execution`
- `crates/server/src/routes/sessions/mod.rs` — `follow_up` handler propagates context
- `crates/server/src/routes/workspaces/create.rs` — `create_and_start_workspace` handler propagates context
- `crates/mcp/src/task_server/tools/sessions.rs` — `get_execution` returns `status` + `error`
- `shared/types.ts` regen via `pnpm run generate-types`
- Tests:
  - Unit: `ApiResponse::error_full` round-trips `error` envelope
  - Unit: each `ExecutorError` variant → expected `kind` + flags
  - Integration: simulate `ExecutableNotFound` → `kind: "executor_not_found", retryable: false, human_intervention_required: true` + stderr tail

Expected diff: ~500 LOC including tests.

---

## 5. PR-X2 — Read child session output

### 5.1 Problem

Manager spawns a child via `start_workspace`, polls until `status == Completed`, then needs to extract the result. `final_message: None` at `crates/mcp/src/task_server/tools/sessions.rs:354` is the dead end.

A naive "return the whole conversation" risks tens of thousands of tokens, blowing up the manager's context. Pagination + sensible defaults are mandatory.

### 5.2 Design

New MCP tool `read_session_messages`:

```rust
#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct ReadSessionMessagesRequest {
    #[schemars(description = "Workspace ID whose session to read.")]
    workspace_id: Uuid,
    #[schemars(description = "Number of messages to return from the tail. Default 20, max 200.")]
    last_n: Option<u32>,
    #[schemars(description = "Zero-based start index to read from. Overrides `last_n` when set.")]
    from_index: Option<u32>,
    #[schemars(description = "Include reasoning / thinking content. Default false to reduce token cost.")]
    include_reasoning: Option<bool>,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
struct ReadSessionMessagesResponse {
    messages: Vec<SessionMessage>,
    /// Total messages in the session (not just returned).
    total_count: u32,
    /// True if there are messages older than the returned window.
    has_more: bool,
    /// Convenience: text of the last assistant message in the session (full, not truncated).
    /// Most manager queries only need this — avoid parsing `messages` for the common case.
    final_assistant_message: Option<String>,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
struct SessionMessage {
    index: u32,
    role: String,                          // "user" | "assistant" | "tool" | "system"
    content: String,
    tool_calls: Option<serde_json::Value>, // structured if present
    timestamp: String,                     // RFC3339
}
```

**D3 — Default `last_n = 20`.** Manager's typical query is "did the child succeed and what did it say last?". Twenty messages covers most final exchanges with reasonable token cost (~2-5 KB).

**D4 — `final_assistant_message` is a separate field.** 99% of manager queries are "what did the child conclude". Surfacing it directly avoids forcing every manager to scan the `messages` array. Full text, never truncated — managers depend on completeness here.

**D5 — `include_reasoning = false` by default.** Reasoning blocks (Claude's thinking, etc.) can multiply token cost 3-10x. Off by default; manager opts in for deep debugging.

**Implementation:** the persisted message model is `CodingAgentTurn` (`crates/db/src/models/coding_agent_turn.rs:8`) with `find_by_execution_process_id` already available. Add a new server route `GET /api/sessions/{session_id}/messages?last_n=&from_index=&include_reasoning=` that returns the paginated payload above by joining the latest execution's turns. The MCP tool is a thin wrapper.

### 5.3 PR boundary

- `crates/mcp/src/task_server/tools/sessions.rs` — new tool `read_session_messages`
- `crates/server/src/routes/sessions/mod.rs` — new `GET /api/sessions/{id}/messages?last_n=&from_index=&include_reasoning=` route
- `shared/types.ts` regen
- Tests:
  - Unit: pagination math (`last_n` window, `from_index` override, `has_more` flag)
  - Unit: `final_assistant_message` extraction (handles empty session, last-message-is-tool-call, last-message-is-user)
  - Integration: spawn a small child → wait → read → assert `final_assistant_message` matches expected

Expected diff: ~300 LOC.

---

## 6. PR-X3 — Task entity + composite tool + concurrency

### 6.1 Problem

Three distinct gaps share one PR because they form a coherent unit:

1. **No persistent todo list.** `Task` entity has `find_all` / `find_by_id` only — no `create`, `update`, `delete`, no route, no MCP.
2. **Two-step main path.** Even with Task CRUD, "create todo + spawn child" requires `create_task` then `start_workspace(task_id=...)`. For 10 todos that's 20 RPCs and a non-trivial error recovery diamond.
3. **No back-pressure.** Manager could naively spawn 50 children at once, exhausting disk / process limits.

### 6.2 Design

**Server: Task CRUD endpoint**

```
POST   /api/tasks                          — create
GET    /api/tasks/{id}                     — get
PUT    /api/tasks/{id}                     — update (title, description, status)
DELETE /api/tasks/{id}                     — delete (cascades to clearing workspace.task_id)
GET    /api/tasks?parent_workspace_id=...  — list (filter by parent)
```

`Task::create`, `update`, `delete` added to `crates/db/src/models/task.rs` mirroring existing patterns in `workspace.rs`.

**Server: composite endpoint — atomic create-and-start**

```
POST /api/tasks/start
body: {
  task: { project_id, title, description?, parent_workspace_id? },
  workspace: { name?, repos: [...], executor_config, prompt },
}
response: { task_id, workspace_id, execution_id }
```

Single DB transaction wraps `{Task INSERT, Workspace INSERT, repo attaches, Workspace.task_id link}`. `start_execution` (which spawns the agent process) runs **after** transaction commit, so failure inside the transaction means nothing was spawned and rollback is clean.

**D6 — Atomic via DB transaction in this composite endpoint only.** The general `/api/workspaces/start` endpoint keeps its current behavior (no transaction wrapping with arbitrary post-creation operations). Only the new `/api/tasks/start` provides the atomicity guarantee. Other orphan windows are accepted as out-of-scope for this PR.

**Server: per-parent concurrency limit**

On `POST /api/tasks/start` and `POST /api/workspaces/start` (when called with a `task_id` whose task has `parent_workspace_id == Some(p)`), count workspaces `W` such that `W.task_id IS NOT NULL` AND `Task[W.task_id].parent_workspace_id == p` AND the latest `ExecutionProcess` for `W` has `status == Running`. If `count >= MAX_CHILDREN_PER_PARENT` (default 5, configurable via env `VK_MAX_CHILDREN_PER_PARENT`), reject with:

```
HTTP 429 + error: { kind: "parent_concurrency_exceeded", retryable: true, human_intervention_required: false }
```

Manager retries with exponential backoff (or waits for a polled child to finish, then retries).

**D7 — Limit enforced server-side, not MCP-side.** A future second MCP-using client (or direct API call) would bypass an MCP-side check. Server is the right authority.

**MCP tools — five new + one extended**

```rust
// New
create_and_start_task(...)          // primary path: composite atomic creation
create_task(...)                    // for "build todo list now, execute later"
list_tasks(parent_workspace_id?)    // defaults to current MCP session's workspace if available
get_task(task_id)
update_task_status(task_id, status) // status ∈ {todo, in_progress, in_review, done, cancelled}
delete_task(task_id)

// Extended (already exist)
start_workspace(..., task_id?)      // optional task_id binds a fresh attempt to an existing task
list_workspaces(..., task_id?)      // adds task_id filter to existing tool (`crates/mcp/src/task_server/tools/workspaces.rs:102`)
```

**D8 — `list_tasks` defaults to caller's workspace context.** When the MCP server has a known calling workspace (orchestrator launch mode — see `crates/mcp/src/task_server/tools/context.rs`), `list_tasks` without arguments filters to `parent_workspace_id == caller`. Manager naturally sees only its own todos. Explicit `parent_workspace_id` argument overrides. When the MCP server has no known calling workspace and no argument is given, return an error `kind: "missing_parent_workspace_id"` rather than dumping all tasks across the system (forces explicit scoping).

**D9 — Manager-side compensation NOT needed for `create_and_start_task`** (covered by server transaction in D6). For the standalone two-step path (`create_task` then `start_workspace(task_id=...)`), if `start_workspace` fails the manager can choose to retry or call `update_task_status(task_id, Cancelled)` — no automatic cleanup. Acceptable: user explicitly decided to use the two-step path, so the recovery semantics are theirs.

### 6.3 PR boundary

- `crates/db/src/models/task.rs` — `create`, `update`, `delete` methods
- `crates/server/src/routes/tasks/` (new module) — CRUD routes + `/start` composite + concurrency check
- `crates/server/src/routes/mod.rs` — wire `tasks::router()`
- `crates/services/src/services/task_concurrency.rs` (new) — counter + limit check (extracted for testability)
- `crates/mcp/src/task_server/tools/tasks.rs` (new) — 5 new tools
- `crates/mcp/src/task_server/tools/task_attempts.rs` — extend `start_workspace` with optional `task_id`
- `crates/mcp/src/task_server/tools/workspaces.rs` — extend `list_workspaces` with optional `task_id` filter
- `crates/mcp/src/task_server/mod.rs` — register new tool router
- `crates/api-types/src/lib.rs` — `TaskCreate`, `TaskUpdate`, `CreateAndStartTaskRequest`, `CreateAndStartTaskResponse`
- `shared/types.ts` regen
- Tests:
  - Unit: `Task::create` / `update` / `delete` happy path + constraint violations
  - Unit: concurrency check returns 429 at exactly `MAX_CHILDREN_PER_PARENT + 1`
  - Integration: `POST /api/tasks/start` with deliberately-invalid `repo_id` → no Task row remains (transaction rolled back)
  - Integration: spawn 6 children with `MAX = 5` → 6th gets `parent_concurrency_exceeded`

Expected diff: ~800 LOC.

---

## 7. PR-X4 — UI surface for task tree

### 7.1 Problem

Tier A++ creates rich data (manager workspace → tasks → child workspaces) but without UI surfacing it, debugging orchestration failures requires SQL access. A minimal UI delta makes orchestration **observable**.

### 7.2 Design

Two changes to `packages/web-core` (shared between `local-web` and `remote-web`):

**Change 1 — Workspace detail breadcrumb**

When a workspace has `task_id != null`, fetch the Task; when the Task has `parent_workspace_id != null`, fetch that workspace. Render at the top of the workspace detail view:

```
[Manager: <parent_workspace_name>] / [Task: <task_title>] / Attempt #<n>
```

Each segment is a link (parent workspace clickable to navigate up). If only one of the two relationships exists, render the available segment(s) only.

**Change 2 — Workspace list grouping toggle**

Add a "Group by manager" toggle in the workspace list header. When enabled:

- Workspaces with no `task_id` (or whose task has no `parent_workspace_id`) render under "Standalone"
- Workspaces with a manager parent group under "Manager: <parent_workspace_name>", collapsible

Default off (current flat list behavior preserved).

**D10 — Read-only UI, no editing.** This PR does not add task editing UI (rename, status change, delete). Those happen via MCP tools or direct API. UI is for **observability**. Editing UI is a follow-up if user demand surfaces.

### 7.3 PR boundary

- `packages/web-core/src/api/tasks.ts` (new) — TS client for Task GET endpoints (POST/PUT/DELETE not needed in UI)
- `packages/web-core/src/hooks/useTaskBreadcrumb.ts` (new) — fetches task + parent workspace given a workspace
- `packages/web-core/src/components/WorkspaceBreadcrumb.tsx` (new)
- `packages/web-core/src/components/WorkspaceList.tsx` — add `groupByManager` toggle + grouping logic
- `packages/local-web/src/...` — wire the breadcrumb into existing workspace detail page
- Tests: Vitest snapshot on breadcrumb component for {no task, task only, task + parent}

Expected diff: ~400 LOC.

---

## 8. Cross-cutting concerns

### 8.1 Type sharing

All new request/response types use `#[derive(Serialize, Deserialize, schemars::JsonSchema)]` for MCP. Types crossing into TS also derive `ts_rs::TS`. `pnpm run generate-types` runs at the end of each PR.

### 8.2 Testing strategy

- **Server:** unit tests next to handlers; integration tests in `crates/server/tests/` for flows touching DB transactions and concurrency limits.
- **MCP:** unit tests next to each tool file using the existing faked-HTTP-client pattern (see `crates/mcp/src/task_server/tools/mod.rs::tests::response_classification`).
- **Web:** Vitest co-located with components; no e2e harness changes.
- **Manual smoke:** each PR includes a documented manual smoke test in its PR description (e.g. "spawn child via Claude Code MCP → assert error_kind on auth failure").

### 8.3 Backward compatibility

- `ApiResponse.error` is `#[serde(skip_serializing_if = "Option::is_none")]` → existing clients see no change.
- All new MCP tools are additive. `start_workspace` gains an *optional* `task_id` field — no break.
- `get_execution` response gains `status` + `error` fields — additive.
- Task CRUD endpoints are net-new — no existing client code paths affected.
- UI changes are additive (new breadcrumb component, new optional toggle).

### 8.4 Push gate compliance

Per user policy: read-only by default; show diff before commit; **wait for explicit authorization before push**. Each PR pauses at `git push` for sign-off. No exceptions.

---

## 9. Decision log

| ID  | Decision                                                                              | Status   |
|-----|---------------------------------------------------------------------------------------|----------|
| D1  | Executor errors keep HTTP 500; manager switches on `error.kind`, not status           | Accepted |
| D2  | Five canonical `kind` values, not 13; extend later if a consumer needs split          | Accepted |
| D3  | `read_session_messages` default `last_n = 20`                                         | Accepted |
| D4  | `final_assistant_message` is a top-level convenience field, full text                 | Accepted |
| D5  | `include_reasoning = false` by default to control token cost                          | Accepted |
| D6  | Atomicity via DB transaction in the new `/api/tasks/start` only — not retrofit existing endpoints | Accepted |
| D7  | Concurrency limit enforced server-side, not MCP-side                                  | Accepted |
| D8  | `list_tasks` defaults to caller workspace's parent scope                              | Accepted |
| D9  | Two-step path (`create_task` + `start_workspace`) does not auto-cleanup on failure    | Accepted |
| D10 | UI is read-only in this campaign; editing UI deferred                                 | Accepted |

---

## 10. Items most likely to draw a flip request

These decisions are owner-callable; flagging the ones where pushback is most plausible:

- **D2** — five `kind` values may feel too coarse if you have a specific consumer needing `auth_required` separated from a more granular sub-kind. Easy to extend.
- **D3** — `last_n = 20` could be too small if your manager prompts expect long final messages with intermediate summaries. Tunable per-call already.
- **D6** — accepting that orphan windows in *other* endpoints remain unfixed is a deliberate trade-off; if you want full server-side atomicity across all workspace creations, that's a meaningfully bigger PR.
- **D10** — shipping read-only UI means humans cannot rename a manager-created task from the UI. If the manager mis-titles things, only re-running through MCP fixes it. Acceptable for v1.

If none of these need flipping, ack the spec and we go to writing-plans.

---

## Appendix A: Manager prompt pattern (reference)

A reference fragment showing how a manager prompt uses these tools end-to-end. **Not part of any PR** — purely for spec reviewers to validate that the API surface composes naturally.

```
You are an orchestrator session in Vibe Kanban. Your workspace ID is {self_workspace_id}.

On startup, recover state:
  1. tasks = list_tasks()                                          # defaults to parent_workspace_id == self
  2. for t in tasks where t.status == in_progress:
       workspaces = list_workspaces(task_id=t.id)
       latest = workspaces[0]                                      # already sorted desc by created_at
       e = get_execution(latest.id)
       if e.status in (Completed, Failed):
         resolve t (update_task_status accordingly)

For each new piece of work:
  1. result = create_and_start_task(
       task: { project_id, title: "...", description: "...", parent_workspace_id: {self} },
       workspace: { repos: [...], executor_config: {...}, prompt: t.description }
     )
  2. record (task_id, workspace_id) for polling

Polling loop:
  for (tid, wid) in pending:
    e = get_execution(wid)
    if e.status == Running: continue
    if e.status == Completed:
      msgs = read_session_messages(wid)              # default last_n=20
      summary = msgs.final_assistant_message
      update_task_status(tid, done)
    if e.status == Failed:
      if e.error.retryable and not e.error.human_intervention_required:
        retry up to 2 more times
      else:
        update_task_status(tid, cancelled)
        report e.error.kind + e.error.stderr_tail to user

Back-pressure:
  on parent_concurrency_exceeded: wait for next pending child to finish, then retry
```

---

## Appendix B: Files touched (per PR)

| PR    | Files |
|-------|-------|
| PR-X1 | `crates/utils/src/response.rs`, `crates/server/src/error.rs`, `crates/services/src/services/container.rs`, `crates/server/src/routes/sessions/mod.rs`, `crates/server/src/routes/workspaces/create.rs`, `crates/mcp/src/task_server/tools/sessions.rs`, `shared/types.ts` (regen) |
| PR-X2 | `crates/mcp/src/task_server/tools/sessions.rs`, (conditional) `crates/server/src/routes/sessions/mod.rs`, `shared/types.ts` (regen) |
| PR-X3 | `crates/db/src/models/task.rs`, `crates/server/src/routes/tasks/` (new), `crates/server/src/routes/mod.rs`, `crates/services/src/services/task_concurrency.rs` (new), `crates/mcp/src/task_server/tools/tasks.rs` (new), `crates/mcp/src/task_server/tools/task_attempts.rs` (extend `start_workspace`), `crates/mcp/src/task_server/mod.rs`, `crates/api-types/src/lib.rs`, `shared/types.ts` (regen) |
| PR-X4 | `packages/web-core/src/api/tasks.ts` (new), `packages/web-core/src/hooks/useTaskBreadcrumb.ts` (new), `packages/web-core/src/components/WorkspaceBreadcrumb.tsx` (new), `packages/web-core/src/components/WorkspaceList.tsx`, `packages/local-web/src/...` (wire breadcrumb into existing detail page) |

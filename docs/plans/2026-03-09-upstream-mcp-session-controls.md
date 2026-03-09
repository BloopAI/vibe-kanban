# Upstream MCP Session Controls Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在 `origin/main` 当前 MCP 新结构上，补齐可缺失的 session/execution control（会话/执行过程控制）能力，并保持对上游现有工具命名与路由结构兼容。

**Architecture:** 以 `crates/mcp/src/task_server/tools/sessions.rs` 为主实现面，不复制团队版旧 `TaskServer` 结构。优先增强现有 `run_session_prompt` 与 `get_execution`，再补 `get_session`、queue controls、execution stop、approval response` 等薄封装工具；底层直接复用现有 `/api/sessions/*`、`/api/execution-processes/*`、`/api/approvals/*` HTTP 入口。

**Tech Stack:** Rust, rmcp, axum HTTP routes, wiremock tests, TypeScript generated types, MDX docs.

---

### Task 1: Baseline MCP Session Tool Surface

**Files:**
- Modify: `crates/mcp/src/task_server/tools/sessions.rs`
- Modify: `docs/integrations/vibe-kanban-mcp-server.mdx`
- Test: `crates/mcp/src/task_server/tools/sessions.rs`

**Step 1: Read the current session tools and note the exact existing public API**

Confirm existing tools on `origin/main`:
- `create_session`
- `list_sessions`
- `run_session_prompt`
- `get_execution`

**Step 2: Write failing tests for missing control tools**

Add tests for:
- `get_session`
- `session_queue_message`
- `session_get_queue`
- `session_cancel_queue`
- `stop_execution`
- `respond_approval`

Each test should:
- Mock the expected backend endpoint
- Assert the MCP tool returns success/error correctly
- Use exact body assertions for POST tools

**Step 3: Run the tests and verify they fail for the right reason**

Run:

```powershell
cargo test -p mcp sessions -- --nocapture
```

Expected:
- compile errors for missing tools or
- test failures because tools are not yet registered

**Step 4: Implement the missing tools in `sessions.rs`**

Implement:
- thin request structs
- thin JSON payload builders
- shared executor normalization helper
- HTTP mapping to:
  - `GET /api/sessions/{session_id}`
  - `POST/GET/DELETE /api/sessions/{session_id}/queue`
  - `POST /api/execution-processes/{id}/stop`
  - `POST /api/approvals/{id}/respond`

**Step 5: Re-run the targeted tests**

Run:

```powershell
cargo test -p mcp sessions -- --nocapture
```

Expected:
- new tool tests pass

### Task 2: Enhance Existing Session Prompt / Execution Tools

**Files:**
- Modify: `crates/mcp/src/task_server/tools/sessions.rs`
- Test: `crates/mcp/src/task_server/tools/sessions.rs`

**Step 1: Write failing tests for enhanced `run_session_prompt`**

Cover:
- optional `executor`
- optional `variant`
- optional `model_id`
- optional `retry_process_id`
- empty prompt rejected
- orchestrator session rejected

**Step 2: Write failing tests for enhanced `get_execution`**

Cover:
- response includes `final_message` when execution has finished
- response still works for non-finished executions

**Step 3: Run tests and verify they fail**

Run:

```powershell
cargo test -p mcp run_session_prompt -- --nocapture
cargo test -p mcp get_execution -- --nocapture
```

Expected:
- missing fields or incorrect payload behavior

**Step 4: Implement minimal enhancements**

Change `run_session_prompt` to accept:
- `executor`
- `variant`
- `model_id`
- `retry_process_id`

Rules:
- if explicit executor config is absent, keep existing session executor fallback
- normalize executor names
- keep current upsteam naming; do not add parallel alias tools yet

Change `get_execution` to:
- resolve final assistant message/summary from the latest completed turn when possible
- keep current response shape and append `final_message`

**Step 5: Re-run targeted tests**

Run:

```powershell
cargo test -p mcp run_session_prompt -- --nocapture
cargo test -p mcp get_execution -- --nocapture
```

Expected:
- all new enhancement tests pass

### Task 3: Register / Document / Type Sync

**Files:**
- Modify: `crates/mcp/src/task_server/tools/mod.rs`
- Modify: `crates/mcp/src/task_server/handler.rs`
- Modify: `docs/integrations/vibe-kanban-mcp-server.mdx`
- Modify: `shared/types.ts` (generated or synchronized if needed)

**Step 1: Check whether new tools are automatically exposed**

If `#[tool_router]` on `sessions.rs` already registers them, avoid redundant code changes.

**Step 2: Update MCP server docs**

Document the final tool surface:
- `get_session`
- `session_queue_message`
- `session_get_queue`
- `session_cancel_queue`
- `stop_execution`
- `respond_approval`
- enhanced `run_session_prompt`
- enhanced `get_execution`

**Step 3: Sync generated/shared types only if the MCP surface depends on generated outputs**

Avoid touching unrelated generated files.

**Step 4: Verify docs and type changes are scoped**

Run:

```powershell
git diff -- docs/integrations/vibe-kanban-mcp-server.mdx shared/types.ts
```

Expected:
- only MCP-related wording or type deltas

### Task 4: Full Verification

**Files:**
- Verify only

**Step 1: Run package-level verification**

Run:

```powershell
cargo test -p mcp -- --nocapture
```

Expected:
- all MCP tests pass

**Step 2: Run dependent compile verification**

Run:

```powershell
cargo check -p mcp
cargo check -p server
```

Expected:
- no compile errors

**Step 3: Run a minimal real-session smoke test if backend is available**

Verify against local backend:
- create or list session
- run prompt
- queue / get / cancel
- stop execution

**Step 4: Commit**

```powershell
git add crates/mcp/src/task_server/tools/sessions.rs crates/mcp/src/task_server/tools/mod.rs crates/mcp/src/task_server/handler.rs docs/integrations/vibe-kanban-mcp-server.mdx shared/types.ts docs/plans/2026-03-09-upstream-mcp-session-controls.md
git commit -m "feat(mcp): add upstream session control tools"
```

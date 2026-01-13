# Vibe Kanban: Execution Removal Refactoring

**Goal:** Transform Vibe Kanban from an AI code execution orchestrator into a lightweight AI-managed kanban board where AI tools can manage tasks but NOT execute or write code.

## Executive Summary

**What we're removing:** All code execution functionality - AI agents should only manage the board (create issues, move cards, update status, add comments) without writing code.

**What we're keeping:**
- MCP Task Server (perfect for AI board management!)
- Task/Project CRUD operations
- Git operations for viewing diffs and historical data
- Kanban board UI
- Workspace/session viewing (historical data only)

---

## Phase 1: API Endpoint Removal ✅ COMPLETED

### Files Modified:
1. **`crates/server/src/routes/tasks.rs`**
2. **`crates/server/src/routes/sessions/mod.rs`**
3. **`crates/server/src/routes/task_attempts.rs`**

### Changes Made:

#### 1. Removed `/tasks/create-and-start` Endpoint
**Location:** `crates/server/src/routes/tasks.rs:143-247`

**What it did:**
- Created a new task
- Created a workspace with git worktree
- Started code execution immediately with selected AI agent

**Removed:**
```rust
// CreateAndStartTaskRequest struct
// create_task_and_start() async function
// Route: .route("/create-and-start", post(create_task_and_start))
```

**Impact:** Users/AI can still create tasks via `/tasks` POST, but cannot trigger execution.

#### 2. Removed `/sessions/{id}/follow-up` Endpoint
**Location:** `crates/server/src/routes/sessions/mod.rs:88-233`

**What it did:**
- Sent follow-up prompts to running AI agents
- Optionally retried failed execution processes
- Reset git worktrees to previous states

**Removed:**
```rust
// CreateFollowUpAttempt struct
// follow_up() async function
// Route: .route("/follow-up", post(follow_up))
```

**Impact:** No more iterative AI execution - agents can't be given follow-up instructions.

#### 3. Removed Dev Server Process Management
**Location:** `crates/server/src/routes/task_attempts.rs:339-363`

**What it did:**
- Stopped running dev servers when merging task changes
- Called `container.stop_execution()` for cleanup

**Removed:**
```rust
// Dev server finding and stopping loop
// ExecutionProcess::find_running_dev_servers_by_workspace()
// deployment.container().stop_execution() calls
```

**Impact:** No more dev server lifecycle management.

### Statistics:
- **Lines removed:** 814
- **Lines added:** 77 (mostly comments explaining removal)
- **Compilation status:** ✅ Clean, no errors

---

## Phase 2: Container Service Cleanup 🔄 IN PROGRESS

### Target File: `crates/services/src/services/container.rs` (~1200 lines)

This is the **core execution orchestration service**. It manages:
- Workspace/container lifecycle
- Execution process spawning and monitoring
- Git operations in worktrees
- Log streaming and normalization
- Setup/cleanup script execution

### Methods to Remove/Stub:

#### 🔴 High Priority - Core Execution Methods

1. **`start_workspace()`** (lines 883-983)
   - Creates container/worktree
   - Starts setup scripts
   - Launches initial coding agent execution
   - **Action:** Remove entirely

2. **`start_execution()`** (lines 985-1164)
   - Creates ExecutionProcess database record
   - Spawns executor subprocess
   - Sets up log streaming
   - Updates task status to InProgress
   - **Action:** Remove entirely

3. **`start_execution_inner()`** (line 575-580, trait method)
   - Abstract method for deployment-specific execution
   - **Action:** Remove from trait

4. **`stop_execution()`** (line 582-586, trait method)
   - Kills running execution processes
   - Updates database status
   - **Action:** Remove from trait

5. **`try_stop()`** (lines 533-566)
   - Helper to stop all workspace executions
   - **Action:** Remove

#### 🟡 Medium Priority - Supporting Execution Methods

6. **`has_running_processes()`** (lines 105-124)
   - Checks if task has active executions
   - **Action:** Always return `false` (no executions possible)

7. **`should_finalize()`** (lines 131-162)
   - Determines when to mark task complete after execution
   - **Action:** Remove (no execution = no finalization logic)

8. **`finalize_task()`** (lines 165-211)
   - Updates task status to InReview
   - Sends completion notifications
   - **Action:** Remove or simplify to manual status changes only

9. **`cleanup_orphan_executions()`** (lines 214-299)
   - Startup cleanup for crashed execution processes
   - **Action:** Keep for historical data cleanup, but disable new execution marking

10. **`try_start_next_action()`** (lines 1166-1197)
    - Chains sequential executor actions (setup → coding → cleanup)
    - **Action:** Remove entirely

11. **`cleanup_actions_for_repos()`** (lines 427-462)
    - Builds cleanup script execution chain
    - **Action:** Remove

12. **`setup_actions_for_repos()`** (lines 464-496)
    - Builds setup script execution chain
    - **Action:** Remove

13. **`setup_action_for_repo()`** (lines 498-510)
    - Creates single setup script action
    - **Action:** Remove

14. **`build_sequential_setup_chain()`** (lines 512-531)
    - Chains setup scripts together
    - **Action:** Remove

#### 🟢 Low Priority - Keep These (Viewing/Git Operations)

15. **`stream_diff()`** (lines 597-602)
   - Streams git diff for workspace
   - **Action:** ✅ KEEP - useful for viewing changes

16. **`stream_raw_logs()`** (lines 623-672)
   - Streams execution logs from database
   - **Action:** ✅ KEEP - historical viewing

17. **`stream_normalized_logs()`** (lines 674-807)
   - Streams parsed/normalized conversation logs
   - **Action:** ✅ KEEP - historical viewing

18. **`spawn_stream_raw_logs_to_db()`** (lines 809-881)
   - Archives logs to database during execution
   - **Action:** 🤔 Remove (no new executions) or keep for testing

19. **`get_msg_store_by_id()`** (lines 605-608)
   - Retrieves in-memory log store
   - **Action:** ✅ KEEP - historical data access

20. **`git_branch_prefix()`** (line 610, trait method)
   - Returns git branch naming prefix
   - **Action:** ✅ KEEP - still useful for workspaces

21. **`git_branch_from_workspace()`** (lines 612-621)
   - Generates branch name from workspace
   - **Action:** ✅ KEEP - workspace management

22. **`backfill_before_head_commits()`** (lines 301-351)
   - Backfills historical git commit data
   - **Action:** ✅ KEEP - historical data maintenance

23. **`backfill_repo_names()`** (lines 353-425)
   - Backfills repository name migrations
   - **Action:** ✅ KEEP - data migration

24. **`ensure_container_exists()`** (lines 568-571, trait method)
   - Creates git worktree for workspace
   - **Action:** ✅ KEEP - needed for viewing diffs

25. **`is_container_clean()`** (lines 573, trait method)
   - Checks if worktree has uncommitted changes
   - **Action:** ✅ KEEP - git operations

26. **`create()`** (line 98, trait method)
   - Creates new workspace container
   - **Action:** ✅ KEEP - workspace viewing

27. **`delete()`** (line 102, trait method)
   - Deletes workspace container
   - **Action:** ✅ KEEP - cleanup

28. **`kill_all_running_processes()`** (line 100, trait method)
   - Emergency stop for all processes
   - **Action:** Remove or stub (no processes to kill)

29. **`try_commit_changes()`** (line 588, trait method)
   - Commits workspace changes to git
   - **Action:** ✅ KEEP - manual git operations

30. **`copy_project_files()`** (lines 590-595, trait method)
   - Copies files into workspace
   - **Action:** Remove (no execution setup needed)

### Error Types to Update:

**Location:** `crates/services/src/services/container.rs:60-82`

```rust
#[derive(Debug, Error)]
pub enum ContainerError {
    #[error(transparent)]
    GitServiceError(#[from] GitServiceError),
    #[error(transparent)]
    Sqlx(#[from] SqlxError),
    #[error(transparent)]
    ExecutorError(#[from] ExecutorError),  // ❌ Remove - no executors
    #[error(transparent)]
    Worktree(#[from] WorktreeError),
    #[error(transparent)]
    Workspace(#[from] WorkspaceError),  // ❌ Remove - commented out
    #[error(transparent)]
    WorkspaceManager(#[from] WorkspaceManagerError),  // ❌ Remove - commented out
    #[error(transparent)]
    Session(#[from] SessionError),  // ❌ Remove - commented out
    #[error("Io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Failed to kill process: {0}")]
    KillFailed(std::io::Error),  // ❌ Remove - no processes
    #[error(transparent)]
    Other(#[from] AnyhowError),
}
```

### Imports to Remove:

Lines 11-39 contain many executor-related imports that are already commented out:
```rust
// use executors::{
//     actions::{...},
//     executors::{...},
//     logs::{...},
//     profile::{...},
// };
```

**Action:** Clean up commented imports entirely.

---

## Phase 3: Local Deployment Implementation 🔄 PENDING

### Target File: `crates/local-deployment/src/lib.rs`

This file implements the `ContainerService` trait for local execution. All the methods listed above need the same treatment in the implementation.

### Key Implementation Methods:

1. **`start_execution_inner()`** - Spawns local processes
2. **`stop_execution()`** - Kills local processes
3. **`create()`** - Creates git worktrees
4. **`kill_all_running_processes()`** - Emergency shutdown

**Strategy:**
- Remove execution spawning logic
- Keep worktree/git operations
- Stub methods that must exist for trait compliance

---

## Phase 4: Database Models 🔄 PENDING

### Files to Update:

1. **`crates/db/src/models/execution_process.rs`**
2. **`crates/db/src/models/session.rs`**
3. **`crates/db/src/models/workspace.rs`**

### Migration Already Applied ✅

**File:** `crates/db/migrations/20260108000001_soft_delete_execution_data.sql`

```sql
ALTER TABLE execution_processes ADD COLUMN archived BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE sessions ADD COLUMN archived BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE workspaces ADD COLUMN execution_disabled_note TEXT;

UPDATE execution_processes SET archived = TRUE;
UPDATE sessions SET archived = TRUE;
```

This marks all existing execution data as historical.

### Model Updates Needed:

1. **ExecutionProcess model:**
   - Add documentation: "HISTORICAL DATA ONLY - No new executions created"
   - Keep all read methods for viewing
   - Remove/deprecate `create()` method

2. **Session model:**
   - Add documentation: "HISTORICAL DATA ONLY"
   - Keep read methods
   - Remove execution-related create methods

3. **Workspace model:**
   - Keep everything (workspaces are still used for organizing tasks)
   - Add `execution_disabled_note` field usage

---

## Phase 5: Frontend Cleanup 🔄 PENDING

### Components to Remove (~50+ files):

#### 🔴 Execution UI Components

1. **Agent/Executor Selection:**
   - `frontend/src/components/AgentSelector.tsx`
   - `frontend/src/components/ExecutorConfigForm.tsx`
   - `frontend/src/components/settings/ExecutorProfileSelector.tsx`
   - `frontend/src/components/tasks/AgentSelector.tsx`
   - `frontend/src/components/tasks/ConfigSelector.tsx`

2. **Execution Logs/Conversation:**
   - `frontend/src/components/NormalizedConversation/` (entire directory)
     - `DisplayConversationEntry.tsx`
     - `EditDiffRenderer.tsx`
     - `FileChangeRenderer.tsx`
     - `FileContentView.tsx`
     - `NextActionCard.tsx`
     - `PendingApprovalEntry.tsx`
     - `RetryEditorInline.tsx`
     - `UserMessage.tsx`
   - `frontend/src/components/common/RawLogText.tsx`
   - `frontend/src/components/logs/VirtualizedList.tsx`

3. **Execution Dialogs:**
   - `frontend/src/components/dialogs/tasks/CreateAttemptDialog.tsx`
   - `frontend/src/components/dialogs/tasks/ViewProcessesDialog.tsx`
   - `frontend/src/components/dialogs/tasks/RestoreLogsDialog.tsx`

4. **Process/Session Management:**
   - Any "Start Execution" buttons
   - "Follow-up" prompt UI
   - Process status indicators
   - Dev server controls

#### 🟢 Keep These Components

1. **Kanban Board:**
   - `frontend/src/components/tasks/TaskCard.tsx`
   - `frontend/src/components/tasks/TaskCardHeader.tsx`
   - Task list/grid views

2. **Task Management:**
   - `frontend/src/components/dialogs/tasks/TaskFormDialog.tsx`
   - `frontend/src/components/dialogs/tasks/DeleteTaskConfirmationDialog.tsx`
   - `frontend/src/components/dialogs/tasks/TagEditDialog.tsx`

3. **Git Operations:**
   - `frontend/src/components/panels/DiffsPanel.tsx`
   - `frontend/src/components/diff/*` (diff viewing)
   - `frontend/src/components/dialogs/tasks/GitActionsDialog.tsx`
   - `frontend/src/components/dialogs/tasks/RebaseDialog.tsx`
   - `frontend/src/components/dialogs/tasks/CreatePRDialog.tsx`

4. **Project Management:**
   - `frontend/src/components/projects/*`
   - `frontend/src/components/dialogs/projects/*`

### Frontend API Calls to Remove:

Search for and remove:
```typescript
// API calls to removed endpoints
POST /api/tasks/create-and-start
POST /api/sessions/{id}/follow-up
POST /api/task-attempts/{id}/start
GET /api/execution-processes/*
```

### Frontend State Management:

Remove from stores/contexts:
- Execution process state
- Running processes tracking
- Log streaming state
- Agent/executor selection state

---

## Phase 6: Routes & Middleware Cleanup 🔄 PENDING

### Files to Review:

1. **`crates/server/src/routes/mod.rs`**
   - Check for any execution-related middleware
   - Verify all route removals are reflected

2. **`crates/server/src/routes/task_attempts.rs`** (~1140 lines)
   - Review all endpoints
   - Keep: Git operations (merge, rebase, diff)
   - Remove: Workspace creation for execution
   - Remove: Start execution endpoints

3. **`crates/server/src/routes/sessions/queue.rs`**
   - Review execution queue logic
   - Likely needs removal or simplification

### Endpoints to Keep:

```
✅ GET    /api/tasks
✅ POST   /api/tasks
✅ GET    /api/tasks/{id}
✅ PUT    /api/tasks/{id}
✅ DELETE /api/tasks/{id}
✅ GET    /api/projects
✅ POST   /api/projects
✅ GET    /api/task-attempts/{id}/diff
✅ POST   /api/task-attempts/{id}/merge
✅ POST   /api/task-attempts/{id}/rebase
✅ GET    /api/containers/attempt-context (for MCP)
```

### Endpoints to Remove:

```
❌ POST /api/tasks/create-and-start (DONE)
❌ POST /api/sessions/{id}/follow-up (DONE)
❌ POST /api/task-attempts/{id}/start
❌ POST /api/task-attempts/{id}/stop
❌ GET  /api/execution-processes/{id}
❌ POST /api/execution-processes/{id}/retry
```

---

## Phase 7: Dependencies Cleanup 🔄 PENDING

### Crates to Remove:

1. **`crates/executors/`** ✅ Already removed in previous commit
   - All executor implementations
   - MCP config management
   - Profile management
   - Action types

### Cargo.toml Updates:

**Workspace `Cargo.toml`:**
```toml
[workspace]
members = [
    "crates/db",
    "crates/deployment",
    # "crates/executors",  # ❌ Removed
    "crates/local-deployment",
    "crates/remote",
    "crates/server",
    "crates/services",
    "crates/utils",
]
```

**Dependencies to remove from `crates/services/Cargo.toml`:**
```toml
# executors = { path = "../executors" }  # ❌ Remove
```

**Dependencies to remove from `crates/server/Cargo.toml`:**
```toml
# executors = { path = "../executors" }  # ❌ Remove
```

**Dependencies to remove from `crates/local-deployment/Cargo.toml`:**
```toml
# executors = { path = "../executors" }  # ❌ Remove
```

---

## Phase 8: MCP Task Server Updates ✅ ALREADY PERFECT

### File: `crates/server/src/mcp/task_server.rs`

**Current Status:** This is already exactly what we want!

**MCP Tools Available:**
- ✅ `list_projects` - View all projects
- ✅ `list_repos` - View repositories in a project
- ✅ `list_tasks` - List tasks with filtering
- ✅ `create_task` - Create new tasks
- ✅ `get_task` - Get task details
- ✅ `update_task` - Update title/description/status
- ✅ `delete_task` - Delete tasks
- ✅ `get_context` - Get current workspace context

**No execution methods present!** This server is already board-management-only.

### MCP Server Description:

Current instruction already states the purpose:
```rust
"A task and project management server. If you need to create or update
tickets or tasks then use these tools. Most of them absolutely require
that you pass the `project_id` of the project that you are currently
working on."
```

**Action:** ✅ No changes needed - this is perfect!

---

## Testing Strategy 🔄 PENDING

### Backend Testing:

1. **Compilation:**
   ```bash
   cargo check --workspace
   cargo test --workspace
   ```

2. **API Endpoint Tests:**
   - ✅ Task CRUD still works
   - ✅ Project management works
   - ❌ Execution endpoints return 404
   - ✅ Git operations (diff/merge/rebase) work
   - ✅ MCP server tools work

3. **Database Tests:**
   - ✅ Can read historical execution data
   - ❌ Cannot create new execution processes
   - ✅ Workspaces can be created (for organization)

### Frontend Testing:

1. **UI Functionality:**
   - ✅ Kanban board renders
   - ✅ Can create/edit/delete tasks
   - ✅ Can move tasks between columns
   - ❌ No "Start Execution" buttons visible
   - ✅ Can view historical diffs
   - ✅ Can perform git merge/rebase

2. **MCP Integration:**
   - ✅ AI agents can create tasks via MCP
   - ✅ AI agents can update task status
   - ✅ AI agents can add descriptions
   - ❌ AI agents cannot trigger execution

### Integration Testing:

1. **Claude Code Integration:**
   ```bash
   # Test MCP server connection
   claude-code mcp connect vibe-kanban

   # Test board management
   claude-code "Create a task called 'Test Task' in project X"
   claude-code "Move task Y to in-progress status"
   claude-code "Add description to task Z"
   ```

2. **Verify No Code Changes:**
   - AI should NOT be able to modify repository files
   - AI should NOT be able to execute commands
   - AI should ONLY manage the kanban board

---

## Migration Path for Existing Users 🔄 PENDING

### Communication:

**Breaking Changes Announcement:**
```markdown
# Vibe Kanban v2.0: AI Board Management Only

## What's Changing

Vibe Kanban is transitioning from a code execution orchestrator to a
lightweight kanban board for AI task management.

## What You Can Still Do

✅ Manage tasks and projects
✅ Use AI agents to organize work (via MCP)
✅ View git diffs and history
✅ Merge/rebase completed work
✅ Collaborate with team members

## What's Being Removed

❌ AI code execution
❌ Agent orchestration
❌ Automated script running
❌ Dev server management

## Why This Change?

We're focusing on what developers actually need: a clean, simple board
that AI agents can help manage without the complexity of code execution.

## Migration Guide

1. Existing execution history is preserved (read-only)
2. Update to v2.0 via npm
3. Adjust workflows to use AI for board management only
4. Use your preferred tools for actual code changes

## Timeline

- Phase 1: API changes (current)
- Phase 2: Backend cleanup (in progress)
- Phase 3: Frontend update (coming soon)
```

### Data Migration:

All existing data is preserved:
- ✅ Tasks remain intact
- ✅ Projects remain intact
- ✅ Execution history viewable (archived)
- ✅ Git operations still work
- ✅ No data loss

---

## File Change Summary

### Files to Modify:

| File | Lines | Status | Priority |
|------|-------|--------|----------|
| `crates/services/src/services/container.rs` | ~1200 | 🔄 In Progress | 🔴 High |
| `crates/local-deployment/src/container.rs` | ~800 | 🔄 Pending | 🔴 High |
| `crates/server/src/routes/task_attempts.rs` | ~1140 | 🔄 Pending | 🔴 High |
| `crates/server/src/routes/tasks.rs` | ✅ Done | ✅ Complete | ✅ |
| `crates/server/src/routes/sessions/mod.rs` | ✅ Done | ✅ Complete | ✅ |
| `crates/db/src/models/execution_process.rs` | ~290 | 🔄 Pending | 🟡 Medium |
| `crates/db/src/models/session.rs` | ~100 | 🔄 Pending | 🟡 Medium |
| `frontend/src/components/AgentSelector.tsx` | ~200 | 🔄 Pending | 🔴 High |
| `frontend/src/components/NormalizedConversation/*` | ~1500 | 🔄 Pending | 🔴 High |
| `frontend/src/components/dialogs/tasks/CreateAttemptDialog.tsx` | ~300 | 🔄 Pending | 🔴 High |

### Estimated Effort:

- ✅ **Phase 1 (API Endpoints):** 2 hours → COMPLETE
- 🔄 **Phase 2 (Container Service):** 3-4 hours → IN PROGRESS
- 🔄 **Phase 3 (Local Deployment):** 2-3 hours → PENDING
- 🔄 **Phase 4 (Database Models):** 1-2 hours → PENDING
- 🔄 **Phase 5 (Frontend):** 4-6 hours → PENDING
- 🔄 **Phase 6 (Routes):** 2-3 hours → PENDING
- 🔄 **Phase 7 (Dependencies):** 1 hour → PENDING
- 🔄 **Phase 8 (Testing):** 2-3 hours → PENDING

**Total Estimated Time:** 17-24 hours

---

## Current Progress

### Commits:

1. ✅ **"Starting changing the execution functionality of vibe kanban"**
   - Removed entire `crates/executors/` crate
   - Database migration for archiving execution data
   - Initial cleanup of execution types

2. ✅ **"Remove code execution endpoints from API routes"**
   - Removed `/tasks/create-and-start`
   - Removed `/sessions/{id}/follow-up`
   - Removed dev server management
   - 814 lines removed, 77 added

### Current State:

- ✅ Backend compiles successfully
- ✅ API endpoints removed cleanly
- ✅ No blocking compilation errors
- 🔄 Container service needs cleanup
- 🔄 Frontend still has execution UI
- 🔄 Database models need documentation updates

---

## Next Steps (Immediate)

1. ✅ Create this summary document
2. 🔄 Continue with container.rs cleanup:
   - Remove execution methods
   - Keep git/worktree operations
   - Update trait definitions
3. 🔄 Update local-deployment implementation
4. 🔄 Start frontend component removal
5. 🔄 Update database model documentation
6. 🔄 Run comprehensive tests
7. 🔄 Update README and docs

---

## Questions to Address

1. **Should we keep execution history viewing?**
   - Proposal: Yes, as read-only for past work

2. **What about partial executions in progress?**
   - Proposal: Migration script marks all as "archived"

3. **Should workspaces still exist?**
   - Proposal: Yes, for organizing task attempts (without execution)

4. **How to handle existing users?**
   - Proposal: Clear migration guide + version bump to 2.0

5. **Keep MCP task server binary?**
   - Proposal: Yes! It's the main AI interface

---

## Success Criteria

### Must Have:
- ✅ No code execution possible via API
- ✅ AI agents can manage board via MCP
- ✅ Git operations still functional
- ✅ All historical data viewable
- ✅ Application compiles and runs
- ✅ Frontend renders without errors

### Nice to Have:
- Clear deprecation warnings for removed features
- Migration documentation
- Updated user guides
- Performance improvements from removed code

---

**Document Version:** 1.0
**Last Updated:** 2026-01-13
**Status:** Phase 2 In Progress

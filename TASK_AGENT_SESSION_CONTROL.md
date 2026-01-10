# Task: Agent Session Control on Task Status Changes

## Overview

Implement proper agent session lifecycle management when tasks are moved between kanban columns (status changes). Currently, only the task status is updated in the database - agent sessions continue running regardless of status changes.

## Background

### Current Behavior

When a card is dragged between columns in vibe-kanban:

1. `handleDragEnd` in `ProjectTasks.tsx` is triggered
2. Calls `tasksApi.update()` with new status
3. Backend updates task status in database
4. **No agent session control occurs**

### Existing Session Control Points

| Action | Current Behavior | Location |
|--------|------------------|----------|
| Merge (InReview → Done) | Stops dev servers | `task_attempts.rs::merge_task_attempt()` |
| Delete Task | Validates no running processes | `tasks.rs::delete_task()` |
| Stop Attempt | Stops execution | `task_attempts.rs::stop_task_attempt_execution()` |
| Other status changes | **No action** | - |

### Key Files

**Backend:**
- `crates/db/src/models/task.rs` - TaskStatus enum: `Todo`, `InProgress`, `InReview`, `Done`, `Cancelled`
- `crates/server/src/routes/tasks.rs` - Task update endpoint
- `crates/server/src/routes/task_attempts.rs` - Workspace/attempt management
- `crates/services/src/services/container.rs` - Container/process management

**Frontend:**
- `frontend/src/pages/ProjectTasks.tsx` - `handleDragEnd` function
- `frontend/src/hooks/useTaskMutations.ts` - Task mutation hooks

## Proposed Behavior

### Status Transition Matrix

| From | To | Proposed Action |
|------|-----|-----------------|
| Todo | InProgress | No change (agent starts when attempt is created) |
| InProgress | InReview | Stop running agent processes (keep dev server) |
| InProgress | Cancelled | Stop ALL running processes (including dev server) |
| InReview | Done | Already handled (stops dev servers on merge) |
| InReview | InProgress | No action (user can send follow-up to resume) |
| InReview | Cancelled | Stop ALL running processes |
| * | Todo | Stop ALL running processes (reset state) |

### Questions to Resolve

1. **InProgress → InReview**: Should the agent be stopped automatically, or should this just be a status marker?
2. **Resume from InReview**: Should moving back to InProgress trigger anything, or is manual follow-up sufficient?
3. **Cancelled state**: Should this be terminal (no restart), or recoverable?

## Implementation Plan

### Phase 1: Backend - Status Change Handler

1. **Create Status Transition Service** (`crates/services/src/services/task_status.rs`)
   ```rust
   pub struct TaskStatusService {
       container: Arc<dyn ContainerService>,
       pool: SqlitePool,
   }
   
   impl TaskStatusService {
       pub async fn handle_status_change(
           &self,
           task_id: Uuid,
           old_status: TaskStatus,
           new_status: TaskStatus,
       ) -> Result<(), Error> {
           match (old_status, new_status) {
               (_, TaskStatus::Cancelled) => self.stop_all_processes(task_id).await,
               (TaskStatus::InProgress, TaskStatus::InReview) => {
                   self.stop_agent_processes(task_id).await
               }
               (_, TaskStatus::Todo) => self.stop_all_processes(task_id).await,
               _ => Ok(()),
           }
       }
       
       async fn stop_agent_processes(&self, task_id: Uuid) -> Result<(), Error>;
       async fn stop_all_processes(&self, task_id: Uuid) -> Result<(), Error>;
   }
   ```

2. **Modify Task Update Endpoint** (`crates/server/src/routes/tasks.rs`)
   - Before updating status, capture old status
   - After update, call `TaskStatusService::handle_status_change()`

### Phase 2: Process Control Logic

Leverage existing methods in `ContainerService`:
- `try_stop(&workspace, include_dev_server)` - Stops processes for a workspace
- `stop_execution(&process, status)` - Stops specific process

New helper needed:
- `stop_all_task_processes(task_id)` - Find all workspaces for task, stop their processes

### Phase 3: Frontend Feedback

1. **Loading State**: Show spinner during status change if processes are being stopped
2. **Confirmation Dialog**: For Cancelled status, confirm user wants to stop running processes
3. **Toast Notifications**: "Agent processes stopped" when moving to InReview/Cancelled

## Files to Modify/Create

| File | Action | Description |
|------|--------|-------------|
| `crates/services/src/services/task_status.rs` | CREATE | Status transition logic |
| `crates/services/src/services/mod.rs` | MODIFY | Export task_status module |
| `crates/server/src/routes/tasks.rs` | MODIFY | Call status handler on update |
| `frontend/src/pages/ProjectTasks.tsx` | MODIFY | Add loading state for drag-drop |
| `frontend/src/hooks/useTaskMutations.ts` | MODIFY | Handle async status updates |

## Edge Cases

1. **Concurrent status changes**: Lock or queue status transitions per task
2. **Process stop failures**: Log but don't block status update
3. **Shared tasks**: Ensure remote sync still works after process stop
4. **Dev server lifecycle**: Only stop on Cancelled/Todo, preserve for InReview

## Testing Plan

1. **Unit tests**: Status transition service logic
2. **Integration tests**: 
   - Drag InProgress → InReview, verify agent stops
   - Drag * → Cancelled, verify all processes stop
   - Drag InReview → InProgress, verify no processes auto-start
3. **E2E tests**: Full UI flow with running agent

## Status

- [ ] Confirm desired behavior for each status transition
- [ ] Backend: Create TaskStatusService
- [ ] Backend: Integrate with task update endpoint
- [ ] Backend: Add process stopping logic
- [ ] Frontend: Add loading/confirmation states
- [ ] Testing: Unit and integration tests

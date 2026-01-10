# Pi Executor RPC Mode Implementation Plan

## Overview

Rewrite the Pi executor to use `--mode rpc` instead of `--mode json --print`. This enables bidirectional communication, proper session management, and follow-up message support via a single long-running process.

## Current Issues

1. **Event format mismatch**: Current `PiJsonEvent` enum doesn't match actual Pi JSON output
2. **No reply received**: Print mode works but event parsing fails due to format mismatch
3. **Follow-up broken**: Worktree detection error, plus print mode requires spawning new processes
4. **Session ID extraction**: Current code expects `session_id` in events, but Pi doesn't provide it that way

## Target Architecture

```
┌─────────────────┐     stdin      ┌─────────────────┐
│   Vibe Kanban   │ ─────────────► │                 │
│   Pi Executor   │                │   pi --mode rpc │
│                 │ ◄───────────── │                 │
└─────────────────┘     stdout     └─────────────────┘
                    (JSON events)
```

---

## Implementation Progress

### ✅ Phase 1: Update Event Types - COMPLETE

**Status**: Implemented and tested

**Files created**:
- `crates/executors/src/executors/pi/events.rs` - Complete RPC event types

**Summary**:
- Created `PiRpcEvent` enum with all event types matching actual Pi RPC output
- Created `AssistantMessageEvent` for nested message update events
- Created `ToolCallInfo`, `PiToolResult`, `ToolResultContent` helper types
- Created `PiStateData` for parsing get_state response
- Added comprehensive unit tests for event parsing (10 tests)

### ✅ Phase 2: Create RPC Client Module - COMPLETE

**Status**: Implemented

**Files created**:
- `crates/executors/src/executors/pi/rpc_client.rs` - RPC client for stdin communication

**Summary**:
- Created `PiRpcClient` with async methods for `send_prompt`, `abort`, `get_state`
- Client is clonable via `Arc<Mutex<ChildStdin>>` for interrupt handling
- Uses atomic counter for unique command IDs (`vk-1`, `vk-2`, etc.)

### ✅ Phase 3: Refactor Spawn Logic - COMPLETE

**Status**: Implemented

**Files modified**:
- `crates/executors/src/executors/pi/mod.rs` - Main executor module

**Summary**:
- Created `build_rpc_command_builder()` method using `--mode rpc`
- Added `--session-dir` for vibe-kanban-specific sessions
- Added `--no-extensions --no-skills` for cleaner automation output
- Created `spawn_pi_rpc()` function that returns `(AsyncGroupChild, PiRpcClient)`

### ✅ Phase 4: Update StandardCodingAgentExecutor Implementation - COMPLETE

**Status**: Implemented

**Summary**:
- `spawn()` sends initial prompt and requests state for session ID
- `spawn_follow_up()` uses `--session <path>` to resume sessions
- Both methods set up interrupt handling via `oneshot::channel`
- Interrupt spawns task to call `client.abort()` on signal

### ✅ Phase 5: Update Log Normalization - COMPLETE

**Status**: Implemented

**Files created**:
- `crates/executors/src/executors/pi/normalize.rs` - Log normalization logic

**Summary**:
- Parses `PiRpcEvent` from stdout JSON lines
- Handles `MessageUpdate` with text/thinking deltas
- Handles `ToolExecutionEnd` to finalize tool states
- Extracts session ID from `get_state` response
- Supports read, bash, edit, write tools plus generic fallback
- Note: `ToolStatus` doesn't have `Running` variant, so execution start is a no-op

### ✅ Phase 6: Session ID Handling - COMPLETE

**Status**: Implemented in normalize.rs

**Summary**:
- After spawn, `get_state()` is called to request session info
- In `normalize_logs`, `Response` events with `command == "get_state"` are parsed
- Session ID extracted from `data.sessionId` and pushed to `msg_store`

### ✅ Phase 7: Interrupt/Abort Support - COMPLETE

**Status**: Implemented in mod.rs

**Summary**:
- Both `spawn()` and `spawn_follow_up()` create interrupt channels
- Spawned task waits on interrupt signal and calls `client.abort()`
- `interrupt_sender` is returned in `SpawnedChild` for container to use

---

## Build Status

```
✅ cargo check -p executors - PASSES
✅ cargo test -p executors -- pi - 15 tests pass
✅ cargo check --workspace - PASSES
```

## Files Changed

| File | Status |
|------|--------|
| `crates/executors/src/executors/pi.rs` | **DELETED** (replaced by module) |
| `crates/executors/src/executors/pi/mod.rs` | **NEW** - Main executor |
| `crates/executors/src/executors/pi/events.rs` | **NEW** - Event types |
| `crates/executors/src/executors/pi/rpc_client.rs` | **NEW** - RPC client |
| `crates/executors/src/executors/pi/normalize.rs` | **NEW** - Log normalization |

---

## Next Steps: Integration Testing

The implementation is code-complete. Remaining work:

1. **Manual E2E testing**: 
   - Run Vibe Kanban with Pi executor
   - Verify initial prompt works and response displays
   - Verify follow-up prompts use session continuity
   - Test abort during execution

2. **Edge cases to verify**:
   - Session file creation/loading
   - Error handling for failed prompts
   - Tool result display (read, bash, edit, write)
   - Thinking output display

3. **Potential issues discovered**:
   - Extensions output (`extension_ui_request`) is filtered but may cause noise in logs
   - stderr includes extension loading errors when `--no-extensions` is used but extensions exist


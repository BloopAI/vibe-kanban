//! Database models for Vibe Kanban.
//!
//! # Electric SQL Integration (New)
//!
//! The following models support the new ElectricSQL-based sync:
//!
//! - [`log_entry`] - Row-level log storage (replaces JSONL in execution_process_logs)
//!
//! # Legacy Sync Models (Deprecated)
//!
//! The following models use polling/WebSocket-based sync and are being replaced:
//!
//! - [`cached_node`] - **DEPRECATED** - Will sync via Electric shapes
//!
//! See individual module documentation for migration guidance.

pub mod activity_dismissal;
pub mod activity_feed;
pub mod all_tasks;
pub mod dashboard;
pub mod draft;
pub mod execution_process;
pub mod execution_process_logs;
pub mod executor_session;
pub mod image;
pub mod label;
pub mod merge;
pub mod project;
pub mod task;
pub mod task_attempt;
pub mod task_variable;
pub mod template;
pub mod webhook;

// === Electric SQL Integration (New) ===
pub mod log_entry;

// === Legacy Sync Models (Deprecated) ===
// These are being replaced by Electric-based sync.
// Note: shared_task model is kept for backend services but the frontend no longer
// uses the shared_tasks WebSocket data or API routes. Table will be dropped in
// a future migration once ElectricSQL sync is complete.
pub mod cached_node;
pub mod shared_activity_cursor;

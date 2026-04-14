//! Service modules for Vibe Kanban.
//!
//! # Electric SQL Integration (New)
//!
//! The following modules provide ElectricSQL-based real-time sync:
//!
//! - [`electric_sync`] - Electric Shape API client for parsing NDJSON responses
//! - [`electric_task_sync`] - Task sync service using Electric shapes
//! - [`log_migration`] - Migration from legacy JSONL logs to row-based log_entries
//!
//! # Legacy Sync Modules (Deprecated)
//!
//! The following modules use WebSocket/REST-based sync and are being replaced:
//!
//! - [`share`] - **DEPRECATED** - Use `electric_task_sync` instead
//! - [`node_cache`] - **DEPRECATED** - Will be replaced by Electric node shapes
//!
//! See individual module documentation for migration guidance.

pub mod approvals;
pub mod assignment_handler;
pub mod auth;
pub mod config;
pub mod connection_token;
pub mod container;
pub mod diff_stream;
pub mod drafts;
pub mod events;
pub mod file_ranker;
pub mod file_search_cache;
pub mod filesystem;
pub mod filesystem_watcher;
pub mod git;
pub mod github;
pub mod github_sync;
pub mod hive_client;
pub mod hive_sync;
pub mod image;
pub mod log_batcher;
pub mod node_proxy_client;
pub mod node_runner;
pub mod normalization_metrics;
pub mod notification;
pub mod oauth_credentials;
pub mod pr_monitor;
pub mod process_inspector;
pub mod process_service;
pub mod project_detector;
pub mod remote_client;
pub mod terminal_session;
pub mod unified_logs;
pub mod variable_expander;
pub mod webhook;
pub mod worktree_manager;

// === Electric SQL Integration (New) ===
pub mod electric_sync;
pub mod electric_task_sync;
pub mod log_migration;

// === Legacy Sync Modules (Deprecated) ===
// These are being replaced by Electric-based sync
pub mod node_cache;
pub mod share;

//! Forge Branch Templates Extension
//!
//! This module contains the branch template functionality extracted from the upstream fork.
//! Provides services for managing custom branch naming patterns for tasks.

pub mod service;
pub mod types;

pub use service::BranchTemplateService;
pub use types::*;

// Re-export the key function for backwards compatibility
pub use service::generate_branch_name;

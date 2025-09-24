//! Forge Config Extension
//!
//! This module contains forge-specific configuration functionality.
//! For Task 2, this focuses on project-level config management and Omni integration.

pub mod service;
pub mod types;

pub use service::ForgeConfigService;
pub use types::*;

// Re-export Omni config for compatibility
pub use forge_omni::{OmniConfig, RecipientType};

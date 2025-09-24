//! Forge Omni Extension
//!
//! This module contains the Omni notification system extracted from the upstream fork.
//! Provides notification services for task completion and status updates.

pub mod client;
pub mod service;
pub mod types;

pub use client::OmniClient;
pub use service::OmniService;
pub use types::*;

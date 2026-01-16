//! GitHub integration services for Projects v2 and Issues.
//!
//! This module provides functionality to interact with GitHub Projects v2 via GraphQL API,
//! enabling synchronization between Vibe Kanban tasks and GitHub Issues.

pub mod graphql;
pub mod monitor;
pub mod projects;
pub mod sync;

pub use graphql::{GitHubGraphQL, GitHubGraphQLError};
pub use monitor::GitHubSyncMonitor;
pub use projects::{GitHubProjectsService, GitHubProjectsError};
pub use sync::{GitHubSyncService, GitHubSyncError};

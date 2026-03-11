//! API types shared between local and remote backends.
//!
//! This crate contains:
//! - Row types (e.g., `Issue`, `Project`) - the API representation of database entities
//! - Request types (e.g., `CreateIssueRequest`, `UpdateIssueRequest`) - API input types
//! - Shared enums (e.g., `IssuePriority`, `PullRequestStatus`)

use serde::{Deserialize, Deserializer};

pub mod attachment;
pub mod auth;
pub mod blob;
pub mod issue;
pub mod issue_assignee;
pub mod issue_comment;
pub mod issue_comment_reaction;
pub mod issue_follower;
pub mod issue_relationship;
pub mod issue_tag;
pub mod migration;
pub mod notification;
pub mod oauth;
pub mod organization_member;
pub mod organizations;
pub mod project;
pub mod project_status;
pub mod pull_request;
pub mod pull_requests_local;
pub mod relay;
pub mod response;
pub mod tag;
pub mod user;
pub mod workspace;
pub mod workspaces;

pub use attachment::*;
pub use auth::*;
pub use blob::*;
pub use issue::*;
pub use issue_assignee::*;
pub use issue_comment::*;
pub use issue_comment_reaction::*;
pub use issue_follower::*;
pub use issue_relationship::*;
pub use issue_tag::*;
pub use migration::*;
pub use notification::*;
pub use oauth::*;
pub use organization_member::*;
pub use organizations::*;
pub use project::*;
pub use project_status::*;
pub use pull_request::*;
pub use pull_requests_local::*;
pub use relay::*;
pub use response::*;
pub use tag::*;
pub use user::*;
pub use workspace::*;
pub use workspaces::*;

pub fn some_if_present<'de, D, T>(deserializer: D) -> Result<Option<T>, D::Error>
where
    D: Deserializer<'de>,
    T: Deserialize<'de>,
{
    T::deserialize(deserializer).map(Some)
}

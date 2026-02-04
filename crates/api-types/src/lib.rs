//! API types shared between local and remote backends.
//!
//! This crate contains:
//! - Row types (e.g., `Issue`, `Project`) - the API representation of database entities
//! - Request types (e.g., `CreateIssueRequest`, `UpdateIssueRequest`) - API input types
//! - Shared enums (e.g., `IssuePriority`, `PullRequestStatus`)

use serde::{Deserialize, Deserializer};

pub mod issue;
pub mod issue_assignee;
pub mod issue_comment;
pub mod issue_comment_reaction;
pub mod issue_follower;
pub mod issue_relationship;
pub mod issue_tag;
pub mod notification;
pub mod organization_member;
pub mod project;
pub mod project_status;
pub mod pull_request;
pub mod tag;
pub mod types;
pub mod user;
pub mod workspace;

pub use issue::*;
pub use issue_assignee::*;
pub use issue_comment::*;
pub use issue_comment_reaction::*;
pub use issue_follower::*;
pub use issue_relationship::*;
pub use issue_tag::*;
pub use notification::*;
pub use organization_member::*;
pub use project::*;
pub use project_status::*;
pub use pull_request::*;
pub use tag::*;
pub use types::*;
pub use user::*;
pub use workspace::*;

pub fn some_if_present<'de, D, T>(deserializer: D) -> Result<Option<T>, D::Error>
where
    D: Deserializer<'de>,
    T: Deserialize<'de>,
{
    T::deserialize(deserializer).map(Some)
}

//! Entity request/response types shared between local and remote backends.
//!
//! These types define the API contract for CRUD operations on entities.
//! They are used for serialization/deserialization and TypeScript generation.

use serde::{Deserialize, Deserializer};

pub mod issue;
pub mod issue_assignee;
pub mod issue_comment;
pub mod issue_comment_reaction;
pub mod issue_follower;
pub mod issue_relationship;
pub mod issue_tag;
pub mod notification;
pub mod project;
pub mod project_status;
pub mod tag;

// Re-export all types for convenient imports
pub use issue::*;
pub use issue_assignee::*;
pub use issue_comment::*;
pub use issue_comment_reaction::*;
pub use issue_follower::*;
pub use issue_relationship::*;
pub use issue_tag::*;
pub use notification::*;
pub use project::*;
pub use project_status::*;
pub use tag::*;

/// Deserializer for update request fields that wraps present values in Some().
/// Combined with #[serde(default)], this allows distinguishing:
/// - Field absent from JSON → None (via default)
/// - Field present (with any value, including null) → Some(value)
pub fn some_if_present<'de, D, T>(deserializer: D) -> Result<Option<T>, D::Error>
where
    D: Deserializer<'de>,
    T: Deserialize<'de>,
{
    T::deserialize(deserializer).map(Some)
}

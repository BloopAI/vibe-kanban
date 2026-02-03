//! Entity request/response types shared between local and remote backends.

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

pub fn some_if_present<'de, D, T>(deserializer: D) -> Result<Option<T>, D::Error>
where
    D: Deserializer<'de>,
    T: Deserialize<'de>,
{
    T::deserialize(deserializer).map(Some)
}

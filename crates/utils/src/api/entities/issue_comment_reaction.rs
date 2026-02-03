//! IssueCommentReaction entity request types.

use serde::Deserialize;
use ts_rs::TS;
use uuid::Uuid;

use super::some_if_present;

/// Request to create a new issue comment reaction.
#[derive(Debug, Clone, Deserialize, TS)]
#[ts(export)]
pub struct CreateIssueCommentReactionRequest {
    /// Optional client-generated ID. If not provided, server generates one.
    #[ts(optional)]
    pub id: Option<Uuid>,
    /// The comment being reacted to.
    pub comment_id: Uuid,
    /// The emoji reaction.
    pub emoji: String,
}

/// Request to update an existing issue comment reaction (partial update).
#[derive(Debug, Clone, Deserialize, TS)]
#[ts(export)]
pub struct UpdateIssueCommentReactionRequest {
    #[serde(default, deserialize_with = "some_if_present")]
    pub emoji: Option<String>,
}

/// Query parameters for listing issue comment reactions.
#[derive(Debug, Clone, Deserialize)]
pub struct ListIssueCommentReactionsQuery {
    pub comment_id: Uuid,
}

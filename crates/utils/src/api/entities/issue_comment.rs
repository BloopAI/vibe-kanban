//! IssueComment entity request types.

use serde::Deserialize;
use ts_rs::TS;
use uuid::Uuid;

use super::some_if_present;

/// Request to create a new issue comment.
#[derive(Debug, Clone, Deserialize, TS)]
#[ts(export)]
pub struct CreateIssueCommentRequest {
    /// Optional client-generated ID. If not provided, server generates one.
    #[ts(optional)]
    pub id: Option<Uuid>,
    /// The issue this comment belongs to.
    pub issue_id: Uuid,
    /// The comment message (markdown).
    pub message: String,
    /// Parent comment ID for replies.
    pub parent_id: Option<Uuid>,
}

/// Request to update an existing issue comment (partial update).
#[derive(Debug, Clone, Deserialize, TS)]
#[ts(export)]
pub struct UpdateIssueCommentRequest {
    #[serde(default, deserialize_with = "some_if_present")]
    pub message: Option<String>,
    #[serde(default, deserialize_with = "some_if_present")]
    pub parent_id: Option<Option<Uuid>>,
}

/// Query parameters for listing issue comments.
#[derive(Debug, Clone, Deserialize)]
pub struct ListIssueCommentsQuery {
    pub issue_id: Uuid,
}

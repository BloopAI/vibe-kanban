use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use uuid::Uuid;

use crate::some_if_present;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct IssueCommentReaction {
    pub id: Uuid,
    pub comment_id: Uuid,
    pub user_id: Uuid,
    pub emoji: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Deserialize, TS)]
pub struct CreateIssueCommentReactionRequest {
    /// Optional client-generated ID. If not provided, server generates one.
    /// Using client-generated IDs enables stable optimistic updates.
    #[ts(optional)]
    pub id: Option<Uuid>,
    pub comment_id: Uuid,
    pub emoji: String,
}

#[derive(Debug, Clone, Deserialize, TS)]
pub struct UpdateIssueCommentReactionRequest {
    #[serde(default, deserialize_with = "some_if_present")]
    pub emoji: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ListIssueCommentReactionsQuery {
    pub comment_id: Uuid,
}

#[derive(Debug, Clone, Serialize, TS)]
pub struct ListIssueCommentReactionsResponse {
    pub issue_comment_reactions: Vec<IssueCommentReaction>,
}

//! IssueCommentReaction entity request types.

use serde::Deserialize;
use ts_rs::TS;
use uuid::Uuid;

use super::some_if_present;

#[derive(Debug, Clone, Deserialize, TS)]
pub struct CreateIssueCommentReactionRequest {
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

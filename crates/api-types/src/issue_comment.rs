use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use uuid::Uuid;

use crate::some_if_present;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct IssueComment {
    pub id: Uuid,
    pub issue_id: Uuid,
    pub author_id: Option<Uuid>,
    pub parent_id: Option<Uuid>,
    pub message: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Deserialize, TS)]
pub struct CreateIssueCommentRequest {
    /// Optional client-generated ID. If not provided, server generates one.
    /// Using client-generated IDs enables stable optimistic updates.
    #[ts(optional)]
    pub id: Option<Uuid>,
    pub issue_id: Uuid,
    pub message: String,
    pub parent_id: Option<Uuid>,
}

#[derive(Debug, Clone, Deserialize, TS)]
pub struct UpdateIssueCommentRequest {
    #[serde(default, deserialize_with = "some_if_present")]
    pub message: Option<String>,
    #[serde(default, deserialize_with = "some_if_present")]
    pub parent_id: Option<Option<Uuid>>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ListIssueCommentsQuery {
    pub issue_id: Uuid,
}

#[derive(Debug, Clone, Serialize, TS)]
pub struct ListIssueCommentsResponse {
    pub issue_comments: Vec<IssueComment>,
}

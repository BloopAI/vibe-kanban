use serde::{Deserialize, Serialize};
use ts_rs::TS;
use uuid::Uuid;

use crate::some_if_present;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct IssueTag {
    pub id: Uuid,
    pub issue_id: Uuid,
    pub tag_id: Uuid,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct CreateIssueTagRequest {
    /// Optional client-generated ID. If not provided, server generates one.
    /// Using client-generated IDs enables stable optimistic updates.
    #[ts(optional)]
    pub id: Option<Uuid>,
    pub issue_id: Uuid,
    pub tag_id: Uuid,
}

#[derive(Debug, Clone, Deserialize, TS)]
pub struct UpdateIssueTagRequest {
    #[serde(default, deserialize_with = "some_if_present")]
    pub tag_id: Option<Uuid>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ListIssueTagsQuery {
    pub issue_id: Uuid,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct ListIssueTagsResponse {
    pub issue_tags: Vec<IssueTag>,
}
